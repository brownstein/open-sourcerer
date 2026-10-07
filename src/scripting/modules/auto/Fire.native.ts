import { Vector2, Vector3 } from "three";
import { IVector2 } from "three-aseprite";

import { ElementalType, EntityAlignment } from "src/api/entity";
import { typedEmitterPromise } from "src/api/util";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import { kWorldGravity } from "src/engine/level/Level";
import { vector2To3, vector3To2 } from "src/engine/util/vecTypes";
import { isPlayerAPI } from "src/entities/player/PlayerAPI";
import { FireBlast } from "src/entities/spells/blasts/FireBlast";
import { FireballExplosion } from "src/entities/spells/blasts/FireballExplosion";
import { Fireball } from "src/entities/spells/projectiles/Fireball";
import { TravelEvents } from "src/entities/spells/projectiles/TrailRendering";
import { waitForGroundPathForFirewave } from "src/entities/terrain/util";
import { SpellRuntimeModuleCtxAPI } from "src/scripting/runtime/SpellRuntimeAPI";

import { assertAutoBindableNativeModule } from "../autoAPI";
import { resolveTrackedCaster } from "../shared/resolveCaster";
import { runtimeCastSequence } from "../shared/runtimeCastSequence";

@assertAutoBindableNativeModule
export default class FireNative {
  private ctx: SpellRuntimeModuleCtxAPI;
  constructor(ctx: SpellRuntimeModuleCtxAPI) {
    this.ctx = ctx;
  }

  async createBlast(opts: {
    overrideCasterId?: string;
    aim?: boolean;
    angle?: number;
  }) {
    const { overrideCasterId, aim, angle: angleIn } = opts;
    const trackedCaster = resolveTrackedCaster(this.ctx, overrideCasterId);
    const castResult = await runtimeCastSequence(this.ctx, {
      overrideTrackedCaster: trackedCaster?.trackingId,
      aim,
      elementalType: ElementalType.Fire,
      color: 0xffff00,
      speed: 2,
      manaCost: 20
    });

    if (!castResult.trackedCaster.currentEntity)
      throw new Error("[Fire]: Broken inaviant - no current caster.");

    let angle: number | undefined;

    if (
      trackedCaster?.currentEntity &&
      isPlayerAPI(trackedCaster.currentEntity)
    ) {
      angle = trackedCaster.currentEntity.isFacingRight() ? 0 : Math.PI;
    }
    if (castResult.aimedAt) {
      const aimDelta = vector2To3(castResult.aimedAt).sub(
        castResult.trackedCaster.currentEntity.getCastOrigin()
      );
      angle = Math.atan2(aimDelta.y, aimDelta.x);
    }
    if (angleIn !== undefined) {
      angle = angleIn;
    }

    const blast = new FireBlast({
      position: castResult.trackedCaster.currentEntity.getCastOrigin(),
      angle,
      alignment: EntityAlignment.Player,
      scale: 0.5,
      sourceEntity: castResult.trackedCaster.currentEntity
    });
    this.ctx.level?.addEntity(blast);
  }

  async createFirewave(opts: {
    overrideCasterId?: string;
    aim?: boolean;
    angles?: number[];
    numBlasts?: number;
    spacing?: number;
    delayMs?: number;
  }) {
    const { overrideCasterId, aim, angles } = opts;

    const trackedCaster = resolveTrackedCaster(this.ctx, overrideCasterId);
    const anglesToUse = angles && angles.length > 0 ? angles : [0];
    const numBlasts = opts.numBlasts ?? 10;
    const spacing = opts.spacing ?? 0.3;
    const delayMs = opts.delayMs ?? 50;

    const castResult = await runtimeCastSequence(this.ctx, {
      overrideTrackedCaster: trackedCaster?.trackingId,
      aim,
      elementalType: ElementalType.Fire,
      color: 0xffff00,
      speed: 2,
      manaCost: 5 + numBlasts * 2
    });

    if (!castResult.trackedCaster.currentEntity) {
      throw new Error("[Fire]: Broken invariant - no current caster.");
    }

    const caster = castResult.trackedCaster.currentEntity;
    const direction = isPlayerAPI(caster) && caster.isFacingRight() ? 1 : -1;
    const startPos = caster.getCastOrigin();

    const level = this.ctx.level;
    if (!level) {
      throw new Error("[Firewave]: Level is not available.");
    }

    const path = await waitForGroundPathForFirewave(
      level,
      caster,
      direction,
      spacing,
      numBlasts
    );

    const scheduler =
      caster instanceof CoreEntity ? caster.getScheduler() : undefined;
    if (!scheduler) throw new Error("Caster does not have a scheduler!");

    path.forEach((blastPos, i) => {
      scheduler.add({
        startIn: i * delayMs,
        invokeFunctionAtStart: () => {
          const upwardOffset = Math.PI / 8;
          const angle =
            direction > 0
              ? anglesToUse[0] + upwardOffset
              : Math.PI + anglesToUse[0] - upwardOffset;
          const blast = new FireBlast({
            position: { x: blastPos.x, y: blastPos.y, z: startPos.z ?? 0 },
            angle,
            alignment: EntityAlignment.Player,
            scale: 0.8,
            sourceEntity: caster
          });
          level.addEntity(blast);
        }
      });
    });
  }

  async createFireball(props: {
    // Stub handle assigned by the pseudo runtime so the entity is tracked under
    // the same id the worker-side Fireball already registered.
    useHandleId: string;
    overrideCasterId?: string;
    velocity?: IVector2;
    strength?: number;
    gravityScale?: number;
    aim?: boolean;
    aimSpeed?: number;
    aimGuide?: boolean;
    at?: { x: number; y: number };
  }) {
    const {
      useHandleId,
      overrideCasterId,
      velocity: velocityIn,
      strength: strengthIn,
      gravityScale = 1,
      aim,
      aimSpeed = 15,
      aimGuide: showAimGuide = true,
      at: atTarget
    } = props;

    const trackedCaster = resolveTrackedCaster(this.ctx, overrideCasterId);
    const manaCost = 5 + (strengthIn ?? 10);
    const damage = manaCost;
    const castSpeedMultiplier = 15 / Math.sqrt(damage + 1);

    // Build projectile guide config for the aim reticle.
    const shouldAim = atTarget ? false : aim;
    let aimGuide;
    if (shouldAim && showAimGuide) {
      if (trackedCaster?.currentEntity) {
        aimGuide = {
          getOrigin: () =>
            vector3To2(
              trackedCaster.currentEntity?.getCastOrigin() ?? new Vector3()
            ),
          speed: aimSpeed,
          gravity: kWorldGravity.y * gravityScale
        };
      }
    }

    const castSequence = await runtimeCastSequence(this.ctx, {
      overrideTrackedCaster: trackedCaster?.trackingId,
      elementalType: ElementalType.Fire,
      color: 0xffaa11,
      speed: castSpeedMultiplier,
      manaCost,
      aim: shouldAim,
      aimGuide
    });

    if (!castSequence.trackedCaster.currentEntity)
      throw new Error("[Fire]: Broken inaviant - current caster not found.");
    const castPosition =
      castSequence.trackedCaster.currentEntity.getCastOrigin();

    const fireball = new Fireball({
      position: castPosition,
      damage
    });

    fireball.setSourceEntity(castSequence.trackedCaster.currentEntity);
    fireball.setGravity(gravityScale);

    // Resolve velocity.
    let castVelocity: Vector2 | null = new Vector2();
    if (atTarget) {
      const deltaX = atTarget.x - castPosition.x;
      const deltaY = atTarget.y - castPosition.y;
      const dist = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
      if (dist < 0.001) {
        castVelocity.x = aimSpeed;
        castVelocity.y = 0;
      } else {
        castVelocity.x = (deltaX / dist) * aimSpeed;
        castVelocity.y = (deltaY / dist) * aimSpeed;
      }
    } else if (velocityIn) {
      castVelocity.x = velocityIn.x;
      castVelocity.y = velocityIn.y;
    } else if (castSequence.aimedAt) {
      castVelocity =
        fireball.behaviors.projectilePhysics.calculateVelocityToIntercept(
          castSequence.aimedAt,
          aimSpeed
        );
      if (!castVelocity)
        castVelocity = castSequence.aimedAt
          .clone()
          .sub(vector3To2(castPosition))
          .normalize()
          .multiplyScalar(aimSpeed);
    } else {
      if (isPlayerAPI(castSequence.trackedCaster.currentEntity)) {
        castVelocity.x =
          castSequence.trackedCaster.currentEntity.isFacingRight() ? 10 : -10;
        castVelocity.y = 0;
      } else {
        castVelocity.y = 10;
      }
    }

    fireball.setVelocity(castVelocity);

    // Makes the fireball appear with 0.1s of traveling already done
    const t = 0.1;
    const afterPos =
      fireball.behaviors.projectilePhysics.calculatePositionAtTime(t) ??
      fireball.position;
    const afterVel =
      fireball.behaviors.projectilePhysics.calculateVelocityAtTime(t) ??
      castVelocity;

    fireball.setVelocity(afterVel);
    fireball.position = afterPos;

    fireball.ignoreEntity(castSequence.trackedCaster.currentEntity.id);
    const trackedRootCaster = resolveTrackedCaster(this.ctx);
    if (trackedRootCaster?.currentEntity)
      fireball.ignoreEntity(trackedRootCaster.currentEntity.id);

    this.ctx.level?.addEntity(fireball);
    const info = this.ctx.sync.track(fireball, null, false, useHandleId);
    // Notify the worker-side Fireball when the entity impacts, so it can run
    // any registered onImpact callbacks (main -> worker via doPseudoMethod).
    fireball.onImpactCallbacks.push(() => {
      this.ctx.sync.doPseudoMethod(info.trackingId, "_handleImpact", []);
    });
    this.ctx.sync.sync(info.trackingId);
    return {
      id: info.trackingId
    };
  }

  async setFireballVelocity(handleId: string, velocity: IVector2) {
    const tracked = this.ctx.sync.get<Fireball>(handleId);
    tracked?.currentEntity?.setVelocity(new Vector2(velocity.x, velocity.y));
  }

  async moveFireballTo(handleId: string, x: number, y: number, speed: number) {
    const tracked = this.ctx.sync.get<Fireball>(handleId);
    if (tracked?.currentEntity?.moveTo(new Vector2(x, y), speed))
      return typedEmitterPromise(
        tracked.currentEntity.travelEvents,
        TravelEvents.reachedDestination,
        TravelEvents.notReachedDestination
      );
    else throw new Error("There's a wall on the trajectory");
  }

  async explodeFireball(handleId: string) {
    const tracked = this.ctx.sync.get<Fireball>(handleId);

    if (!tracked?.currentEntity) throw new Error("Fireball no longer exists.");

    // Check if fireball is already destroyed, with 100ms grace period
    if (tracked?.currentEntity.destroyedAt) {
      if (Date.now() - tracked.currentEntity.destroyedAt > 100) {
        throw new Error("Cannot explode fireball - already destroyed.");
      }
    }

    const damage = tracked.currentEntity.damage;

    const radius = Math.sqrt(damage) / 2;
    const position = tracked.currentEntity.position.clone();

    const explosion = new FireballExplosion({
      position,
      power: damage,
      radius,
      sourceEntity: tracked.currentEntity
    });
    this.ctx.level?.addEntity(explosion);

    // Only remove if not already destroyed
    if (!tracked.currentEntity.destroyedAt) {
      this.ctx.level?.removeEntity(tracked.currentEntity.id);
      tracked.currentEntity.destroy();
    }
  }
}
