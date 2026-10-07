import { RayColliderIntersection } from "@dimforge/rapier2d-compat";
import { Color, Object3D, Vector2 } from "three";
import { lerp } from "three/src/math/MathUtils.js";

import { BaseEntityType, EntityProps } from "src/api/entity";
import { createTypedEventEmitter } from "src/api/util";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import { kWorldGravity } from "src/engine/level/Level";
import { toVector2, vector3To2 } from "src/engine/util/vecTypes";
import { GlowParticlesBehavior } from "src/entities/shared/behaviors/GlowParticles";
import { ProjectilePhysicsBehavior } from "src/entities/shared/behaviors/ProjectilePhysics";
import { isAnyPlatform, isAnyTerrain } from "src/entities/terrain/allTerrain";

const HEAL_SPARKLE_COLOR = 0x87ff91;

export type HealingSparkleProps = EntityProps & {
  healPower: number;
  healDuration: number;
  casterEntity: BaseEntityType;
};

export enum TravelEvents {
  reachedDestination = "reachedDestination",
  notReachedDestination = "notReachedDestination"
}

export type TravelEventsTypes = {
  [TravelEvents.reachedDestination]: void;
  [TravelEvents.notReachedDestination]: void;
};

export class HealingSparkle extends CoreEntity {
  static type = "HealingSparkle";
  public type = "HealingSparkle";
  public object3D = new Object3D();
  public healingGlow = new GlowParticlesBehavior();
  public behaviors = {
    projectilePhysics: new ProjectilePhysicsBehavior(),
    smokeRender: this.healingGlow
  };
  public healPower = 5;
  public healDuration = 5;
  private sourceEntity: BaseEntityType;

  public travelEvents = createTypedEventEmitter<TravelEventsTypes>();

  constructor(props: HealingSparkleProps) {
    super(props);
    this.healPower = props.healPower;
    this.healDuration = props.healDuration;

    this.behaviors.projectilePhysics.init(this);
    this.behaviors.projectilePhysics.velocity.set(0, 0);
    this.setGravity(0);

    this.travelEvents.on(TravelEvents.notReachedDestination, () => {
      this.setGravity(-1);
    });
    this.travelEvents.on(TravelEvents.reachedDestination, () => {
      this.setGravity(0);
    });

    this.behaviors.smokeRender.init(this);
    this.behaviors.smokeRender.object3D.position.setZ(10);
    this.behaviors.smokeRender.particleSettings.color = new Color(
      HEAL_SPARKLE_COLOR
    );
    this.behaviors.smokeRender.maxParticles = 512;
    this.behaviors.smokeRender.particleSettings.msBetweenSpawn = 10;
    this.behaviors.smokeRender.particleSettings.lifetimeMsVariance = 0;
    this.behaviors.smokeRender.particleSettings.transform = (particle, ms) => {
      particle.size = 0.3 * (ms / particle.lifetimeMs);
      particle.opacity = 1 - ms / particle.lifetimeMs;
      particle.velocity.x = (Math.random() - 0.5) * 0.01;
      //particle.velocity.y = 0;
      particle.velocity.y = (Math.random() - 0.5) * 0.008;
    };

    this.object3D.position.copy(this.position);
    this.sourceEntity = props.casterEntity;

    //Expire the sparkle with the duration of the spell
    this.scheduler.add({
      startIn: 0,
      duration: (this.healDuration - 1) * 1000,
      invokeFunction: (t) => {
        //Logic to move the sparkle with the player
        const destinationVec: Vector2 = toVector2(this.sourceEntity.position); // Player position
        destinationVec.add(new Vector2(Math.cos(t * 10.0) / 10.0, 0)); // Left and right
        destinationVec.add(new Vector2(0, lerp(-0.7, 0.8, t))); // Upward
        this.position.setX(destinationVec.x).setY(destinationVec.y);
      },
      invokeFunctionAtComplete: () => {
        this.level?.removeEntity(this.id);
        this.destroy();
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

  setVelocity(velocity: Vector2) {
    this.behaviors.projectilePhysics.velocity.copy(velocity);
    return this;
  }

  moveTo(position: Vector2, speed: number) {
    if (this.level == null) return;
    const level = this.level;

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

    return true;
  }

  setGravity(gravityScale: number) {
    this.behaviors.projectilePhysics.gravity = {
      x: kWorldGravity.x * gravityScale,
      y: kWorldGravity.y * gravityScale
    };
  }

  destroy(): void {
    super.destroy();
  }

  step(ms: number) {
    super.step(ms);
  }
}
