import { InterpreterPseudoValue } from "js-interpreter";
import { IVector2 } from "three-aseprite";

import { autoTranslateClass, exposeProp } from "src/scripting/core/Bindings";
import { JSRunnerAPI } from "src/scripting/core/api";
import { iVector2Validator } from "src/scripting/modules/auto/validators/basicValidators";
import {
  ProjectilePseudoConstructorArg,
  ProjectilePseudoMoveToArg,
  projectileOptMoveToValidator,
  projectileOptValidator
} from "src/scripting/modules/auto/validators/projectileValidators";
import { getAutoPseudoRPCBindings } from "src/scripting/modules/autoPseudo";
import { earlyResolveWithPromise } from "src/scripting/modules/shared/stackMagic";
import { spellEntitySyncFromRunner } from "src/scripting/runtime/SpellEntitySyncAPI";

import { EntityInfo } from "../BaseEntityInfo";

@autoTranslateClass({
  constructorAsync: true,
  constructorValidator: (opt) => projectileOptValidator.validateSync(opt)
})
export class Projectile extends EntityInfo {
  // Matches the native GenericProjectile entity's type for sync/registry.
  static type = "GenericProjectile";
  public type = Projectile.type;

  // Self-reference so require("projectile").Projectile resolves to the class
  // (e.g. for spark.cast(Projectile.Projectile)).
  @exposeProp()
  static Projectile = Projectile;

  protected opts?: ProjectilePseudoConstructorArg;

  constructor(opt?: ProjectilePseudoConstructorArg) {
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
    await this.rpcs.createProjectile({
      useHandleId: this.trackingId.persistentHandleId,
      casterId: opt?.spark?.id ?? undefined,
      strength: opt?.strength ?? undefined,
      velocity: opt?.velocity
        ? { x: opt.velocity.x ?? 0, y: opt.velocity.y ?? 0 }
        : undefined,
      aim: opt?.aim,
      aimSpeed: opt?.aimSpeed,
      aimGuide: opt?.aimGuide ?? undefined,
      directPath: opt?.directPath ?? undefined,
      colorInner: opt?.colorInner ?? undefined,
      colorOuter: opt?.colorOuter ?? undefined,
      colorTrail: opt?.colorTrail ?? undefined,
      opacityInner: opt?.opacityInner ?? undefined,
      opacityOuter: opt?.opacityOuter ?? undefined,
      radius: opt?.radius ?? undefined,
      gravity: opt?.gravity ?? undefined,
      enableParticles: opt?.enableParticles ?? undefined,
      particleColor: opt?.particleColor ?? undefined,
      elementalType: opt?.elementalType ?? undefined,
      damageType: opt?.damageType ?? undefined,
      trailMaxLength: opt?.trailMaxLength ?? undefined,
      trailLengthMs: opt?.trailLengthMs ?? undefined
    });
  }

  /** RPC proxy onto the main-thread ProjectileNative handler. */
  private get rpcs() {
    if (!this.runner)
      throw new Error("[Projectile]: Projectile is not attached to a runner.");
    return getAutoPseudoRPCBindings(this.runner).ProjectileNative;
  }

  @exposeProp({ validator: iVector2Validator, exposeErrorMessages: true })
  public async setVelocity(velocity: IVector2) {
    if (!this.id)
      throw new Error(
        "[Projectile]: Broken invariant - projectile does not have an ID at cast time."
      );
    await this.rpcs.setProjectileVelocity(this.id, velocity);
  }

  @exposeProp({
    validator: (opt) => projectileOptMoveToValidator.validateSync(opt),
    exposeErrorMessages: true
  })
  public async moveTo(opt?: ProjectilePseudoMoveToArg) {
    if (!this.id)
      throw new Error(
        "[Projectile]: Broken invariant - projectile does not have an ID at cast time."
      );
    const x = opt?.x ?? 0;
    const y = opt?.y ?? 0;
    const speed = opt?.speed ?? 10;
    try {
      await this.rpcs.moveProjectileTo(this.id, x, y, speed);
    } catch (msj) {
      throw new Error("Error while moving projectile: " + msj);
    }
  }

  @exposeProp({
    validator: (opt) => projectileOptMoveToValidator.validateSync(opt),
    exposeErrorMessages: true
  })
  public async moveToAsync(opt?: ProjectilePseudoMoveToArg) {
    if (!this.id)
      throw new Error(
        "[Projectile]: Broken invariant - projectile does not have an ID at cast time."
      );
    const x = opt?.x ?? 0;
    const y = opt?.y ?? 0;
    const speed = opt?.speed ?? 10;

    const [resolve, reject] = earlyResolveWithPromise(this.runner!);
    try {
      const result = (await this.rpcs.moveProjectileTo(
        this.id,
        x,
        y,
        speed
      )) as InterpreterPseudoValue;
      resolve(result);
    } catch (err) {
      reject(
        this.runner!.translate.nativeToPseudo(
          "Error while moving projectile: " + err
        )
      );
    }
  }

  @exposeProp({
    validator: (opt) => iVector2Validator(opt),
    exposeErrorMessages: true
  })
  public canMoveTo(opt: IVector2) {
    if (!this.id)
      throw new Error(
        "[Projectile]: Broken invariant - projectile does not have an ID at cast time."
      );
    return this.rpcs.checkLineOfSight(this.id, opt.x ?? 0, opt.y ?? 0);
  }
}
