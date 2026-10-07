import * as acorn from "acorn";
import Interpreter, {
  InterpreterFunction,
  InterpreterObject,
  InterpreterPseudoValue
} from "js-interpreter";

import { createTypedEventEmitter } from "src/api/util";

import {
  PseudoTranslator,
  mapErrorStack,
  pseudoToNativeRespectingPropDescriptors
} from "./Bindings";
import { SourceMapping } from "./SourceMapping";
import {
  BaseExternalContext,
  JSRunnerAPI,
  JSRunnerConsoleOutput,
  JSRunnerCtx,
  JSRunnerEventTypes,
  JSRunnerNativeModule,
  JSRunnerPseudoModuleResolver
} from "./api";
import promisePolyfill from "./promise-polyfill.txt";
import { processES6ModuleRequire } from "./stackOps";
import { transpileToES5 } from "./transpile";
import {
  delay,
  isPrimitiveValue,
  patchUnwindReturnBug,
  wrapLastProgramExpressionInConsoleLog,
  zeroASTLocations
} from "./util";

// Patch bug in js-interpreter.
patchUnwindReturnBug();

// This is arguably not great to do at require time, but speeds things up later.
const promisePolyfillAST = acorn.parse(
  promisePolyfill,
  Interpreter.PARSE_OPTIONS
);
zeroASTLocations(promisePolyfillAST);

// AST nodes to ignore in line-by-line traversal.
const astContainerTypes: Record<string, true> = {
  Program: true,
  BlockStatement: true
};

const browserMinTimeoutMs = 4;

export class JSRunner<T extends BaseExternalContext = BaseExternalContext>
  implements JSRunnerAPI<T>
{
  public readonly interpreter: Interpreter;
  public readonly ctx: JSRunnerCtx<T>;
  public readonly translate: PseudoTranslator;
  public readonly externalCtx?: T;
  public readonly events = createTypedEventEmitter<JSRunnerEventTypes>();
  public readonly modules: Record<string, JSRunnerNativeModule<T>> = {};
  public moduleResolver?: JSRunnerPseudoModuleResolver<T>;
  public transpiling = false;
  public currentLine: number = -1;
  public logLines: JSRunnerConsoleOutput[] = [];
  public logLength = 100;
  public logErrors = true;
  public error?: Error;
  public errorColor: string = "#ff0000";
  public speed = 1;
  public outstandingPromiseCount = 0;
  private sourceMapping?: SourceMapping;
  private running = false;
  private paused = false;
  private terminated = false;
  private debug = false;
  private lastRunPsuedoResult?: InterpreterPseudoValue;
  constructor(externalCtx?: T) {
    this.ctx = {
      ioc: {
        mapping: new Map()
      },
      ...externalCtx,
      runner: this
    } as unknown as JSRunnerCtx<T>;
    this.translate = new PseudoTranslator(this);
    this.externalCtx = externalCtx;
    this.interpreter = new Interpreter("");
    this.interpreter.appendCode(promisePolyfillAST);
    this.interpreter.run();
    setupConsole(this);
    setupRequire(this);
  }
  async transpileAndAppendES6(
    code: string,
    applySourceMap: boolean = true,
    transformToLog: boolean = false
  ) {
    this.transpiling = true;
    this.events.emit("transpileStarted");
    try {
      const transpiled = await transpileToES5(code);
      // Console log wrapping for interactive console.
      if (transformToLog)
        wrapLastProgramExpressionInConsoleLog(transpiled.transpiledAST);
      this.appendRawES5(transpiled.transpiledAST, !applySourceMap);
      if (applySourceMap) this.setSourceMapping(transpiled.sourceMapping);
    } catch (err) {
      let errToHandle = err as Error;
      // Swollow stack on known error types expected to come from Babel.
      if (err instanceof SyntaxError) {
        delete err.stack;
      }
      this.error = errToHandle;
      this.events.emit("error", errToHandle);
      this.appendLogError(errToHandle, false);
    }
    this.transpiling = false;
    this.events.emit("transpileFinished");
  }
  appendRawES5(code: string | acorn.Program, zeroLocations: boolean) {
    // Clear out any current top-level error; we're getting new code from
    // either initial module initialization or the console.
    if (this.error) this.error = undefined;
    if (typeof code === "string") {
      const parsedCode = acorn.parse(code, Interpreter.PARSE_OPTIONS);
      this.appendRawES5(parsedCode, zeroLocations);
      return;
    }
    if (zeroLocations) zeroASTLocations(code);
    this.interpreter.appendCode(code);
  }
  setSourceMapping(sourceMapping: SourceMapping) {
    this.sourceMapping = sourceMapping;
  }
  resolveSourceLineFromASTPositions(
    positions: [number, number][]
  ): number | null {
    if (!this.sourceMapping) return null;
    for (const [start, end] of positions) {
      const line = this.sourceMapping.getLine(start, end);
      if (line !== null) return line;
    }
    return null;
  }
  appendLog(value: unknown, isError?: boolean) {
    if (this.logLength <= 0) return;
    const valueIsPrimitive = isPrimitiveValue(value);
    const logLine: JSRunnerConsoleOutput = {
      primitiveValue: valueIsPrimitive ? value : undefined,
      objectValue:
        !valueIsPrimitive && typeof value === "object"
          ? (value as JSRunnerConsoleOutput["objectValue"])
          : undefined
    };
    if (isError) logLine.type = "error";
    while (this.logLines.length >= this.logLength) {
      this.logLines.shift();
    }
    this.logLines.push(logLine);
    this.events.emit("consoleLog", logLine);
  }
  appendLogError(value: unknown, doSourceMap = true) {
    if (this.debug) console.error("[JSRunner]: Unhandled error", value);
    if (!this.logErrors) return;
    if (isPrimitiveValue(value)) {
      this.appendLog(value, true);
    } else {
      if (value instanceof Error) {
        if (value.stack && this.sourceMapping && doSourceMap) {
          const revisedStack = mapErrorStack(value.stack, this.sourceMapping);
          this.appendLog(revisedStack, true);
          return;
        }
        this.appendLog(value.stack ?? value.message, true);
        return;
      }
      const valueAsRecord = value as Record<string, unknown>;
      const message = valueAsRecord.message;
      const rawStack = valueAsRecord.stack;
      if (typeof message === "string" && typeof rawStack === "string") {
        const revisedStack =
          this.sourceMapping && doSourceMap
            ? mapErrorStack(rawStack, this.sourceMapping)
            : rawStack;
        this.appendLog(revisedStack, true);
        return;
      }
      this.appendLog(value, true);
    }
  }
  queueTask(value: InterpreterFunction, ...args: InterpreterPseudoValue[]) {
    this.interpreter.createTask_(false, [value, 0, ...args]);
  }
  hasNextStep(sync: boolean): boolean {
    const interpreter = this.interpreter;
    // Interpreter is blocked on asynchronous logic.
    if (interpreter.paused_) return !sync;
    const exState = interpreter.stateStack.at(-1);
    if (
      exState === undefined ||
      (exState.node.type === "Program" && exState.done)
    ) {
      // If we're in the main program block and it is done, check for tasks.
      // If there's a task, check return true. If not, check outstanding Promises.
      const currentTask = interpreter.tasks.at(0);
      if (currentTask === undefined) {
        return this.outstandingPromiseCount > 0;
      }
      if (currentTask.time <= Date.now()) return true;
      return !sync;
    }
    return true;
  }
  getCurrentLine() {
    return this.currentLine;
  }
  doCurrentLine(): boolean {
    const result = this._doCurrentLine();
    this.events.emit("executionProgress", this.currentLine);
    return result;
  }
  private _doCurrentLine(maxSteps: number = 1000): boolean {
    const interpreter = this.interpreter;
    const sourceMapping = this.sourceMapping;
    let steps = 0;
    let didAnything = false;
    try {
      while (this.hasNextStep(true) && steps++ < maxSteps) {
        // Interpreter is blocked on asynchronous logic.
        if (interpreter.paused_) return didAnything;
        const stepped = interpreter.step();
        if (!stepped) return didAnything;
        didAnything = true;
        const exState = interpreter.stateStack.at(-1);
        if (exState === undefined || exState.node.type === "Program") continue;
        const exNode = exState.node;
        if (exNode.start === 0 || astContainerTypes[exNode.type]) continue;
        if (sourceMapping !== undefined) {
          const line = sourceMapping.getLine(exNode.start, exNode.end);
          if (line !== null && line !== this.currentLine) {
            this.currentLine = line;
            return true;
          }
        }
      }
    } catch (err) {
      if (this.debug) console.error("[JSRunner]: Received error", err);
      const errAsError =
        err instanceof Error
          ? err
          : typeof err === "string"
            ? new Error(`[JSRunner]: Received string as error: "${err}".`)
            : new Error("[JSRunner]: Invalid error thrown by interpreter.");
      this.error = errAsError;
      // Resolve source line from AST position metadata attached by the
      // patched unwind method, and store it on the error for downstream use.
      const errAny = errAsError as any;
      if (Array.isArray(errAny.__astPositions)) {
        const resolvedLine = this.resolveSourceLineFromASTPositions(
          errAny.__astPositions
        );
        if (resolvedLine !== null) {
          errAny.__sourceLine = resolvedLine;
        }
      }
      if (err instanceof Error && err.stack && this.sourceMapping) {
        err.stack = mapErrorStack(err.stack, this.sourceMapping);
      }
      this.events.emit("error", errAsError);
      this.appendLogError(err, false);
      this.running = false;
      return didAnything;
    }
    return didAnything;
  }
  isRunning() {
    return this.running;
  }
  isPaused() {
    return this.paused;
  }
  pause() {
    this.paused = true;
  }
  unpause() {
    this.paused = false;
  }
  async run() {
    if (this.terminated)
      throw new Error("[JSRunner]: Script execution already terminated.");
    if (this.running) throw new Error("[JSRunner]: Already running.");
    this.running = true;
    this.events.emit("executionStarted");
    const outputMapper = getOutputMappingFunction(this.interpreter);
    try {
      let extraElapsedMs = 0;
      while (this.hasNextStep(false)) {
        if (!this.running) return;
        const linesPerMs = this.speed;
        // If paused, wait around for a little while.
        if (this.paused || linesPerMs <= 0) {
          await delay(
            Math.max(
              browserMinTimeoutMs,
              Math.min(10, Math.floor(1 / this.speed))
            )
          );
          extraElapsedMs = 0;
          continue;
        }
        // Calculate the time to delay - browsers have a minimum time
        // delay of 4ms to avoid event loop congestion, but this actually
        // hurts us within the worker process.
        const delayMs = Math.max(
          browserMinTimeoutMs,
          Math.floor(1 / linesPerMs) - extraElapsedMs
        );
        const startMs = Date.now();
        const rawLinesPerTick = Math.floor(
          linesPerMs * (browserMinTimeoutMs + extraElapsedMs)
        );
        const linesPerTick = rawLinesPerTick >= 1 ? rawLinesPerTick : 1;
        let prevLine = this.currentLine;
        for (let li = 0; li < linesPerTick; li++) {
          this._doCurrentLine();
        }
        if (prevLine !== this.currentLine)
          this.events.emit("executionProgress", this.currentLine);
        await delay(delayMs);
        const endMs = Date.now();
        extraElapsedMs = Math.max(0, endMs - startMs - delayMs);
      }
    } catch (err) {
      this.running = false;
      console.error("[JSRunner]: Unhandled runtime exception", err);
      this.events.emit(
        "executionFinished",
        outputMapper(this.interpreter.value)
      );
      this.events.emit(
        "error",
        err instanceof Error ? err : new Error(`${err}`)
      );
      throw err;
    }
    this.running = false;
    this.lastRunPsuedoResult = this.interpreter.value;
    const finalResult = outputMapper(this.interpreter.value);
    this.events.emit("executionFinished", finalResult);
    return finalResult;
  }
  terminate() {
    if (!this.running) return;
    this.running = false;
    this.terminated = true;
    this.events.emit("executionTerminated");
  }
  encapsulateAndThrow(errOrMsg: Error | string) {
    const err = errOrMsg instanceof Error ? errOrMsg : new Error(errOrMsg);
    const pseudoErr = this.interpreter.createObject(this.interpreter.ERROR);
    try {
      this.interpreter.populateError(pseudoErr, err.message ?? "error");
      this.interpreter.throwException(pseudoErr);
    } catch (err) {
      // Swollow STEP_ERRORs, record everything else an an error.
      if (err !== Interpreter.STEP_ERROR) {
        this.error = err as Error;
        this.events.emit("error", this.error);
      }
    }
  }
  incrementOutstandingPromises(count: number) {
    this.outstandingPromiseCount += count;
  }
  getLastPseudoResult() {
    return this.lastRunPsuedoResult;
  }
}

function getOutputMappingFunction(interpreter: Interpreter) {
  return function mapPseudoObjectToNative(val: InterpreterPseudoValue) {
    const result = pseudoToNativeRespectingPropDescriptors(interpreter, val);
    // Errors have their messages attached as nonenumerable descriptors
    // for some reason, so manually check for that.
    if (
      !isPrimitiveValue(val) &&
      typeof result === "object" &&
      result !== null &&
      Object.keys(result).length === 0
    ) {
      let message: unknown;
      let stack: unknown;
      if (interpreter.isa(val, interpreter.ERROR)) {
        message = interpreter.getProperty(val, "message");
        stack = interpreter.getProperty(val, "stack");
      }
      if (message || stack) {
        const msgAsError = result as Record<string, unknown>;
        msgAsError.message = message ?? "Error";
        msgAsError.stack = stack;
        return msgAsError;
      }
    }
    return result;
  };
}

function setupConsole<T extends BaseExternalContext>(runner: JSRunner<T>) {
  const interpreter = runner.interpreter;
  const mapOutput = getOutputMappingFunction(interpreter);
  function nativeLog(...input: InterpreterPseudoValue[]) {
    const nativeInput = input.map(mapOutput);
    if (nativeInput.length === 1) {
      runner.appendLog(nativeInput[0]);
      return;
    }
    runner.appendLog(nativeInput);
    return;
  }
  function nativeError(...input: InterpreterPseudoValue[]) {
    const nativeInput = input.map(mapOutput);
    if (nativeInput.length === 1) {
      runner.appendLogError(nativeInput[0]);
      return;
    }
    runner.appendLogError(nativeInput);
    return;
  }
  const pseudoConsole = interpreter.nativeToPseudo({}) as InterpreterObject;
  interpreter.setProperty(
    pseudoConsole,
    "log",
    interpreter.createNativeFunction(nativeLog)
  );
  interpreter.setProperty(
    pseudoConsole,
    "error",
    interpreter.createNativeFunction(nativeError)
  );
  interpreter.setProperty(
    pseudoConsole,
    "warn",
    interpreter.createNativeFunction(nativeError)
  );
  interpreter.setProperty(
    interpreter.getGlobalScope().object,
    "console",
    pseudoConsole
  );
}

const _setupModuleExportsES5 = `
var module = {};
var exports = {};
module.exports = exports;
`;

function setupRequire<T extends BaseExternalContext>(runner: JSRunner<T>) {
  const interpreter = runner.interpreter;
  const requireCache: Record<string, InterpreterPseudoValue> = {};
  async function nativeRequire(input: unknown, cb: (value: unknown) => void) {
    try {
      if (typeof input !== "string")
        throw new Error("require(string) only accepts strings.");
      if (requireCache[input] !== undefined) {
        cb(requireCache[input]);
        return;
      }
      const nativeModule = runner.modules[input];
      if (nativeModule === undefined) {
        if (runner.moduleResolver !== undefined) {
          const rawModuleCode = await runner.moduleResolver(runner.ctx, input);
          if (rawModuleCode !== undefined) {
            // TODO: Add resulting modules to the require cache.
            processES6ModuleRequire(runner, input, rawModuleCode);
            return;
          }
        }
        throw new Error(`require: module "${input}" not found.`);
      }
      const pseudoModule = await nativeModule.requirePseudo(runner.ctx);
      requireCache[input] = pseudoModule;
      cb(pseudoModule);
    } catch (err) {
      cb(undefined);
      runner.encapsulateAndThrow(err as Error | string);
    }
  }
  interpreter.setProperty(
    interpreter.getGlobalScope().object,
    "require",
    interpreter.createAsyncFunction(nativeRequire)
  );

  // While we're in here, set the global module property.
  interpreter.setProperty(
    interpreter.getGlobalScope().object,
    "module",
    interpreter.nativeToPseudo({
      name: "main"
    })
  );
}
