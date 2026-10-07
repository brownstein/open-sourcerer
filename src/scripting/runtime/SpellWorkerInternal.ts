import shortid from "shortid";

import { TypedEventEmitter, createTypedEventEmitter } from "src/api/util";
import { DeferredEmitter } from "src/engine/util/deferredEmitter";

import { pseudoToNativeRespectingPropDescriptors } from "../core/Bindings";
import { JSRunner } from "../core/JsRunner";
import { JSRunnerConsoleOutput } from "../core/api";
import { computeAutocomplete } from "../core/autocomplete";
import { computeImports } from "../core/computeImports";
import { pseudoModulesAuto } from "../modules/autoPseudoModules";
import { SpellEntitySyncPseudo } from "./SpellEntitySync";
import { UntypedRPCHandler } from "./SpellRuntimeAPI";
import * as API from "./SpellWorkerAPI";
import * as ModuleAPI from "./SpellWorkerModuleAPI";

type SpellWorkerHandlerEvents = {
  resolveModuleCode: API.ModuleCodeResolutionResponseMessage;
  nativeRPCResponse: API.ModuleRPCResponseMessage;
  syncResponse: API.SyncEntitiesMessage;
};

type RunnerInfo = {
  runner: JSRunner<ModuleAPI.SpellPseudoRuntimeCtx>;
  runnerHasCode?: boolean;
  moduleEvents: Record<
    string,
    TypedEventEmitter<ModuleAPI.SpellPseudoRuntimeCTXEvents>
  >;
  headlessModuleInitializers: Record<string, DeferredEmitter>;
  headlessModuleRPCHandlers: Record<string, UntypedRPCHandler>;
  sync: SpellEntitySyncPseudo;
};
export class SpellWorkerInternal {
  private runnerInfo: Record<API.RunnerId, RunnerInfo> = {};
  private controlEmitter: API.MessageEmitter;
  private sendMessage: (msg: API.MessageFromWorker) => void;
  private internalEvents = createTypedEventEmitter<SpellWorkerHandlerEvents>();
  private debug = false;
  constructor(
    controlEmitter: API.MessageEmitter,
    sendMessage: (msg: API.MessageFromWorker) => void
  ) {
    this.controlEmitter = controlEmitter;
    this.sendMessage = sendMessage;

    // Bind to the event emitter.
    this.handleMessageToWorker = this.handleMessageToWorker.bind(this);
    this.controlEmitter.on("message", this.handleMessageToWorker);
  }
  handleMessageToWorker(msg: unknown) {
    if (this.debug) console.log("--> WorkerMSG", msg);
    if (!API.isMessageToWorker(msg)) {
      console.error(
        "Message is not of a known message MessageToWorker type.",
        msg
      );
      return;
    }
    switch (msg.type) {
      case API.MessageToWorkerType.CreateRunner:
        return this.createRunner(msg);
      case API.MessageToWorkerType.DestroyRunner:
        return this.destroyRunner(msg);
      case API.MessageToWorkerType.ExecuteScript:
      case API.MessageToWorkerType.AppendCode:
        return this.handleExecuteScript(msg);
      case API.MessageToWorkerType.GetVariables:
        return this.handleGetVariables(msg);
      case API.MessageToWorkerType.SetVariable:
        return this.handleSetVariable(msg);
      case API.MessageToWorkerType.SetVariables:
        return this.handleSetVariables(msg);
      case API.MessageToWorkerType.ModuleRPC:
        return this.handleModuleRPC(msg);
      case API.MessageToWorkerType.ModuleCodeResolutionResponse:
        this.internalEvents.emit("resolveModuleCode", msg);
        return;
      case API.MessageToWorkerType.ModuleRPCResponse:
        this.internalEvents.emit("nativeRPCResponse", msg);
        return;
      case API.MessageToWorkerType.SetSpeed:
        return this.setSpeed(msg);
      case API.MessageToWorkerType.Terminate:
        this.handleTerminate(msg);
        return;
      case API.MessageToWorkerType.PauseExecution:
        this.handlePause(msg);
        return;
      case API.MessageToWorkerType.UnPauseExecution:
        this.handleUnPause(msg);
        return;
      case API.MessageToWorkerType.StepExecution:
        this.handleStep(msg);
        return;
      case API.MessageToWorkerType.ComputeAutocomplete:
        const completion = computeAutocomplete(
          msg.code,
          msg.currentRow,
          msg.currentCol
        );
        this.sendMessage({
          type: API.MessageFromWorkerType.ComputeAutocompleteResult,
          requestId: msg.id,
          results: completion ?? []
        });
        return;
      case API.MessageToWorkerType.ModuleRPCHeadless:
        this.handleModuleRpcHeadless(msg);
        return;
      case API.MessageToWorkerType.ComputeImports:
        const imports = computeImports(msg.code);
        if (imports === null) {
          this.sendMessage({
            type: API.MessageFromWorkerType.ComputeImportsResult,
            requestId: msg.id,
            failed: true
          });
        } else {
          this.sendMessage({
            type: API.MessageFromWorkerType.ComputeImportsResult,
            requestId: msg.id,
            imports
          });
        }
        return;
      case API.MessageToWorkerType.SyncEntities:
        this.handleEntitySync(msg);
        return;
      case API.MessageToWorkerType.SynchedEntityCallbackResponse:
        this.handleSynchedEntityCallbackResponse(msg);
        return;
      case API.MessageToWorkerType.SynchedEntityMessage:
        this.handleSynchedEntityMessage(msg);
        return;
      default:
        return this.ack(msg);
    }
  }
  ack(
    msg: Exclude<
      API.MessageToWorker,
      | API.ComputeAutocompleteMessage
      | API.ComputeImportsMessage
      | API.SyncEntitiesMessage
    >
  ) {
    // Special case for init messages.
    if (msg.type === API.MessageToWorkerType.Init) {
      this.sendMessage({
        type: API.MessageFromWorkerType.Ack,
        messageToWorkerId: msg.id,
        runnerId: ""
      });
      return;
    }
    this.sendMessage({
      type: API.MessageFromWorkerType.Ack,
      runnerId: msg.runnerId,
      messageToWorkerId: msg.id
    });
  }
  createRunner(msg: API.CreateRunnerMessage) {
    const { runnerId } = msg;
    const sync = new SpellEntitySyncPseudo();
    const runner = new JSRunner<ModuleAPI.SpellPseudoRuntimeCtx>({
      getModuleEvents: (moduleName: string) =>
        this.getModuleEvents(runnerId, moduleName),
      nativeRPC: (moduleName: string, data: unknown) =>
        this.nativeModuleRPC(runnerId, moduleName, data),
      sharedModuleResources: new Map(),
      sync
    });
    ModuleAPI.addModuleAPIToRunner(runner, runner.ctx);
    sync.setup(runner);
    sync.events.on("nativeMethodCall", (call) => {
      const [
        requestId,
        entityTrackingId,
        method,
        args,
        translateHandlesInArgs
      ] = call;
      this.sendMessage({
        type: API.MessageFromWorkerType.SynchedEntityCallback,
        runnerId,
        requestId,
        entityTrackingId,
        method,
        args,
        translateHandlesInArgs
      });
    });
    sync.events.on("requestTracking", (call) => {
      const [requestId, identifiers] = call;
      this.sendMessage({
        type: API.MessageFromWorkerType.RequestEntitySyncInfo,
        runnerId,
        requestId,
        identifiers
      });
    });
    runner.events.on("consoleLog", (msg) =>
      this.handleConsoleLog(runnerId, msg)
    );
    runner.events.on("executionStarted", () =>
      this.sendMessage({
        type: API.MessageFromWorkerType.ExecutionStarted,
        runnerId
      })
    );
    runner.events.on("executionProgress", (currentLine) =>
      this.sendMessage({
        type: API.MessageFromWorkerType.ExecutionProgress,
        runnerId,
        currentLine
      })
    );
    runner.events.on("executionFinished", (value) =>
      this.sendMessage({
        type: API.MessageFromWorkerType.ExecutionFinished,
        runnerId,
        value
      })
    );
    runner.events.on("error", (err) => {
      this.handleModuleError(runnerId, err);
    });
    runner.moduleResolver = (_: unknown, modulePath: string) =>
      this.resolveModuleCode(runnerId, modulePath);
    // TODO: Gate this by player experience.
    Object.assign(runner.modules, pseudoModulesAuto);
    this.runnerInfo[runnerId] = {
      runner,
      moduleEvents: {},
      headlessModuleInitializers: {},
      headlessModuleRPCHandlers: {},
      sync
    };
    this.ack(msg);
  }
  destroyRunner(msg: API.DestroyRunnerMessage) {
    this.ack(msg);
    const { runnerId } = msg;
    const runnerInfo = this.runnerInfo[runnerId];
    if (runnerInfo === undefined) return;
    runnerInfo.runner.terminate();
    delete this.runnerInfo[runnerId];
  }
  async handleExecuteScript(
    msg: API.ExecuteScriptMessage | API.AppendCodeMessage
  ) {
    this.ack(msg);
    const { runnerId } = msg;
    const runnerInfo = this.runnerInfo[runnerId];
    let consoleWrap = false;
    let bindLastResultToVariable: string | undefined;
    if (msg.type === API.MessageToWorkerType.AppendCode) {
      consoleWrap = !!msg.logResult;
      bindLastResultToVariable = msg.bindLastResultToVariable;
    }
    if (!runnerInfo) return;
    // Bind last result to a variable for execution if requested.
    // This is used by appendCode runs to test user-provided pseudo results,
    // such as functions.
    if (bindLastResultToVariable !== undefined) {
      const lastValue = runnerInfo.runner.getLastPseudoResult();
      runnerInfo.runner.interpreter.setProperty(
        runnerInfo.runner.interpreter.globalScope.object,
        bindLastResultToVariable,
        lastValue
      );
    }
    await runnerInfo.runner.transpileAndAppendES6(
      msg.code,
      !runnerInfo.runnerHasCode,
      consoleWrap
    );
    runnerInfo.runnerHasCode = true;
    if (!runnerInfo.runner.isRunning()) runnerInfo.runner.run();
  }
  handleGetVariables(msg: API.GetVariablesMessage) {
    const { runnerId, vars, id } = msg;
    const runner = this.runnerInfo[runnerId]?.runner;
    if (!runner) return;
    const varResults: [string, unknown][] = [];
    for (const varName of vars) {
      const value = pseudoToNativeRespectingPropDescriptors(
        runner.interpreter,
        runner.interpreter.getProperty(
          runner.interpreter.getGlobalScope().object,
          varName
        )
      );
      varResults.push([varName, value]);
    }
    this.sendMessage({
      type: API.MessageFromWorkerType.Ack,
      runnerId,
      messageToWorkerId: id
    });
    this.sendMessage({
      type: API.MessageFromWorkerType.VariablesResult,
      runnerId,
      messageToWorkerId: id,
      results: varResults
    });
  }
  handleSetVariable(msg: API.SetVariableMessage) {
    this.ack(msg);
    const { runnerId, var: varName, value } = msg;
    const runner = this.runnerInfo[runnerId]?.runner;
    if (runner === undefined) return;
    runner.interpreter.setProperty(
      runner.interpreter.getGlobalScope().object,
      varName,
      runner.interpreter.nativeToPseudo(value)
    );
  }
  handleSetVariables(msg: API.SetVariablesMessage) {
    this.ack(msg);
    const { runnerId, pairs } = msg;
    const runner = this.runnerInfo[runnerId]?.runner;
    if (runner === undefined) return;
    for (const [varName, value] of pairs) {
      runner.interpreter.setProperty(
        runner.interpreter.getGlobalScope().object,
        varName,
        runner.interpreter.nativeToPseudo(value)
      );
    }
  }
  handleConsoleLog(runnerId: API.RunnerId, output: JSRunnerConsoleOutput) {
    this.sendMessage({
      type: API.MessageFromWorkerType.ConsoleOutput,
      runnerId,
      output
    });
  }
  handleModuleError(runnerId: API.RunnerId, err: Error) {
    const runner = this.runnerInfo[runnerId]?.runner;
    if (runner === undefined) return;
    const errAny = err as any;
    let line: number | null = null;
    // Prefer the source line already resolved by _doCurrentLine.
    if (typeof errAny.__sourceLine === "number") {
      line = errAny.__sourceLine;
    }
    // Resolve AST positions via the runner's source mapping (covers the
    // encapsulateAndThrow path where _doCurrentLine is bypassed).
    if (line === null && Array.isArray(errAny.__astPositions)) {
      line = runner.resolveSourceLineFromASTPositions(errAny.__astPositions);
    }
    // Babel transpile errors carry a loc property with the source line.
    if (line === null && typeof errAny.loc?.line === "number") {
      // Babel loc.line is 1-based; convert to 0-based to match the rest of
      // the system.
      line = errAny.loc.line - 1;
    }
    // Fall back to the runner's last known source-mapped execution line.
    if (line === null) {
      line = runner.currentLine;
    }
    this.sendMessage({
      type: API.MessageFromWorkerType.ExecutionError,
      runnerId,
      error: {
        message: err.message,
        line
      }
    });
  }
  resolveModuleCode(runnerId: API.RunnerId, moduleName: string) {
    const requestId = shortid();
    return new Promise<string | undefined>((resolve) => {
      const onMsg = (msg: API.ModuleCodeResolutionResponseMessage) => {
        if (msg.requestId !== requestId) return;
        this.internalEvents.off("resolveModuleCode", onMsg);
        resolve(msg.code ?? undefined);
      };
      this.internalEvents.on("resolveModuleCode", onMsg);
      this.sendMessage({
        type: API.MessageFromWorkerType.ModuleCodeResolutionRequest,
        id: requestId,
        runnerId,
        moduleName
      });
    });
  }
  getModuleEvents(runnerId: API.RunnerId, moduleName: string) {
    const runnerInfo = this.runnerInfo[runnerId];
    if (!runnerInfo)
      throw new Error("Runner not initialized in SpellWorkerInternal.");
    let moduleEvents = runnerInfo.moduleEvents[moduleName];
    if (!moduleEvents) {
      moduleEvents =
        createTypedEventEmitter<ModuleAPI.SpellPseudoRuntimeCTXEvents>();
      runnerInfo.moduleEvents[moduleName] = moduleEvents;
      return moduleEvents;
    } else {
      return moduleEvents;
    }
  }
  nativeModuleRPC(runnerId: API.RunnerId, moduleName: string, data: unknown) {
    const requestId = shortid();
    return new Promise<unknown>((resolve, reject) => {
      const onMsg = (msg: API.ModuleRPCResponseMessage) => {
        if (msg.requestId !== requestId) return;
        this.internalEvents.setMaxListeners(
          this.internalEvents.getMaxListeners() - 1
        );
        this.internalEvents.off("nativeRPCResponse", onMsg);
        if (msg.error) return reject(msg.error);
        resolve(msg.data);
      };
      this.internalEvents.setMaxListeners(
        this.internalEvents.getMaxListeners() + 1
      );
      this.internalEvents.on("nativeRPCResponse", onMsg);
      this.sendMessage({
        type: API.MessageFromWorkerType.ModuleRPCRequest,
        runnerId,
        moduleName,
        id: requestId,
        data,
        expectsResponse: true
      });
    });
  }
  handleModuleRPC(msg: API.ModuleRPCMessage) {
    this.ack(msg);
    const { runnerId, moduleName, data } = msg;
    if (!this.runnerInfo[runnerId]) {
      console.warn("Found call to unknown spell API runner, ignoring.");
      return;
    }
    const runnerModuleEvents = this.runnerInfo[runnerId]?.moduleEvents;
    runnerModuleEvents[moduleName]?.emit("moduleMessage", data);
  }
  handleTerminate(msg: API.TerminateMessage) {
    this.ack(msg);
    const { runnerId } = msg;
    const runner = this.runnerInfo[runnerId]?.runner;
    if (!runner) return;
    runner.terminate();
  }
  handlePause(msg: API.PauseExecutionMessage) {
    this.ack(msg);
    const { runnerId } = msg;
    const runner = this.runnerInfo[runnerId]?.runner;
    if (!runner) return;
    runner.pause();
  }
  handleUnPause(msg: API.UnPauseExecutionMessage) {
    this.ack(msg);
    const { runnerId } = msg;
    const runner = this.runnerInfo[runnerId]?.runner;
    if (!runner) return;
    runner.unpause();
  }
  handleStep(msg: API.StepExecutionMessage) {
    this.ack(msg);
    const { runnerId } = msg;
    const runner = this.runnerInfo[runnerId]?.runner;
    if (!runner) return;
    runner.doCurrentLine();
  }
  setSpeed(msg: API.SetSpeedMessage) {
    this.ack(msg);
    const { runnerId, speed } = msg;
    const runner = this.runnerInfo[runnerId]?.runner;
    if (runner === undefined) return;
    runner.speed = speed;
  }
  handleEntitySync(msg: API.SyncEntitiesMessage) {
    const { runnerId, requestId, updates } = msg;
    const runnerInfo = this.runnerInfo[runnerId];
    if (runnerInfo === undefined) return;
    runnerInfo.sync.handleUpdates(updates, requestId);
    this.internalEvents.emit("syncResponse", msg);
  }
  async handleModuleRpcHeadless(msg: API.ModuleRPCHeadlessMessage) {
    const { runnerId, moduleName, data } = msg;
    const runnerInfo = this.runnerInfo[runnerId];
    if (runnerInfo === undefined) return;
    const spellModule = pseudoModulesAuto[moduleName];
    if (!spellModule) return;
    // We use a DeferredEmitter here to avoid a race condition where multiple
    // moduleRpcHeadless calls can pile up and we start initializing the
    // native module before the first one finishes.
    if (!runnerInfo.headlessModuleInitializers[moduleName]) {
      runnerInfo.headlessModuleInitializers[moduleName] = new DeferredEmitter();
      const rpcHandlerOrUndefined = await spellModule.initHeadlessPseudo?.(
        runnerInfo.runner.ctx
      );
      if (rpcHandlerOrUndefined !== undefined) {
        runnerInfo.headlessModuleRPCHandlers[moduleName] =
          rpcHandlerOrUndefined;
      }
      runnerInfo.headlessModuleInitializers[moduleName].emit("done");
    } else {
      await runnerInfo.headlessModuleInitializers[moduleName].getPromise();
    }
    if (runnerInfo.headlessModuleRPCHandlers[moduleName]) {
      await runnerInfo.headlessModuleRPCHandlers[moduleName](data);
    }
    this.ack(msg);
  }
  handleSynchedEntityCallbackResponse(msg: API.SynchedEntityCallbackResponse) {
    const { runnerId, requestId, result, errorMessage } = msg;
    const runnerInfo = this.runnerInfo[runnerId];
    if (runnerInfo === undefined) return;
    runnerInfo.sync.events.emit("nativeMethodCallResult", [
      requestId,
      result,
      errorMessage
    ]);
    this.ack(msg);
  }
  handleSynchedEntityMessage(msg: API.SynchedEntityMessage) {
    const { runnerId, entityTrackingId, method, args } = msg;
    const runnerInfo = this.runnerInfo[runnerId];
    if (runnerInfo === undefined) return;
    runnerInfo.sync.handleTrackedPsudoCall(entityTrackingId, method, args);
    this.ack(msg);
  }
  teardown() {
    for (const [runnerId, runnerInfo] of Object.entries(this.runnerInfo)) {
      runnerInfo.runner.terminate();
      delete this.runnerInfo[runnerId];
    }
  }
}
