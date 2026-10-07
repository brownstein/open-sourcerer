import { Collider } from "@dimforge/rapier2d-compat";

import {
  BaseEntityType,
  EntityBehavior,
  EntityLifecycleEvents,
  LevelAPI
} from "src/api/entity";
import { sensorCollisionGroup } from "src/engine/constants/collisionGroups";
import { createTypedEventEmitter } from "src/api/util";

export enum AreaSensorEvents {
  EntityContact = "EntityContact",
  EntityContactEnd = "EntityContactEnd"
}

export type AreaSensorEventTypes = {
  [AreaSensorEvents.EntityContact]: BaseEntityType;
  [AreaSensorEvents.EntityContactEnd]: BaseEntityType;
};

export type AreaSensorBehaviorProps = {
  padding?: number;
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;
};

export class AreaSensorBehavior implements EntityBehavior {
  public type = "AreaSensor";
  public padding = 0;
  public paddingTop: number;
  public paddingRight: number;
  public paddingBottom: number;
  public paddingLeft: number;
  public contactedEntityIds = new Set<string>();
  public readonly events = createTypedEventEmitter<AreaSensorEventTypes>();
  private level?: LevelAPI;
  protected entity?: BaseEntityType;
  protected sensor?: Collider;
  constructor(props?: AreaSensorBehaviorProps) {
    this.padding = props?.padding ?? this.padding;
    this.paddingTop = props?.paddingTop ?? this.padding;
    this.paddingRight = props?.paddingRight ?? this.padding;
    this.paddingBottom = props?.paddingBottom ?? this.padding;
    this.paddingLeft = props?.paddingLeft ?? this.padding;
  }
  init(entity: BaseEntityType) {
    this.entity = entity;
    this.entity.events.on(EntityLifecycleEvents.Step, this.step.bind(this));
  }
  attachToLevel(level: LevelAPI) {
    this.level = level;
    if (!this.entity) return;
    const { ColliderDesc } = level.rapier;
    const sensorWidth =
      this.entity.size.width - this.paddingLeft - this.paddingRight;
    const sensorHeight =
      this.entity.size.height - this.paddingTop - this.paddingBottom;
    const offsetX = (this.paddingLeft - this.paddingRight) / 2;
    const offsetY = (this.paddingBottom - this.paddingTop) / 2;
    const colliderDesc = ColliderDesc.cuboid(
      sensorWidth * 0.5,
      sensorHeight * 0.5
    )
      .setTranslation(
        this.entity.position.x + offsetX,
        this.entity.position.y + offsetY
      )
      .setRotation(this.entity.angle)
      .setCollisionGroups(sensorCollisionGroup)
      .setSensor(true);
    this.sensor = level.world.createCollider(colliderDesc);
    level.registerSensor(this.entity.id, this.sensor.handle);
  }
  detachFromLevel(level: LevelAPI) {
    if (this.sensor) level.world.removeCollider(this.sensor, false);
    this.sensor = undefined;
    this.level = undefined;
  }
  step() {
    if (!this.sensor || !this.entity) return;
    const offsetX = (this.paddingLeft - this.paddingRight) / 2;
    const offsetY = (this.paddingBottom - this.paddingTop) / 2;
    this.sensor.setTranslation({
      x: this.entity.position.x + offsetX,
      y: this.entity.position.y + offsetY
    });
    const newContactSet = new Set<string>();
    this.level?.world.intersectionPairsWith(this.sensor, (collider2) => {
      const otherEntityId = this.level?.getEntityIdForCollider(
        collider2.handle
      );
      if (!otherEntityId) return;
      newContactSet.add(otherEntityId);
    });
    for (const entityId of newContactSet) {
      if (this.contactedEntityIds.has(entityId)) continue;
      const entity = this.level?.getEntity(entityId);
      if (!entity) continue;
      this.events.emit(AreaSensorEvents.EntityContact, entity);
    }
    for (const entityId of this.contactedEntityIds) {
      if (newContactSet.has(entityId)) continue;
      const entity = this.level?.getEntity(entityId);
      if (!entity) continue;
      this.events.emit(AreaSensorEvents.EntityContactEnd, entity);
    }
    this.contactedEntityIds = newContactSet;
  }
}
