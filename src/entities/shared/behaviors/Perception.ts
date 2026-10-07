import { RigidBody } from "@dimforge/rapier2d-compat";
import { Vector2, Vector3 } from "three";

import {
  BaseEntityType,
  EntityAlignment,
  EntityBehavior,
  EntityLifecycleEvents,
  LevelAPI
} from "src/api/entity";
import { createTypedEventEmitter } from "src/api/util";
import { Scheduler } from "src/engine/scheduling/Scheduler";
import { vector3To2 } from "src/engine/util/vecTypes";
import { isLineOfSightClear } from "src/entities/shared/lineOfSight";

export enum PerceptionEvents {
  // Raw perception events trigger when line of sight is
  // established and later broken.
  PerceiveEntityStart = "PerceiveEntityStart",
  PerceiveEntityEnd = "PerceiveEntityEnd",
  // Tracking events trigger when an entity is seen,
  // and then tracking is lost after a period of
  // not seeing the entity.
  EntityTrackingStart = "EntityTrackingStart",
  EntityTrackingEnd = "EntityTrackingEnd",

  EntityNearbyStart = "EntityNearbyStart",
  EntityNearbyEnd = "EntityNearbyEnd"
}

export type PerceptionEventTypes = {
  [PerceptionEvents.PerceiveEntityStart]: BaseEntityType;
  [PerceptionEvents.PerceiveEntityEnd]: string;
  [PerceptionEvents.EntityTrackingStart]: BaseEntityType;
  [PerceptionEvents.EntityTrackingEnd]: string;
  [PerceptionEvents.EntityNearbyStart]: BaseEntityType;
  [PerceptionEvents.EntityNearbyEnd]: string;
};

interface PerceptionProps {
  direction?: Vector2;
  spreadAngle?: number;
  sightDistance?: number;
  nearbyDistance?: number;
  farDistance?: number;
  sourceRigidBody?: RigidBody;
  trackingTimeoutMs?: number;
}

export class PerceptionBehavior implements EntityBehavior {
  public type = "Perception";
  public direction = new Vector2(1, 0);
  public spreadAngle = Math.PI / 4;
  public sightDistance = 8;
  public nearbyDistance = 3;
  public farDistance = 4;
  public currentEntityIdsInSight = new Set<string>();
  public readonly perceptionEvents =
    createTypedEventEmitter<PerceptionEventTypes>();
  private entity?: BaseEntityType;
  private level?: LevelAPI;
  private sourceRigidBody?: RigidBody;
  private perceiveAlignments: Set<EntityAlignment> = new Set([
    EntityAlignment.Player
  ]);
  private trackingTimeoutMs = 3000;
  private trackingLastSightedAtMs = new Map<string, number>();
  private entityNearby = new Set<string>();
  private scheduler = new Scheduler();
  constructor(props?: PerceptionProps) {
    this.step = this.step.bind(this);
    this.scanOnInterval = this.scanOnInterval.bind(this);

    if (!props) return;

    this.direction = props.direction ?? this.direction;
    this.spreadAngle = props.spreadAngle ?? this.spreadAngle;
    this.sightDistance = props.sightDistance ?? this.sightDistance;
    this.nearbyDistance = props.nearbyDistance ?? this.nearbyDistance;
    this.farDistance = props.farDistance ?? this.farDistance;
    this.sourceRigidBody = props.sourceRigidBody ?? this.sourceRigidBody;
    this.trackingTimeoutMs = props.trackingTimeoutMs ?? this.trackingTimeoutMs;
  }
  init(entity: BaseEntityType) {
    this.entity = entity;
    this.entity.events.on(EntityLifecycleEvents.Step, this.step);
    this.scheduler.add({
      duration: 100,
      startIn: Math.floor(Math.random() * 100),
      recurring: true,
      invokeFunctionAtComplete: this.scanOnInterval
    });
    return this;
  }
  attachToLevel(level: LevelAPI) {
    this.level = level;
  }
  detachFromLevel() {
    this.level = undefined;
  }
  setSourceBody(body: RigidBody | undefined) {
    this.sourceRigidBody = body;
    return this;
  }
  step(ms: number) {
    this.scheduler.step(ms);
  }
  setTrackingTimeout(ms: number) {
    this.trackingTimeoutMs = ms;
  }
  getTrackingTimeout() {
    return this.trackingTimeoutMs;
  }

  scanOnInterval() {
    const { entity, level } = this;
    if (!entity || !level) return;

    const visionDir = this.direction.clone().normalize();
    const spreadAngleCos = Math.cos(this.spreadAngle);

    const updatedEntityIdsInSight = new Set<string>();

    // Find matching entities near this position.
    for (const otherEntity of level.getEntities().values()) {
      if (
        otherEntity.alignment &&
        this.perceiveAlignments.has(otherEntity.alignment)
      ) {
        const otherEntityDelta = vector3To2(otherEntity.position).sub(
          vector3To2(entity.position)
        );
        const otherEntityDistance = otherEntityDelta.length();
        otherEntityDelta.normalize();
        const otherEntitySpreadAngleCos = otherEntityDelta.dot(visionDir);
        if (
          otherEntityDistance > this.sightDistance ||
          otherEntitySpreadAngleCos < spreadAngleCos
        )
          continue;

        if (
          isLineOfSightClear(
            level,
            entity.position.x,
            entity.position.y,
            otherEntity.position.x,
            otherEntity.position.y,
            this.sourceRigidBody
          )
        ) {
          updatedEntityIdsInSight.add(otherEntity.id);
        }
      }
    }

    // Emit update events for perception set.
    for (const updatedEntityId of updatedEntityIdsInSight) {
      const isNewTracking = !this.trackingLastSightedAtMs.has(updatedEntityId);
      const sightedEntity = level.getEntity(updatedEntityId);

      if (!this.currentEntityIdsInSight.has(updatedEntityId)) {
        if (!sightedEntity) continue;
        this.perceptionEvents.emit(
          PerceptionEvents.PerceiveEntityStart,
          sightedEntity
        );
      }
      this.trackingLastSightedAtMs.set(
        updatedEntityId,
        this.scheduler.currentTime()
      );
      if (isNewTracking) {
        if (!sightedEntity) continue;
        this.perceptionEvents.emit(
          PerceptionEvents.EntityTrackingStart,
          sightedEntity
        );
      }

      // Update the set of entities considered nearby.
      if (!sightedEntity) continue;
      const distToOtherSq = sightedEntity.position.distanceToSquared(
        this.entity?.position ?? new Vector3(Infinity, Infinity, Infinity)
      );

      if (distToOtherSq < this.nearbyDistance ** 2) {
        if (!this.entityNearby.has(updatedEntityId)) {
          this.entityNearby.add(updatedEntityId);
          this.perceptionEvents.emit(
            PerceptionEvents.EntityNearbyStart,
            sightedEntity
          );
        }
      } else if (distToOtherSq > this.farDistance ** 2) {
        if (this.entityNearby.has(updatedEntityId)) {
          this.perceptionEvents.emit(
            PerceptionEvents.EntityNearbyEnd,
            updatedEntityId
          );
          this.entityNearby.delete(updatedEntityId);
        }
      }
    }
    for (const oldEntityId of this.currentEntityIdsInSight) {
      if (!updatedEntityIdsInSight.has(oldEntityId)) {
        this.perceptionEvents.emit(
          PerceptionEvents.PerceiveEntityEnd,
          oldEntityId
        );
        if (this.entityNearby.has(oldEntityId)) {
          this.perceptionEvents.emit(
            PerceptionEvents.EntityNearbyEnd,
            oldEntityId
          );
          this.entityNearby.delete(oldEntityId);
        }
      }
    }

    // Update perception set.
    this.currentEntityIdsInSight = updatedEntityIdsInSight;

    // Update tracking.
    const schedulerMs = this.scheduler.currentTime();
    for (const [entityId, trackingStartedAtMs] of this
      .trackingLastSightedAtMs) {
      if (schedulerMs > trackingStartedAtMs + this.trackingTimeoutMs) {
        this.trackingLastSightedAtMs.delete(entityId);
        this.perceptionEvents.emit(
          PerceptionEvents.EntityTrackingEnd,
          entityId
        );
      }
    }
  }
  getTrackingEntityIds() {
    return new Set(this.trackingLastSightedAtMs.keys());
  }
  isTrackingEntity(entityId: string) {
    return this.trackingLastSightedAtMs.has(entityId);
  }
}
