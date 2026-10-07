import { RayColliderIntersection } from "@dimforge/rapier2d-compat";
import { Object3D, Vector2 } from "three";

import {
  BaseEntityType,
  ElementalType,
  EntityLifecycleEvents,
  EntityProps
} from "src/api/entity";
import { SoundType } from "src/api/sound";
import { createTypedEventEmitter } from "src/api/util";
import { kInvPixelScale } from "src/engine/constants/scaling";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import { getAsset, setAssetDependencies } from "src/engine/entity/decorators";
import { kWorldGravity } from "src/engine/level/Level";
import type { EntityNetSummary } from "src/multiplayer/api";
import { PositionalSound } from "src/engine/sound/Sound";
import { vector3To2 } from "src/engine/util/vecTypes";
import { CallbackTriggerManagerBehavior } from "src/entities/shared/behaviors/CallbackTriggerManagerBehavior";
import {
  ProjectilePhysicsBehavior,
  ProjectilePhysicsEvents
} from "src/entities/shared/behaviors/ProjectilePhysics";
import { SmokeParticlesBehavior } from "src/entities/shared/behaviors/SmokeParticles";
import { isAnyPlatform, isAnyTerrain } from "src/entities/terrain/allTerrain";

import {
  TrailRenderingBehavior,
  TravelEvents,
  TravelEventsTypes
} from "./TrailRendering";

export { TrailRenderingBehavior, TravelEvents };
export type { TravelEventsTypes };

export type FireballProps = EntityProps & {
  damage?: number;
};

@setAssetDependencies(() => ["fireSound"])
export class Fireball extends CoreEntity {
  static type = "Fireball";
  public type = "Fireball";
  public object3D = new Object3D();
  public behaviors = {
    projectilePhysics: new ProjectilePhysicsBehavior(),
    trailRender: new TrailRenderingBehavior(),
    smokeRender: new SmokeParticlesBehavior(),
    callbackTrigger: new CallbackTriggerManagerBehavior()
  };
  public damage = 5;
  public destroyedAt?: number;
  public onImpactCallbacks: (() => void)[] = [];
  private sourceEntity?: BaseEntityType;
  public targetPos?: Vector2;
  public travelEvents = createTypedEventEmitter<TravelEventsTypes>();

  private readonly fireSound = new PositionalSound(
    SoundType.SFX,
    this.object3D,
    getAsset("fireSound")
  )
    .setVolume(0.15)
    .setPitchVariation(160);

  constructor(props: FireballProps) {
    super(props);
    this.damage = props.damage ?? this.damage;
    this.behaviors.projectilePhysics.init(this);
    this.behaviors.projectilePhysics.velocity.set(1, 0);
    this.behaviors.projectilePhysics.events.on(
      ProjectilePhysicsEvents.CollideWithEntity,
      ([entity, pos, normal]) => {
        this.behaviors.projectilePhysics.enabled = false;
        this.position.x = pos.x;
        this.position.y = pos.y;
        this.object3D.position.x = pos.x;
        this.object3D.position.y = pos.y;
        this.scheduler.add({
          id: "projectileCollisionFade",
          duration: 100,
          invokeFunction: (t) => {
            this.behaviors.trailRender.setOpacity(1 - t);
          },
          invokeFunctionAtComplete: () => {
            this.level?.removeEntity(this.id);
            this.destroy();
          }
        });
        entity.hit?.({
          hittingEntity: this,
          sourceEntity: this.sourceEntity ?? this,
          hitImpulse: this.behaviors.projectilePhysics.velocity
            .clone()
            .normalize()
            .multiplyScalar(2),
          damage: this.damage,
          elementalDamageType: ElementalType.Fire
        });
        for (const cb of this.onImpactCallbacks) cb();
      }
    );

    this.travelEvents.on(TravelEvents.reachedDestination, () => {
      this.setVelocity(new Vector2(0, 0));
      this.setGravity(1);
      this.targetPos = undefined;
    });

    this.travelEvents.on(TravelEvents.notReachedDestination, () => {
      this.setVelocity(new Vector2(0, 0));
      this.setGravity(1);
      this.targetPos = undefined;
    });

    this.behaviors.trailRender.radius =
      Math.sqrt(this.damage) * kInvPixelScale * 0.8;
    this.behaviors.trailRender.init(this);
    this.behaviors.smokeRender.init(this);
    this.object3D.position.copy(this.position);

    this.behaviors.callbackTrigger.init(this).attach({
      mode: "event",
      emitter: this.events,
      event: EntityLifecycleEvents.AttachToLevel,
      onActivation: () => {
        const newDetune = this.damage * 5;

        this.fireSound.setDetune(newDetune).play();
      }
    });
  }
  ignoreEntity(entityId: string) {
    this.behaviors.projectilePhysics.ignoreEntityIds.add(entityId);
    return this;
  }
  setSourceEntity(sourceEntity: BaseEntityType) {
    this.sourceEntity = sourceEntity;
    return this;
  }

  deflect(newVelocity: Vector2, deflectorId: string) {
    this.scheduler.cancel("projectileCollisionFade");
    this.behaviors.projectilePhysics.enabled = true;
    this.behaviors.projectilePhysics.velocity.copy(newVelocity);
    this.behaviors.trailRender.setOpacity(1);
    this.behaviors.projectilePhysics.ignoreEntityIds.clear();
    this.behaviors.projectilePhysics.ignoreEntityIds.add(deflectorId);
    return this;
  }

  setVelocity(velocity: Vector2) {
    this.behaviors.projectilePhysics.velocity.copy(velocity);
    return this;
  }

  moveTo(position: Vector2, speed: number) {
    if (this.level == null) return;
    const level = this.level;

    if (this.targetPos != null)
      this.travelEvents.emit(TravelEvents.notReachedDestination);

    //Prepares the raycast checking
    const delta = position.clone().sub(vector3To2(this.position));

    const ray = new level.rapier.Ray(
      { x: this.position.x, y: this.position.y },
      { x: delta.x, y: delta.y }
    );

    let hitTerrain = false;

    // Ray cast with terrain
    const hitCb = (hit: RayColliderIntersection) => {
      const hitEntityId = level.getEntityIdForCollider(hit.collider.handle);
      if (!hitEntityId) return true;

      const hitEntity = level.getEntity(hitEntityId);
      if (!hitEntity) return true;

      if (isAnyTerrain(hitEntity)) {
        if (isAnyPlatform(hitEntity)) {
          const hitDistance = hit.timeOfImpact;
          const hitPos = vector3To2(this.position).add(
            delta.clone().multiplyScalar(hitDistance)
          );
          if (this.position.y < hitPos.y) return true;
        }

        hitTerrain = true;
        return false;
      }
      return true;
    };

    level.world.intersectionsWithRay(ray, 1, false, hitCb);

    if (hitTerrain) return false;

    this.setGravity(0);
    this.setVelocity(delta.normalize().multiplyScalar(speed));
    this.targetPos = position;

    return true;
  }

  setGravity(gravityScale: number) {
    this.behaviors.projectilePhysics.gravity = {
      x: kWorldGravity.x * gravityScale,
      y: kWorldGravity.y * gravityScale
    };
  }

  destroy() {
    super.destroy();
    this.destroyedAt = Date.now();
    if (this.targetPos != null)
      this.travelEvents.emit(TravelEvents.notReachedDestination);

    this.fireSound.dispose(500);
  }

  step(ms: number) {
    super.step(ms);

    if (this.targetPos != null)
      if (
        this.targetPos &&
        this.targetPos.clone().sub(vector3To2(this.position)).lengthSq() < 0.1
      ) {
        this.travelEvents.emit(TravelEvents.reachedDestination);
      }
  }

  extraSpellBindingData() {
    const vel = this.behaviors.projectilePhysics.velocity;
    return {
      velocity: {
        x: vel.x,
        y: vel.y
      }
    };
  }

  /**
   * Multiplayer summary for remote FireballStubs. `acc` is the projectile's
   * exact current gravity, so dead reckoning is exact between the course
   * changes spells make (moveTo/deflect/setVelocity) — each of those just
   * changes what the next report carries.
   */
  getNetSummary(): EntityNetSummary {
    const projectile = this.behaviors.projectilePhysics;
    return {
      pos: { x: this.position.x, y: this.position.y },
      vel: { x: projectile.velocity.x, y: projectile.velocity.y },
      acc: { x: projectile.gravity.x, y: projectile.gravity.y },
      damage: this.damage,
      flying: projectile.enabled
    };
  }
}
