import shortid from "shortid";
import wait from "wait";

import { BaseEntityType, LevelAPI } from "src/api/entity";
import {
  SpellCtx,
  SpellCtxConsoleLogLine,
  SpellCtxEventTypes,
  SpellCtxEvents,
  SpellCtxMetrics,
  SpellError,
  SpellsAPIEvents,
  ValueCompletion
} from "src/api/spells";
import { createTypedEventEmitter, typedEmitterPromise } from "src/api/util";
import { DeferredEmitter } from "src/engine/util/deferredEmitter";
import { getPlayer } from "src/engine/util/levelUtil";
import { isPlayerAPI } from "src/entities/player/PlayerAPI";
import { scriptEditorSelectors } from "src/redux/scriptEditor/selectors";
import { selectAllScripts } from "src/redux/scriptLibrary/selectors";
import { AppStore } from "src/redux/store";
import { selectComponentConfigsByComponentName } from "src/redux/ui/selectors";
import { isDevMode } from "src/util/devUtil";
import { isPromise } from "src/util/isPromise";

import { autoNativeBindings } from "../modules/autoNativeBindings";
import { SpellEntitySyncRuntime } from "./SpellEntitySync";
import {
  TrackedEntityRuntimeAPI,
  TrackingIdentifier
} from "./SpellEntitySyncAPI";
import {
  SpellRunnerEventTypes,
  SpellRuntimeAPI,
  SpellRuntimeModuleCtxAPI,
  SpellRuntimeModuleCtxApiEventTypes,
  SpellRuntimeModuleEvents,
  SpellRuntimeModuleInstanceNative
} from "./SpellRuntimeAPI";
import * as WorkerAPI from "./SpellWorkerAPI";
import { SpellWorkerConnection } from "./SpellWorkerConnection";
import { SpellWorkerConnectionAPI } from "./SpellWorkerConnectionAPI";

type SpellRuntimeInternalEvents = {
  msg: WorkerAPI.MessageFromWorker;
};
export class SpellRuntime implements SpellRuntimeAPI {
  public readonly events = createTypedEventEmitter<SpellRunnerEventTypes>();
  public sharedConsoleOutput: SpellCtxConsoleLogLine[] = [];
  public sharedConsoleOutputLength = 100;
  public level?: LevelAPI;
  public _store?: AppStore;

  private _debug = false;

  private _connection: SpellWorkerConnectionAPI = new SpellWorkerConnection();
  private _connectionReady = new DeferredEmitter();
  private _pendingMessages: WorkerAPI.MessageToWorker[] = [];
  private _contexts = new Map<string, SpellContext>();
  private _internalEvents =
    createTypedEventEmitter<SpellRuntimeInternalEvents>();
  private _pendingAutocompleteMessageId?: WorkerAPI.MessageId;
  // True once teardown() has been called. The setup loop polls this between
  // its `await wait(250)` calls so it can exit instead of scheduling more
  // timers on a connection that no longer routes messages.
  private _torndown = false;

  constructor() {
    this._internalEvents.setMaxListeners(128);
  }
  public setLevel(level?: LevelAPI) {
    this.level = level;
    for (const ctx of this._contexts.values()) {
      ctx._setLevel(level);
    }
  }
  public setStore(store: AppStore) {
    this._store = store;
  }
  async run(
    code: string | null,
    casterId?: string | null,
    ctx?: SpellCtx | null,
    savedScriptId?: string
  ): Promise<SpellCtx> {
    if (ctx) {
      const context = this._contexts.get(ctx.id);
      if (!context) throw new Error(`Missing spell context ${ctx.id}.`);
      if (code) context.appendAndRun(code);
      return ctx;
    }
    const resultCtx = new SpellContext(this, savedScriptId, casterId);
    this._contexts.set(resultCtx.id, resultCtx);
    resultCtx._setLevel(this.level);

    // Wait for the context to initialize, meaning that we've sent
    // an initialization RPC to the worker and it has replied with
    // a ready response.
    await resultCtx.initDE.getPromise();

    // If we've got a level, and variables are bound to it,
    // send the values to the runner. This might need to be
    // async again in the future, but let's try it for now -
    // the sync message should hit before the run request.
    if (this.level) {
      this.level.populateSpellCtxWithBindings(resultCtx);
    }

    // Execute code.
    this.events.emit(SpellsAPIEvents.runSpellStart, resultCtx);
    if (code && code !== "") resultCtx.appendAndRun(code);
    return resultCtx;
  }
  getSavedRunning(savedScriptId: string) {
    for (const ctx of this._contexts.values()) {
      if (ctx.savedScriptId === savedScriptId) return ctx;
    }
    return null;
  }
  getSpellCtx(id: string): SpellCtx | null {
    return this._contexts.get(id) ?? null;
  }
  getSpellCtxs(): Record<string, SpellCtx> {
    const result: Record<string, SpellCtx> = {};
    for (const [ctxId, ctx] of this._contexts) {
      result[ctxId] = ctx;
    }
    return result;
  }
  async autoComplete(
    code: string,
    currentRow: number,
    currentCol: number
  ): Promise<ValueCompletion[] | null> {
    const msg: WorkerAPI.ComputeAutocompleteMessage = {
      type: WorkerAPI.MessageToWorkerType.ComputeAutocomplete,
      id: shortid(),
      code,
      currentRow,
      currentCol
    };
    this._pendingAutocompleteMessageId = msg.id;
    try {
      const response =
        await this._sendMessageAndAwaitResponse<WorkerAPI.ComputeAutocompleteResultMessage>(
          msg,
          WorkerAPI.MessageFromWorkerType.ComputeAutocompleteResult,
          500
        );
      return response.results;
    } catch (err) {
      console.warn("[SpellRuntime]: Autocomplete timed out.");
      return null;
    }
  }
  async computeImports(code: string): Promise<string[] | null> {
    const msg: WorkerAPI.ComputeImportsMessage = {
      type: WorkerAPI.MessageToWorkerType.ComputeImports,
      id: shortid(),
      code
    };
    try {
      const response =
        await this._sendMessageAndAwaitResponse<WorkerAPI.ComputeImportsResultMessage>(
          msg,
          WorkerAPI.MessageFromWorkerType.ComputeImportsResult,
          500
        );
      return response.imports ?? null;
    } catch (err) {
      console.warn("[SpellRuntime]: Imports computation timed out.");
      return null;
    }
  }
  setup(testMode?: boolean) {
    this._torndown = false;
    this._connection.setup(this.onMessage.bind(this));
    let setupDone = false;
    const msgHandler = (msg: WorkerAPI.MessageFromWorker) => {
      if (msg.type !== WorkerAPI.MessageFromWorkerType.Ack) return;
      this._internalEvents.off("msg", msgHandler);
      setupDone = true;
      this._connectionReady.emit("done");
    };
    this._internalEvents.on("msg", msgHandler);
    const setupAsync = async () => {
      while (!setupDone && !this._torndown) {
        await wait(250);
        if (this._torndown) return;
        this._connection.send({
          type: WorkerAPI.MessageToWorkerType.Init,
          id: this._nextMsgId()
        });
        await wait(250);
      }
      if (setupDone) {
        if (this._debug)
          console.log("Sending queued spell runtime messages...");
        for (const msg of this._pendingMessages) this._sendMessage(msg);
        this._pendingMessages = [];
      }
    };
    setupAsync();
    return this;
  }
  debug(debug = true) {
    this._debug = debug;
    return this;
  }
  teardown() {
    this._torndown = true;
    this._connection.teardown();
    this._contexts = new Map();
    this.level = undefined;
  }
  private onMessage(msg: WorkerAPI.MessageFromWorker) {
    if (this._debug) console.log("[SpellRuntime]: <-- ", msg);
    this._internalEvents.emit("msg", msg);
    // Early return on some message types that aren't associated with a runner.
    switch (msg.type) {
      case WorkerAPI.MessageFromWorkerType.ComputeAutocompleteResult:
      case WorkerAPI.MessageFromWorkerType.ComputeImportsResult:
        return;
      default:
        break;
    }
    const { runnerId } = msg;
    const context = this._contexts.get(runnerId);
    if (context === undefined) return;
    context._internalEvents.emit("msg", msg);
    switch (msg.type) {
      case WorkerAPI.MessageFromWorkerType.ConsoleOutput:
        if (this.sharedConsoleOutputLength >= 0) {
          while (
            this.sharedConsoleOutput.length >=
            this.sharedConsoleOutputLength - 1
          ) {
            this.sharedConsoleOutput.shift();
          }
        }
        this.sharedConsoleOutput.push(msg.output);
        this.events.emit(SpellsAPIEvents.consoleLog, msg.output);
        break;
      default:
        break;
    }
  }
  _sendMessage(msg: WorkerAPI.MessageToWorker) {
    if (this._connectionReady.getDone() === false) {
      this._pendingMessages.push(msg);
      return;
    }
    if (this._debug) console.log("[SpellRuntime]: --> ", msg);
    this._connection.send(msg);
  }
  _sendMessageAndAwaitResponse<
    T extends WorkerAPI.MessageFromWorker = WorkerAPI.AckMessage
  >(
    msg: WorkerAPI.MessageToWorker,
    responseType: T["type"] = WorkerAPI.MessageFromWorkerType.Ack,
    timeoutMs: number = 1000
  ) {
    if (this._debug) console.log("[SpellRuntime]: -!> ", msg);
    return new Promise<T>((resolve, reject) => {
      let done = false;
      let timeout: number | undefined;
      const onMsg = (res: WorkerAPI.MessageFromWorker) => {
        if (done || res.type !== responseType) return;
        switch (res.type) {
          case WorkerAPI.MessageFromWorkerType.Ack:
          case WorkerAPI.MessageFromWorkerType.VariablesResult:
            if (res.messageToWorkerId !== msg.id) return;
            break;
          case WorkerAPI.MessageFromWorkerType.ComputeAutocompleteResult:
            if (res.requestId !== msg.id) return;
            break;
          default:
            break;
        }
        this._internalEvents.off("msg", onMsg);
        if (timeout !== undefined) clearTimeout(timeout);
        resolve(res as T);
      };
      const onTimeout = (msg: WorkerAPI.MessageFromWorker) => {
        if (done) return;
        this._internalEvents.off("msg", onMsg);
        reject(new Error("[SpellRuntime]: timeout occurred for message."));
      };
      this._internalEvents.on("msg", onMsg);
      timeout = setTimeout(onTimeout, timeoutMs);
      this._connection.send(msg);
    });
  }
  _resolveModuleCode(modulePath: string): string | null {
    if (!this._store) return null;
    const allScripts = selectAllScripts(this._store.getState());
    for (const script of allScripts) {
      if (script.name === modulePath) return script.code;
    }
    return null;
  }
  cleanupDereferencedContexts() {
    const state = this._store?.getState();
    if (!state) return;
    const scriptEditors = scriptEditorSelectors.selectAll(state);
    const consoleComponentConfigs =
      selectComponentConfigsByComponentName(state)["console"] ?? [];
    const activeContextIds = new Set<string>();
    for (const scriptEditor of scriptEditors) {
      if (scriptEditor.runtimeId) activeContextIds.add(scriptEditor.runtimeId);
    }
    for (const [_tabId, consoleConfig] of consoleComponentConfigs) {
      if (typeof consoleConfig.spellContextId === "string")
        activeContextIds.add(consoleConfig.spellContextId as string);
    }
    for (const [contextId, context] of this._contexts) {
      if (!context.running && !activeContextIds.has(contextId)) {
        this.removeSpellContext(contextId);
      }
    }
  }
  private _nextMsgId() {
    return shortid();
  }
  removeSpellContext(contextId: string) {
    if (this._debug) console.log("Removing spell context", contextId);
    const context = this._contexts.get(contextId);
    if (!context) return;
    this._sendMessage({
      type: WorkerAPI.MessageToWorkerType.DestroyRunner,
      id: this._nextMsgId(),
      runnerId: context.id
    });
    context.destroy();
    this._contexts.delete(contextId);
  }
  killAllRunningSpells() {
    for (const contextId of this._contexts.keys()) {
      this.removeSpellContext(contextId);
    }
  }
}

type SpellContextInternalEvents = {
  msg: WorkerAPI.MessageFromWorker;
  runComplete: unknown;
};

export class SpellContext implements SpellCtx, SpellRuntimeModuleCtxAPI {
  // External API.
  public id = shortid();
  public initialCode: string = "";
  public savedScriptId?: string | undefined;
  public events = createTypedEventEmitter<SpellCtxEventTypes>();
  public running = false;
  public paused = false;
  public runComplete = false;
  public error?: SpellError;
  public currentLine?: number;
  public consoleOutput: SpellCtxConsoleLogLine[] = [];
  public consoleLength: number = 100;
  public consoleStartIndex: number = 0;
  public destroyed = false;
  public headless = false;
  public initDE = new DeferredEmitter();
  public sharedNativeResources = new Map<symbol, unknown>();
  public finalValue: unknown;

  // Module API.
  public moduleEvents =
    createTypedEventEmitter<SpellRuntimeModuleCtxApiEventTypes>();
  public level?: LevelAPI;

  // Sync API. Note that this has to initialize after moduleEvents.
  public sync: SpellEntitySyncRuntime = new SpellEntitySyncRuntime(this);

  // Internal API.
  public _internalEvents =
    createTypedEventEmitter<SpellContextInternalEvents>();

  private _trackedCaster?: TrackedEntityRuntimeAPI;

  private _runtime: SpellRuntime;
  private _moduleInstances = new Map<
    string,
    SpellRuntimeModuleInstanceNative
  >();
  private _moduleConstructorCounts = new Map<string, number>();

  private _devMode = isDevMode();
  private _devLog(...args: unknown[]) {
    if (this._devMode) console.log(`[Spell:${this.id}]`, ...args);
  }
  private _devError(...args: unknown[]) {
    if (this._devMode) console.error(`[Spell:${this.id}]`, ...args);
  }

  constructor(
    runtime: SpellRuntime,
    savedScriptId?: string,
    casterId?: string | null
  ) {
    this._devLog("created", { savedScriptId, casterId });
    this.savedScriptId = savedScriptId;
    this.sync.setLevel(runtime.level);

    if (casterId) {
      const caster = runtime?.level?.getEntity(casterId);
      if (!caster)
        throw new Error("Specified caster ID not present in current level.");
      this._trackedCaster = this.sync.track(caster, null, true);

      // Auto-track the player across levels.
      if (isPlayerAPI(this._trackedCaster.currentEntity)) {
        this.sync.setReInstantiator(this._trackedCaster.trackingId, (level) =>
          getPlayer(level)
        );
      }
    }
    this._onMessage = this._onMessage.bind(this);
    this._internalEvents.on("msg", this._onMessage);
    this._runtime = runtime;
    this._runtime
      ._sendMessageAndAwaitResponse(
        {
          type: WorkerAPI.MessageToWorkerType.CreateRunner,
          id: shortid(),
          runnerId: this.id
        },
        undefined,
        10000
      )
      .then(() => this.initDE.emit("done"))
      .catch(() => this.initDE.emit("cancel"));
    // Subscribe to entity updates from the sync layer, and pass them to the runtime.
    this.sync.events.on("incrementalUpdate", ({ info: updates, requestId }) => {
      if (updates.length === 0 && requestId === undefined) return;
      this._runtime._sendMessage({
        type: WorkerAPI.MessageToWorkerType.SyncEntities,
        id: this._nextMsgId(),
        runnerId: this.id,
        requestId,
        updates
      });
    });
    this.sync.events.on("methodCall", (call) => {
      this._doPseudoMethod(call[0], call[1], call[2]);
    });
  }
  private _onMessage(msg: WorkerAPI.MessageFromWorker) {
    switch (msg.type) {
      case WorkerAPI.MessageFromWorkerType.Ack:
        return;
      case WorkerAPI.MessageFromWorkerType.ConsoleOutput:
        this.consoleOutput.push(msg.output);
        if (this.consoleLength > 0) {
          while (this.consoleOutput.length > this.consoleLength) {
            this.consoleOutput.shift();
            this.consoleStartIndex++;
          }
        }
        if (this._devMode) {
          const val = msg.output.primitiveValue ?? msg.output.objectValue;
          if (msg.output.type === "error") {
            this._devError(val);
          } else {
            this._devLog(val);
          }
        }
        this.events.emit(SpellCtxEvents.consoleLog, msg.output);
        return;
      case WorkerAPI.MessageFromWorkerType.TranspileError:
        this.error = msg.error;
        this.running = false;
        this._devError("transpile error:", this.error);
        this._internalEvents.emit("runComplete", null);
        this.events.emit(SpellCtxEvents.runError, this.error);
        return;
      case WorkerAPI.MessageFromWorkerType.ExecutionStarted:
        this.running = true;
        this.runComplete = false;
        this._devLog("execution started");
        this.events.emit(SpellCtxEvents.runStarted);
        return;
      case WorkerAPI.MessageFromWorkerType.ExecutionProgress:
        this.currentLine = msg.currentLine ?? undefined;
        this.events.emit(SpellCtxEvents.runProgress, this.currentLine ?? -1);
        return;
      case WorkerAPI.MessageFromWorkerType.ExecutionFinished:
        this.running = false;
        this.runComplete = true;
        this.finalValue = msg.value;
        this._devLog("execution finished");
        this._internalEvents.emit("runComplete", msg.value);
        this.events.emit(SpellCtxEvents.runComplete, msg.value);
        return;
      case WorkerAPI.MessageFromWorkerType.ExecutionError:
        this.error = msg.error;
        this.running = false;
        this._devError("execution error:", this.error);
        this._internalEvents.emit("runComplete", null);
        this.events.emit(SpellCtxEvents.runError, this.error);
        return;
      case WorkerAPI.MessageFromWorkerType.ModuleCodeResolutionRequest:
        this._handleResolveModuleCode(msg);
        return;
      case WorkerAPI.MessageFromWorkerType.RequestEntitySyncInfo:
        this.sync.requestTrackMultiple(msg.identifiers);
        this.sync.sync(msg.identifiers, msg.requestId);
        return;
      case WorkerAPI.MessageFromWorkerType.ModuleRPCRequest:
        this._handleModuleRPCNative(msg);
        return;
      case WorkerAPI.MessageFromWorkerType.SynchedEntityCallback:
        this._handleNativeMethodCall(msg);
        return;
      default:
        return;
    }
  }
  private _nextMsgId() {
    return shortid();
  }
  setVars(vars: Record<string, unknown>) {
    const varPairs: [string, unknown][] = [];
    for (const varName of Object.keys(vars)) {
      varPairs.push([varName, vars[varName]]);
    }
    this._runtime._sendMessage({
      type: WorkerAPI.MessageToWorkerType.SetVariables,
      id: this._nextMsgId(),
      runnerId: this.id,
      pairs: varPairs
    });
  }
  async getVars(vars: string[]) {
    const res =
      await this._runtime._sendMessageAndAwaitResponse<WorkerAPI.VariablesResultMessage>(
        {
          type: WorkerAPI.MessageToWorkerType.GetVariables,
          id: this._nextMsgId(),
          runnerId: this.id,
          vars
        },
        WorkerAPI.MessageFromWorkerType.VariablesResult
      );
    const result: Record<string, unknown> = {};
    for (const [varName, value] of res.results) result[varName] = value;
    return result;
  }
  pause() {
    this._runtime._sendMessage({
      type: WorkerAPI.MessageToWorkerType.PauseExecution,
      id: this._nextMsgId(),
      runnerId: this.id
    });
    this.paused = true;
    this.events.emit(SpellCtxEvents.runPaused);
  }
  resume() {
    this._runtime._sendMessage({
      type: WorkerAPI.MessageToWorkerType.UnPauseExecution,
      id: this._nextMsgId(),
      runnerId: this.id
    });
    this.paused = false;
    this.events.emit(SpellCtxEvents.runResumed);
  }
  step() {
    this._runtime._sendMessage({
      type: WorkerAPI.MessageToWorkerType.StepExecution,
      id: this._nextMsgId(),
      runnerId: this.id
    });
  }
  terminate() {
    this._devLog("terminated");
    this._internalEvents.off("msg", this._onMessage);
    this._runtime._sendMessage({
      type: WorkerAPI.MessageToWorkerType.Terminate,
      id: this._nextMsgId(),
      runnerId: this.id
    });
    this.running = false;
    this.moduleEvents.emit(SpellRuntimeModuleEvents.executionStopped);
    this._runtime.events.emit(SpellsAPIEvents.runSpellEnd, this);
    this.events.emit(SpellCtxEvents.runTerminated);
  }
  setSpeed(linesPerMs: number) {
    this._runtime._sendMessage({
      type: WorkerAPI.MessageToWorkerType.SetSpeed,
      id: this._nextMsgId(),
      runnerId: this.id,
      speed: linesPerMs
    });
  }
  appendAndRun(
    code: string,
    logResult = false,
    bindLastResultToVariable?: string
  ) {
    if (this.initialCode === "") this.initialCode = code;
    this.running = true;
    this.runComplete = false;
    this.error = undefined;
    this._internalEvents.once("runComplete", () => {
      this._runtime.events.emit(SpellsAPIEvents.runSpellEnd, this);
    });
    this._runtime._sendMessage({
      type: WorkerAPI.MessageToWorkerType.AppendCode,
      id: this._nextMsgId(),
      runnerId: this.id,
      code,
      logResult,
      bindLastResultToVariable
    });
  }
  async runCompletePromise() {
    if (!this.running || this.runComplete) return this.finalValue;
    return typedEmitterPromise(
      this.events,
      SpellCtxEvents.runComplete,
      SpellCtxEvents.runTerminated
    );
  }
  _setLevel(level?: LevelAPI) {
    this.level = level;
    this.sync.setLevel(level);
    this.moduleEvents.emit(SpellRuntimeModuleEvents.setLevel, level);
  }
  sendModuleRpc(moduleName: string, data: unknown) {
    this._runtime._sendMessage({
      type: WorkerAPI.MessageToWorkerType.ModuleRPC,
      id: this._nextMsgId(),
      runnerId: this.id,
      moduleName,
      data
    });
  }
  private _handleResolveModuleCode(
    msg: WorkerAPI.ModuleCodeResolutionRequestMessage
  ) {
    const resolvedCode = this._runtime._resolveModuleCode(msg.moduleName);
    this._runtime._sendMessage({
      type: WorkerAPI.MessageToWorkerType.ModuleCodeResolutionResponse,
      id: this._nextMsgId(),
      runnerId: this.id,
      requestId: msg.id,
      code: resolvedCode
    });
  }
  private async _handleModuleRPCNative(msg: WorkerAPI.ModuleRPCRequestMessage) {
    const { moduleName, id: requestId } = msg;
    let moduleInstance = this._moduleInstances.get(moduleName);
    if (moduleInstance === undefined) {
      let moduleRes: SpellRuntimeModuleInstanceNative | undefined;
      if (autoNativeBindings[moduleName]) {
        moduleRes = autoNativeBindings[moduleName](this);
      }
      if (moduleRes) {
        this._moduleInstances.set(moduleName, moduleRes);
        moduleInstance = moduleRes;
      } else {
        console.warn(
          "No native binding available for spell module",
          moduleName
        );
      }
    }
    let data: unknown = null;
    try {
      data = moduleInstance?.handleDataRPC(msg.data);
      if (isPromise(data)) data = await data;

      // Track successful module RPC calls for metrics.
      if (
        data &&
        typeof data === "object" &&
        (data as { success?: boolean }).success
      ) {
        this._moduleConstructorCounts.set(
          moduleName,
          (this._moduleConstructorCounts.get(moduleName) ?? 0) + 1
        );
      }
      this._runtime._sendMessage({
        type: WorkerAPI.MessageToWorkerType.ModuleRPCResponse,
        id: this._nextMsgId(),
        runnerId: this.id,
        requestId,
        data
      });
    } catch (err) {
      this._runtime._sendMessage({
        type: WorkerAPI.MessageToWorkerType.ModuleRPCResponse,
        id: this._nextMsgId(),
        runnerId: this.id,
        requestId,
        error: err instanceof Error ? err.message : (err as string)
      });
    }
  }
  private async _handleNativeMethodCall(
    msg: WorkerAPI.SynchedEntityCallbackMessage
  ) {
    try {
      const resultMaybePromise = this.sync.doNativeMethod(
        msg.entityTrackingId,
        msg.method,
        msg.args,
        msg.translateHandlesInArgs
      );
      const result = await resultMaybePromise;
      this._runtime._sendMessage({
        type: WorkerAPI.MessageToWorkerType.SynchedEntityCallbackResponse,
        id: this._nextMsgId(),
        runnerId: this.id,
        requestId: msg.requestId,
        result
      });
    } catch (err) {
      let errorMessage = "An error occurred calling a native method.";
      if (typeof err === "string") {
        errorMessage = err;
      } else {
        const asError = err as Error;
        if (asError.message !== undefined) errorMessage = asError.message;
      }
      this._runtime._sendMessage({
        type: WorkerAPI.MessageToWorkerType.SynchedEntityCallbackResponse,
        id: this._nextMsgId(),
        runnerId: this.id,
        requestId: msg.requestId,
        errorMessage
      });
    }
  }
  private _doPseudoMethod(
    entityTrackingId: TrackingIdentifier,
    method: string,
    args: unknown[]
  ) {
    this._runtime._sendMessage({
      type: WorkerAPI.MessageToWorkerType.SynchedEntityMessage,
      id: this._nextMsgId(),
      runnerId: this.id,
      entityTrackingId,
      method,
      args
    });
  }
  getMetrics(): SpellCtxMetrics {
    return {
      moduleConstructorCounts: Object.fromEntries(this._moduleConstructorCounts)
    };
  }
  setHeadless(headless: boolean) {
    this.headless = headless;
  }
  bindEntityToVariable(entity: BaseEntityType, variableName: string) {
    this.sync.track(entity, variableName);
  }
  syncEntitiesNow() {
    this.sync.sync();
  }
  async rpcHeadless(moduleName: string, data: unknown) {
    await this._runtime._sendMessageAndAwaitResponse(
      {
        type: WorkerAPI.MessageToWorkerType.ModuleRPCHeadless,
        id: this._nextMsgId(),
        runnerId: this.id,
        moduleName,
        data
      },
      undefined,
      1000
    );
  }
  destroy() {
    if (this.destroyed) return;
    this._devLog("destroyed");
    this.terminate();
    this.sync.teardown();
    this.moduleEvents.emit(SpellRuntimeModuleEvents.teardown);
    this.destroyed = true;
    this._runtime.removeSpellContext(this.id);
  }
  get runtime(): SpellRuntime {
    return this._runtime;
  }
  get store() {
    return this._runtime._store;
  }
  get casterId() {
    return this._trackedCaster?.currentEntity?.id;
  }
  get casterTrackingId() {
    return this._trackedCaster?.trackingId;
  }
  getCaster() {
    return this._trackedCaster?.currentEntity;
  }
}
