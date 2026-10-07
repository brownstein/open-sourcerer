import {
  InterpreterFunction,
  InterpreterPseudoValue,
  InterpreterScope
} from "js-interpreter";
import { IVector2 } from "three-aseprite";

import { autoTranslateClass, exposeProp } from "src/scripting/core/Bindings";
import { JSRunnerAPI } from "src/scripting/core/api";
import {
  FireballPseudoConstructorArg,
  FireballPseudoMoveToArg,
  fireballOptMoveToValidator
} from "src/scripting/modules/auto/validators/fireValidators";
import { iVector2Validator } from "src/scripting/modules/auto/validators/basicValidators";
import { getAutoPseudoRPCBindings } from "src/scripting/modules/autoPseudo";
import {
  addAsyncCall,
  earlyResolveWithPromise
} from "src/scripting/modules/shared/stackMagic";
import { spellEntitySyncFromRunner } from "src/scripting/runtime/SpellEntitySyncAPI";

import { EntityInfo } from "../BaseEntityInfo";

@autoTranslateClass({ constructorAsync: true })
export class Fireball extends EntityInfo {
  static type = "Fireball";
  public type = Fireball.type;

  protected opts?: FireballPseudoConstructorArg;
  private impactHandlers: {
    func: InterpreterFunction;
    scope: InterpreterScope;
  }[] = [];

  constructor(opt?: FireballPseudoConstructorArg) {
    super();
    this.opts = opt;
  }

  // Spawns the real Fireball entity on the main thread and tracks it under this
  // pseudo entity's handle so sync updates (position/destroyed) land here.
  async postConstruct(runner: JSRunnerAPI) {
    this.runner = runner;
    const sync = spellEntitySyncFromRunner(this.runner);
    if (!sync) return;
    sync.setTracked(this.trackingId, this);
    if (!this.trackingId.persistentHandleId) return;
    const opt = this.opts;
    await this.rpcs.createFireball({
      useHandleId: this.trackingId.persistentHandleId,
      overrideCasterId: opt?.spark?.id ?? undefined,
      strength: opt?.strength ?? undefined,
      gravityScale: opt?.gravity ?? undefined,
      velocity: opt?.velocity
        ? { x: opt.velocity.x ?? 0, y: opt.velocity.y ?? 0 }
        : undefined,
      at: opt?.at ? { x: opt.at.x ?? 0, y: opt.at.y ?? 0 } : undefined,
      aim: opt?.aim,
      aimSpeed: opt?.aimSpeed,
      aimGuide: opt?.aimGuide ?? undefined
    });
  }

  /** RPC proxy onto the main-thread FireNative handler. */
  private get rpcs() {
    if (!this.runner)
      throw new Error("[Fire]: Fireball is not attached to a runner.");
    return getAutoPseudoRPCBindings(this.runner).FireNative;
  }

  @exposeProp({ validator: iVector2Validator, exposeErrorMessages: true })
  public async setVelocity(velocity: IVector2) {
    if (!this.id)
      throw new Error(
        "[Fire]: Broken invariant - fire does not have an ID at cast time."
      );
    await this.rpcs.setFireballVelocity(this.id, velocity);
  }

  @exposeProp({
    validator: (opt) => fireballOptMoveToValidator.validateSync(opt),
    exposeErrorMessages: true
  })
  public async moveTo(opt?: FireballPseudoMoveToArg) {
    if (!this.id)
      throw new Error(
        "[Fire]: Broken invariant - fire does not have an ID at cast time."
      );
    const x = opt?.x ?? 0;
    const y = opt?.y ?? 0;
    const speed = opt?.speed ?? 10;
    try {
      await this.rpcs.moveFireballTo(this.id, x, y, speed);
    } catch (msj) {
      throw new Error("Error while moving fireball: " + msj);
    }
  }

  @exposeProp({
    validator: (opt) => fireballOptMoveToValidator.validateSync(opt),
    exposeErrorMessages: true
  })
  public async moveToAsync(opt?: FireballPseudoMoveToArg) {
    if (!this.id)
      throw new Error(
        "[Fire]: Broken invariant - fire does not have an ID at cast time."
      );
    const x = opt?.x ?? 0;
    const y = opt?.y ?? 0;
    const speed = opt?.speed ?? 10;

    const [resolve, reject] = earlyResolveWithPromise(this.runner!);
    try {
      const result = (await this.rpcs.moveFireballTo(
        this.id,
        x,
        y,
        speed
      )) as InterpreterPseudoValue;
      resolve(result);
    } catch (err) {
      reject(
        this.runner!.translate.nativeToPseudo(
          "Error while moving fireball: " + err
        )
      );
    }
  }

  @exposeProp({ exposeErrorMessages: true })
  public async explode() {
    if (!this.id)
      throw new Error(
        "[Fire]: Broken invariant - fire does not have an ID at cast time."
      );
    await this.rpcs.explodeFireball(this.id);
  }

  @exposeProp({ synch: true, raw: true })
  public onImpact(cb: InterpreterFunction) {
    if (!this.runner)
      throw new Error("[Fire]: Fireball is not attached to a runner.");
    const interpreter = this.runner.interpreter;
    if (!interpreter.isa(cb, interpreter.FUNCTION)) {
      throw new Error("Supplied callback is not a function.");
    }
    if (!this.id)
      throw new Error(
        "[Fire]: Broken invariant - fire does not have an ID at cast time."
      );
    const scope = interpreter.getScope();
    this.impactHandlers.push({ func: cb, scope });
    this.runner.incrementOutstandingPromises(1);
  }

  // Invoked main -> worker via sync.doPseudoMethod when the native fireball
  // impacts. Runs (and clears) any registered onImpact callbacks.
  _handleImpact() {
    if (!this.runner) return;
    const handlers = this.impactHandlers;
    this.impactHandlers = [];
    for (const handler of handlers) {
      addAsyncCall(this.runner, handler.func, [], handler.scope);
    }
    this.runner.incrementOutstandingPromises(-handlers.length);
  }
}
