import { Color, Vector2, Vector3 } from "three";
import { IVector2 } from "three-aseprite";

import { EntityLifecycleEvents } from "src/api/entity";
import { typedEmitterPromise } from "src/api/util";
import { kWorldGravity } from "src/engine/level/Level";
import { vector3To2 } from "src/engine/util/vecTypes";
import { isPlayerAPI } from "src/entities/player/PlayerAPI";
import {
  GenericProjectile,
  TravelEvents,
  getElementalDefaultGravityCoefficient
} from "src/entities/spells/projectiles/GenericProjectile";
import { DamageType, ElementalType } from "src/api/entity";
import {
  SpellRuntimeModuleCtxAPI,
  SpellRuntimeModuleEvents
} from "src/scripting/runtime/SpellRuntimeAPI";

import { assertAutoBindableNativeModule } from "../autoAPI";
import { resolveTrackedCaster } from "../shared/resolveCaster";
import { runtimeCastSequence } from "../shared/runtimeCastSequence";

type ColorRGB = { r: number; g: number; b: number };

function rgbToColor(rgb?: ColorRGB | null): Color | undefined {
  if (!rgb) return undefined;
  return new Color(rgb.r, rgb.g, rgb.b);
}

const elementalTypeValues = Object.values(ElementalType);
const damageTypeValues = Object.values(DamageType);

@assertAutoBindableNativeModule
export default class ProjectileNative {
  private ctx: SpellRuntimeModuleCtxAPI;
  private projectilesInCurrentLevel = new Set<string>();

  constructor(ctx: SpellRuntimeModuleCtxAPI) {
    this.ctx = ctx;
    this.ctx.moduleEvents.on(SpellRuntimeModuleEvents.setLevel, () => {
      this.projectilesInCurrentLevel.clear();
    });
  }

  async createProjectile(props: {
    // Stub handle assigned by the pseudo runtime so the entity is tracked under
    // the same id the worker-side Projectile already registered.
    useHandleId: string;
    casterId?: string;
    velocity?: IVector2;
    strength?: number;
    aim?: boolean;
    aimSpeed?: number;
    aimGuide?: boolean;
    directPath?: boolean;
    colorInner?: ColorRGB;
    colorOuter?: ColorRGB;
    colorTrail?: ColorRGB;
    opacityInner?: number;
    opacityOuter?: number;
    radius?: number;
    gravity?: number;
    enableParticles?: boolean;
    particleColor?: ColorRGB;
    elementalType?: string;
    damageType?: string;
    trailMaxLength?: number;
    trailLengthMs?: number;
  }) {
    const {
      useHandleId,
      casterId: casterIdIn,
      velocity: velocityIn,
      strength: strengthIn,
      aim,
      aimSpeed = 15,
      aimGuide: showAimGuide = true,
      directPath = true
    } = props;
    const trackedCaster = resolveTrackedCaster(this.ctx, casterIdIn);
    const manaCost = strengthIn ?? 15;
    const damage = manaCost;
    const castSpeedMultiplier = 15 / Math.sqrt(damage + 1);

    const resolvedElementalType = props.elementalType
      ? elementalTypeValues.find((v) => v === props.elementalType) ??
        ElementalType.Mana
      : ElementalType.Mana;
    const effectiveGravityCoefficient =
      props.gravity ??
      getElementalDefaultGravityCoefficient(resolvedElementalType);

    let aimGuideConfig;
    if (aim && showAimGuide && trackedCaster?.currentEntity) {
      aimGuideConfig = {
        getOrigin: () =>
          vector3To2(
            trackedCaster.currentEntity?.getCastOrigin() ?? new Vector3()
          ),
        speed: aimSpeed,
        gravity: kWorldGravity.y * effectiveGravityCoefficient,
        directPath,
        color: 0x44ddff
      };
    }

    const castSequence = await runtimeCastSequence(this.ctx, {
      overrideTrackedCaster: trackedCaster?.trackingId,
      color: 0x44ddff,
      speed: castSpeedMultiplier,
      manaCost,
      aim,
      aimGuide: aimGuideConfig
    });

    if (!castSequence.trackedCaster.currentEntity)
      throw new Error(
        "[Projectile]: Broken invariant - current caster not found."
      );
    const castPosition =
      castSequence.trackedCaster.currentEntity.getCastOrigin();

    const resolvedDamageType = props.damageType
      ? damageTypeValues.find((v) => v === props.damageType)
      : undefined;

    const projectile = new GenericProjectile({
      position: castPosition,
      damage,
      elementalType: resolvedElementalType,
      damageType: resolvedDamageType,
      colorInner: rgbToColor(props.colorInner),
      colorOuter: rgbToColor(props.colorOuter),
      colorTrail: rgbToColor(props.colorTrail),
      opacityInner: props.opacityInner,
      opacityOuter: props.opacityOuter,
      radius: props.radius,
      gravity: props.gravity,
      enableParticles: props.enableParticles,
      particleColor: rgbToColor(props.particleColor),
      trailMaxLength: props.trailMaxLength,
      trailLengthMs: props.trailLengthMs
    });

    projectile.setSourceEntity(castSequence.trackedCaster.currentEntity);

    // Resolve velocity.
    let castVelocity: Vector2 | null = new Vector2();
    if (velocityIn) {
      castVelocity.x = velocityIn.x;
      castVelocity.y = velocityIn.y;
    } else if (castSequence.aimedAt) {
      castVelocity =
        projectile.behaviors.projectilePhysics.calculateVelocityToIntercept(
          castSequence.aimedAt,
          aimSpeed,
          directPath
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
          castSequence.trackedCaster.currentEntity.isFacingRight() ? 15 : -15;
        castVelocity.y = 0;
      } else {
        castVelocity.y = 10;
      }
    }

    projectile.setVelocity(castVelocity);

    projectile.ignoreEntity(castSequence.trackedCaster.currentEntity.id);
    const trackedRootCaster = resolveTrackedCaster(this.ctx);
    if (
      trackedRootCaster?.currentEntity &&
      trackedRootCaster.currentEntity.id !==
        castSequence.trackedCaster.currentEntity.id
    ) {
      projectile.ignoreEntity(trackedRootCaster.currentEntity.id);
    }

    this.ctx.level?.addEntity(projectile);
    this.projectilesInCurrentLevel.add(projectile.id);
    projectile.events.on(EntityLifecycleEvents.DetachFromLevel, () => {
      this.projectilesInCurrentLevel.delete(projectile.id);
    });

    const info = this.ctx.sync.track(projectile, null, false, useHandleId);
    this.ctx.sync.sync(info.trackingId);
    return {
      id: info.trackingId
    };
  }

  async setProjectileVelocity(handleId: string, velocity: IVector2) {
    const handle = this.ctx.sync.get<GenericProjectile>(handleId);
    if (!handle?.currentEntity)
      throw new Error("Cannot move projectile - no longer exists.");
    handle.currentEntity.setVelocity(new Vector2(velocity.x, velocity.y));
  }

  async moveProjectileTo(
    handleId: string,
    x: number,
    y: number,
    speed: number
  ) {
    const handle = this.ctx.sync.get<GenericProjectile>(handleId);
    if (!handle?.currentEntity)
      throw new Error("Cannot move projectile - no longer exists.");

    if (handle.currentEntity.moveTo(new Vector2(x, y), speed))
      return typedEmitterPromise(
        handle.currentEntity.travelEvents,
        TravelEvents.reachedDestination,
        TravelEvents.notReachedDestination
      ).catch((err) => {
        console.warn(err);
        throw new Error("Projectile did not reach its destination.");
      });
    else throw new Error("There's a wall on the trajectory");
  }

  checkLineOfSight(handleId: string, x: number, y: number) {
    const handle = this.ctx.sync.get<GenericProjectile>(handleId);
    if (!handle?.currentEntity)
      throw new Error("Cannot move projectile - no longer exists.");
    return handle.currentEntity.checkLineOfSightOpen(new Vector2(x, y));
  }

  teardown() {
    for (const id of this.projectilesInCurrentLevel) {
      const entity = this.ctx.level?.getEntity<GenericProjectile>(id);
      if (entity) {
        entity.die();
      }
    }
  }
}
