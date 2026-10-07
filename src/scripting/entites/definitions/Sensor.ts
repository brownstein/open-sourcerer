import { InterpreterFunction, InterpreterScope } from "js-interpreter";

import { autoTranslateClass, exposeProp } from "src/scripting/core/Bindings";
import { JSRunnerAPI } from "src/scripting/core/api";
import {
  SensorConstructorArg,
  sensorConstructorValidator
} from "src/scripting/modules/auto/validators/sensorValidators";
import { getAutoPseudoRPCBindings } from "src/scripting/modules/autoPseudo";
import { addAsyncCall } from "src/scripting/modules/shared/stackMagic";
import {
  TrackingIdentifier,
  spellEntitySyncFromRunner
} from "src/scripting/runtime/SpellEntitySyncAPI";

import { EntityInfo } from "../BaseEntityInfo";

type SensorExtraInfo = {
  nearbyEntityIds: string[];
};

@autoTranslateClass({
  constructorAsync: true,
  constructorValidator: sensorConstructorValidator
})
export class Sensor extends EntityInfo<SensorExtraInfo> {
  static type = "Sensor";
  public type = Sensor.type;

  protected opts?: SensorConstructorArg;
  private _ready = false;
  private enterHandlers: {
    func: InterpreterFunction;
    scope: InterpreterScope;
  }[] = [];
  private leaveHandlers: {
    func: InterpreterFunction;
    scope: InterpreterScope;
  }[] = [];
  private callbacksRegistered = false;

  constructor(opt?: SensorConstructorArg) {
    super();
    this.opts = opt;
  }

  async postConstruct(runner: JSRunnerAPI) {
    this.runner = runner;
    const sync = spellEntitySyncFromRunner(this.runner);
    if (!sync) return;
    sync.setTracked(this.trackingId, this);
    if (!this.trackingId.persistentHandleId) return;
    const opt = this.opts;
    await this.rpcs.createSensor({
      useHandleId: this.trackingId.persistentHandleId,
      radius: opt?.radius,
      spark: opt?.spark
        ? { _casterEntityId: opt.spark._casterEntityId, id: opt.spark.id }
        : null
    });
    this._ready = true;
  }

  /** RPC proxy onto the main-thread SensorNative handler. */
  private get rpcs() {
    if (!this.runner)
      throw new Error("[Sensor]: Sensor is not attached to a runner.");
    return getAutoPseudoRPCBindings(this.runner).SensorNative;
  }

  @exposeProp()
  public get ready() {
    return this._ready;
  }

  @exposeProp({ synch: true, raw: false })
  public get entities() {
    const sync = spellEntitySyncFromRunner(this.runner);
    if (!sync) return [];
    return (this.extra?.nearbyEntityIds ?? [])
      .map((id) => sync.getTrackedWithoutRPC({ entityId: id }))
      .filter((e) => !!e);
  }

  @exposeProp({ synch: true, raw: true })
  public onEntityEnter(cb: InterpreterFunction) {
    if (!this.runner)
      throw new Error("[Sensor]: Sensor is not attached to a runner.");
    const interpreter = this.runner.interpreter;
    if (!interpreter.isa(cb, interpreter.FUNCTION)) {
      throw new Error("Supplied callback is not a function.");
    }
    if (!this.id) throw new Error("[Sensor]: Sensor not yet ready.");
    this.enterHandlers.push({ func: cb, scope: interpreter.getScope() });
    this.runner.incrementOutstandingPromises(1);
    this._ensureCallbacks();
  }

  @exposeProp({ synch: true, raw: true })
  public onEntityLeave(cb: InterpreterFunction) {
    if (!this.runner)
      throw new Error("[Sensor]: Sensor is not attached to a runner.");
    const interpreter = this.runner.interpreter;
    if (!interpreter.isa(cb, interpreter.FUNCTION)) {
      throw new Error("Supplied callback is not a function.");
    }
    if (!this.id) throw new Error("[Sensor]: Sensor not yet ready.");
    this.leaveHandlers.push({ func: cb, scope: interpreter.getScope() });
    this.runner.incrementOutstandingPromises(1);
    this._ensureCallbacks();
  }

  private _ensureCallbacks() {
    if (this.callbacksRegistered || !this.id) return;
    this.callbacksRegistered = true;
    this.rpcs.registerSensorCallbacks(this.id);
  }

  // Invoked main -> worker via sync.doPseudoMethod when an entity enters or
  // leaves the sensor. Runs the registered enter/leave callbacks.
  _handleContact(event: "enter" | "leave", trackingId: TrackingIdentifier) {
    if (!this.runner) return;
    const sync = spellEntitySyncFromRunner(this.runner);
    const tracked =
      sync?.getTrackedWithoutRPC(trackingId) ??
      ({ id: trackingId.persistentHandleId } as unknown);
    const entityInfo = this.runner.translate.nativeToPseudo(tracked);
    const handlers = event === "enter" ? this.enterHandlers : this.leaveHandlers;
    for (const handler of handlers) {
      addAsyncCall(this.runner, handler.func, [entityInfo], handler.scope);
    }
  }
}
