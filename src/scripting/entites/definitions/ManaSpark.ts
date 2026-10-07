import { InterpreterPseudoValue } from "js-interpreter";
import { IVector2 } from "three-aseprite";

import { DeferredEmitter } from "src/engine/util/deferredEmitter";
import {
  autoTranslateClass,
  exposeProp,
  isMappedClazz
} from "src/scripting/core/Bindings";
import { JSRunnerAPI } from "src/scripting/core/api";
import { isConstructor, isPrimitiveValue } from "src/scripting/core/util";
import {
  iVector2Validator,
  numberValidator
} from "src/scripting/modules/auto/validators/basicValidators";
import {
  SparkConstructorArg,
  optionalNumberValidator,
  sparkConstructorValidator
} from "src/scripting/modules/auto/validators/sparkValidators";
import { getAutoPseudoRPCBindings } from "src/scripting/modules/autoPseudo";
import { earlyResolveWithPromise } from "src/scripting/modules/shared/stackMagic";
import { spellEntitySyncFromRunner } from "src/scripting/runtime/SpellEntitySyncAPI";

import { EntityInfo } from "../BaseEntityInfo";

type SparkExtraInfo = {
  mana: number;
};

@autoTranslateClass({
  constructorAsync: true,
  constructorValidator: sparkConstructorValidator
})
export class ManaSpark extends EntityInfo<SparkExtraInfo> {
  static type = "ManaSpark";
  public type = ManaSpark.type;

  private opts?: SparkConstructorArg;

  constructor(opt?: SparkConstructorArg) {
    super();
    this.opts = opt;
  }

  // This initializes the real Spark entity and handles attribute sync.
  async postConstruct(runner: JSRunnerAPI) {
    this.runner = runner;
    const sync = spellEntitySyncFromRunner(this.runner);
    const rpcs = getAutoPseudoRPCBindings(this.runner);
    if (!sync) return;
    sync.setTracked(this.trackingId, this);
    if (!this.trackingId.persistentHandleId) return;
    const opt = this.opts;
    await rpcs.SparkNative.createSpark({
      useHandleId: this.trackingId.persistentHandleId,
      casterId: opt?.spark?.id ?? undefined,
      mana: opt?.mana ?? 25,
      offset: opt?.offset
        ? {
            x: opt.offset.x ?? 0,
            y: opt.offset.y ?? 0
          }
        : undefined,
      cameraFollow: opt?.cameraFollow
    });
  }

  /** RPC proxy onto the main-thread SparkNative handler. */
  private get rpcs() {
    if (!this.runner)
      throw new Error("[Spark]: Spark is not attached to a runner.");
    return getAutoPseudoRPCBindings(this.runner).SparkNative;
  }

  @exposeProp()
  get mana() {
    return this.extra?.mana ?? 0;
  }

  @exposeProp({ raw: true, exposeErrorMessages: true })
  public async cast(
    pseudoSpell: InterpreterPseudoValue,
    pseudoArg?: InterpreterPseudoValue
  ) {
    if (!this.runner)
      throw new Error("[Spark]: Spark is not attached to a runner.");
    const translate = this.runner.translate;
    const translatedValue = translate.pseudoToNative(pseudoSpell);
    const perhapsDirectlyCastable =
      translate.getNativeFunctionFromPseudo(pseudoSpell);
    if (isPrimitiveValue(translatedValue) && !perhapsDirectlyCastable)
      throw new Error(
        `[Spark]: Cannot cast primitive value ${translatedValue} as a spell.`
      );
    const translatedArg =
      pseudoArg !== undefined ? translate.pseudoToNative(pseudoArg) : undefined;

    // Handle standard single-argument construction of castable classes.
    const ValidConstructor =
      isConstructor(translatedValue) && isMappedClazz(translatedValue)
        ? translatedValue
        : null;
    if (ValidConstructor) {
      const clazzArg = {
        ...(typeof translatedArg === "object" && translatedArg !== null
          ? translatedArg
          : {}),
        spark: this
      };
      const instance = new ValidConstructor(clazzArg);
      // New-style entities init via postConstruct; older spell classes via
      // readyPromise. Mirror the engine's constructor wrapper preference order.
      if (instance.postConstruct) await instance.postConstruct(this.runner);
      else if (instance.readyPromise) await instance.readyPromise;
      return translate.nativeToPseudo(instance);
    }

    // Experimental support for non-class-based functions / async functions.
    if (perhapsDirectlyCastable) {
      if (!perhapsDirectlyCastable.directlyCastable)
        throw new Error("[Spark]: That's not a spell that Spark can cast!");
      const castArg = {
        ...(typeof translatedArg === "object" && translatedArg !== null
          ? translatedArg
          : {}),
        spark: this
      };
      const pseudoCastArg = translate.nativeToPseudo(castArg);
      if (perhapsDirectlyCastable.nativeFunc) {
        const result = await perhapsDirectlyCastable.nativeFunc(pseudoCastArg);
        return translate.nativeToPseudo(result);
      }
      if (perhapsDirectlyCastable.asyncFunc) {
        const deferred = new DeferredEmitter();
        let result: unknown | undefined;
        const argCount = perhapsDirectlyCastable.asyncFunc.length;
        const args: unknown[] = [pseudoCastArg];
        for (let i = 2; i < argCount; i++) args.push(null);
        args.push((pseudoResult: unknown) => {
          result = pseudoResult;
          deferred.emit("done");
        });
        perhapsDirectlyCastable.asyncFunc(...args);
        await deferred.getPromise();
        return result;
      }
    }

    throw new Error("[Spark]: That's not a spell that Spark can cast!");
  }

  @exposeProp({ synch: true, raw: true })
  public async castAsync(
    pseudoSpell: InterpreterPseudoValue,
    pseudoArg?: InterpreterPseudoValue
  ) {
    if (!this.runner)
      throw new Error("[Spark]: Spark is not attached to a runner.");
    const [resolve, reject] = earlyResolveWithPromise(this.runner);
    try {
      const result = (await this.cast(
        pseudoSpell,
        pseudoArg
      )) as InterpreterPseudoValue;
      resolve(result);
    } catch (err) {
      reject(this.runner.translate.nativeToPseudo(err));
    }
  }

  @exposeProp()
  public async destroy() {
    if (!this.id) return;
    await this.rpcs.destroySpark(this.id);
    this._markDestroyed();
  }

  @exposeProp({ validator: iVector2Validator })
  async setOffset(opt: IVector2) {
    if (!this.id) return;
    await this.rpcs.updateSparkOffset(this.id, opt);
  }

  @exposeProp({ validator: iVector2Validator })
  async setPosition(opt: IVector2) {
    if (!this.id) return;
    await this.rpcs.setSparkPosition(this.id, opt);
  }

  @exposeProp()
  async returnToCaster() {
    if (!this.id) return;
    await this.rpcs.returnSparkToCaster(this.id);
    this._markDestroyed();
  }

  @exposeProp({ validator: numberValidator })
  async storeMana(amount: number) {
    if (!this.id) return;
    await this.rpcs.allocateSparkMana(this.id, amount);
  }

  @exposeProp({ exposeErrorMessages: true })
  async leech(fountainHandleId: string) {
    if (!this.id) return;
    await this.rpcs.leechFromFountain(this.id, fountainHandleId);
  }

  @exposeProp({ exposeErrorMessages: true })
  async passMana(targetSpark: ManaSpark, amount: number) {
    if (!this.id) return;
    if (!targetSpark?.id) throw new Error("[Spark]: Target spark has no ID.");
    await this.rpcs.passMana(this.id, targetSpark.id, amount);
  }

  @exposeProp({ validator: optionalNumberValidator })
  async moveRight(n?: number) {
    if (!this.id) return;
    await this.rpcs.moveSpark(this.id, { dx: n ?? 1, dy: 0 });
  }

  @exposeProp({ validator: optionalNumberValidator })
  async moveLeft(n?: number) {
    if (!this.id) return;
    await this.rpcs.moveSpark(this.id, { dx: -(n ?? 1), dy: 0 });
  }

  @exposeProp({ validator: optionalNumberValidator })
  async moveUp(n?: number) {
    if (!this.id) return;
    await this.rpcs.moveSpark(this.id, { dx: 0, dy: n ?? 1 });
  }

  @exposeProp({ validator: optionalNumberValidator })
  async moveDown(n?: number) {
    if (!this.id) return;
    await this.rpcs.moveSpark(this.id, { dx: 0, dy: -(n ?? 1) });
  }

  /** Mark the synced pseudo entity destroyed after a teardown RPC. */
  private _markDestroyed() {
    if (!this.id) return;
    const info = spellEntitySyncFromRunner(this.runner)?.getTrackedWithoutRPC({
      persistentHandleId: this.id
    });
    if (info) info.destroyed = true;
  }
}
