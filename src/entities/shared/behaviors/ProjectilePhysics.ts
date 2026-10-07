import {
  Collider,
  Ray,
  RayColliderIntersection
} from "@dimforge/rapier2d-compat";
import { Vector2, Vector3 } from "three";

import {
  BaseEntityType,
  EntityAlignment,
  EntityBehavior,
  EntityLifecycleEvents,
  LevelAPI
} from "src/api/entity";
import { createTypedEventEmitter } from "src/api/util";
import {
  checkCollisionGroupsMatch,
  projectilesCollisionGroup
} from "src/engine/constants/collisionGroups";
import { kWorldGravity } from "src/engine/level/Level";
import { vector3To2 } from "src/engine/util/vecTypes";
import { isLadderTerrain } from "src/entities/terrain/LadderTerrain";
import { isAnyPlatform, isAnyTerrain } from "src/entities/terrain/allTerrain";
import {
  calculateProjectileAngleToInterncept,
  calculateProjectilePositionAtTime
} from "src/util/projectileMath";

export enum ProjectilePhysicsEvents {
  CollideWithEntity = "CollideWithEntity"
}

export type ProjectilePhysicsEventTypes = {
  [ProjectilePhysicsEvents.CollideWithEntity]: [
    BaseEntityType,
    Vector2,
    Vector2
  ];
};

/**
 * Standard projectile physics handler.
 */
export class ProjectilePhysicsBehavior implements EntityBehavior {
  public type = "ProjectilePhysics";
  public collider?: Collider;
  public gravity = kWorldGravity;
  public velocity = new Vector2();
  public targetAlignment = EntityAlignment.Enemy;
  public ignoreEntityIds = new Set<string>();
  public enabled = true;
  public events = createTypedEventEmitter<ProjectilePhysicsEventTypes>();
  private currentlyIgnoredPlatformIds = new Set<number>();
  private previousPosition?: Vector2;
  private entity?: BaseEntityType;
  private level?: LevelAPI;
  private ray?: Ray;
  constructor() {
    this.step = this.step.bind(this);
  }
  init(entity: BaseEntityType) {
    this.entity = entity;
    this.entity.events.on(EntityLifecycleEvents.Step, this.step);
    this.previousPosition = vector3To2(this.entity.position);
    return this;
  }

  attachToLevel(level: LevelAPI) {
    const { entity } = this;
    this.level = level;
    this.ray = new level.rapier.Ray(
      { x: entity?.position.x ?? 0, y: entity?.position.y ?? 0 },
      { x: 1, y: 0 }
    );
  }

  calculateVelocityToIntercept(
    position: Vector2,
    speed: number,
    directPath: boolean = true
  ) {
    const { entity } = this;
    if (!entity) return null;

    const posRelative = new Vector2(
      position.x - entity.position.x,
      position.y - entity.position.y
    );

    //Only works if the gravity vector is vertical
    const angle = calculateProjectileAngleToInterncept(
      posRelative,
      speed,
      true,
      directPath,
      this.gravity.y
    );
    const velocity = new Vector2(
      speed * Math.cos(angle),
      speed * Math.sin(angle)
    );

    return velocity;
  }

  calculatePositionAtTime(time: number) {
    const { entity } = this;
    if (!entity) return null;

    const angle = Math.atan2(this.velocity.y, this.velocity.x);
    const speed = this.velocity.length();

    const position = calculateProjectilePositionAtTime(
      new Vector2(entity.position.x, entity.position.y),
      speed,
      angle,
      time,
      this.gravity.y
    );

    return new Vector3(position.x, position.y, entity.position.z);
  }

  calculateVelocityAtTime(time: number) {
    const { entity } = this;
    if (!entity) return null;

    return new Vector2(
      this.velocity.x,
      this.velocity.y + time * this.gravity.y
    );
  }

  step(ms: number) {
    const {
      enabled,
      entity,
      level,
      gravity,
      previousPosition,
      ray,
      velocity,
      ignoreEntityIds
    } = this;
    if (!enabled || !entity || !level || !previousPosition || !ray || !velocity)
      return;

    // Adjust position and velocity.
    const dt = ms * 0.001;
    entity.position.x += velocity.x * dt;
    entity.position.y += velocity.y * dt + 0.5 * gravity.y * dt * dt;
    velocity.y += gravity.y * dt;
    if (entity.object3D) {
      entity.object3D.position.x = entity.position.x;
      entity.object3D.position.y = entity.position.y;
    }

    // Collision check along the line of motion.
    ray.origin.x = previousPosition.x;
    ray.origin.y = previousPosition.y;
    ray.dir.x = entity.position.x - previousPosition.x;
    ray.dir.y = entity.position.y - previousPosition.y;
    let nearestHitDistance: number | undefined;
    let nearestHitEntity: BaseEntityType | undefined;
    const nextIgnoredPlatformIds = new Set<number>();
    const hitNormal = new Vector2();
    const hitSensors: BaseEntityType[] = [];

    const hitCb = (hit: RayColliderIntersection) => {
      if (hit.collider.isSensor()) {
        // Notify sensor entities about this projectile passing through.
        const sensorEntityId = level.getEntityIdForCollider(
          hit.collider.handle
        );
        if (sensorEntityId && entity) {
          const sensorEntity = level.getEntity(sensorEntityId);
          if (sensorEntity) hitSensors.push(sensorEntity);
        }
        return true;
      }
      // Only consider solid collisions within the actual frame movement.
      const hitDistance = hit.timeOfImpact;
      if (hitDistance > 1) return true;
      const hitColGroup = hit.collider.collisionGroups();
      if (!checkCollisionGroupsMatch(hitColGroup, projectilesCollisionGroup))
        return true;
      const hitEntityId = level.getEntityIdForCollider(hit.collider.handle);
      if (!hitEntityId) return true;
      if (ignoreEntityIds.has(hitEntityId)) return true;
      const hitEntity = level.getEntity(hitEntityId);
      if (!hitEntity || hitEntity.alignment === EntityAlignment.NPC)
        return true;
      // Don't hit ladders.
      if (isLadderTerrain(hitEntity)) {
        nextIgnoredPlatformIds.add(hit.collider.handle);
        return true;
      }
      if (isAnyTerrain(hitEntity)) {
        if (
          isAnyPlatform(hitEntity) &&
          (hit.normal.y < 0.2 ||
            this.currentlyIgnoredPlatformIds.has(hit.collider.handle))
        ) {
          nextIgnoredPlatformIds.add(hit.collider.handle);
          return true;
        }
      }
      if (
        nearestHitDistance === undefined ||
        nearestHitDistance > hitDistance
      ) {
        nearestHitDistance = hitDistance;
        nearestHitEntity = hitEntity;
        hitNormal.x = hit.normal.x;
        hitNormal.y = hit.normal.y;
      }
      return true;
    };

    if (ray.dir.x || ray.dir.y) {
      level.world.intersectionsWithRay(ray, 1.5, false, hitCb, undefined);
    }
    this.currentlyIgnoredPlatformIds = nextIgnoredPlatformIds;

    // Notify active sensors.
    for (const sensor of hitSensors) {
      const asNotify = sensor as unknown as {
        notifyProjectileContact?: Function;
      };
      if (typeof asNotify.notifyProjectileContact === "function") {
        asNotify.notifyProjectileContact(entity.id);
      }
    }

    // If we hit something, emit the resulting event.
    if (nearestHitEntity) {
      const hitPosition = new Vector2(ray.dir.x, ray.dir.y)
        .multiplyScalar(nearestHitDistance ?? 1)
        .add(previousPosition);
      this.events.emit(ProjectilePhysicsEvents.CollideWithEntity, [
        nearestHitEntity,
        hitPosition,
        hitNormal
      ]);
    }

    // Update previous position.
    previousPosition.x = entity.position.x;
    previousPosition.y = entity.position.y;
  }
}
