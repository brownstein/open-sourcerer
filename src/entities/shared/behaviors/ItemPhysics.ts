import { Collider, RigidBody } from "@dimforge/rapier2d-compat";
import { Vector2 } from "three";

import {
  BaseEntityType,
  EntityBehavior,
  EntityLifecycleEvents,
  LevelAPI
} from "src/api/entity";
import { createTypedEventEmitter } from "src/api/util";
import { itemCollisionGroup } from "src/engine/constants/collisionGroups";
import { kInvPixelScale, kPixelScale } from "src/engine/constants/scaling";

export enum ItemPhysicsEvents {
  CollideWithEntity = "CollideWithEntity"
}

export type ItemPhysicsEventTypes = {
  [ItemPhysicsEvents.CollideWithEntity]: [BaseEntityType, Vector2];
};

/**
 * Standard item physics handler.
 */
export class ItemPhysicsBehavior implements EntityBehavior {
  public type = "ItemPhysics";
  public body?: RigidBody;
  public colliders?: Collider[];
  public size = new Vector2(1, 1);
  public roundObject3DPosition = true;
  public lockRotations = true;
  public events = createTypedEventEmitter<ItemPhysicsEventTypes>();
  private gravityScale = 1;
  private level?: LevelAPI;
  private entity?: BaseEntityType;
  private collisionGroupBitmask = itemCollisionGroup;
  private entityIdsColliding: [string, Vector2][] = [];
  setSize(size: Vector2) {
    this.size = size;
    return this;
  }
  init(entity: BaseEntityType) {
    this.entity = entity;
    this.entity.events.on(EntityLifecycleEvents.Step, this.step.bind(this));
    this.size.x = this.entity.size.width;
    this.size.y = this.entity.size.height;
    return this;
  }
  attachToLevel(level: LevelAPI) {
    const { entity, size } = this;
    if (!entity) return;
    const { rapier, world } = level;
    const { ColliderDesc, RigidBodyDesc } = rapier;

    const rigidBodyDesc = RigidBodyDesc.dynamic();
    if (this.lockRotations) rigidBodyDesc.lockRotations();
    const body = world.createRigidBody(rigidBodyDesc);
    body.setTranslation(entity.position, true);
    body.setRotation(entity.angle, true);
    body.setGravityScale(this.gravityScale, false);

    const cornerRadius = Math.min(size.x * 0.2, size.y * 0.2);
    const colliderDesc = ColliderDesc.roundCuboid(
      size.x * 0.5 - cornerRadius,
      size.y * 0.5 - cornerRadius,
      cornerRadius
    );
    colliderDesc.setCollisionGroups(this.collisionGroupBitmask);
    colliderDesc.setActiveHooks(rapier.ActiveHooks.FILTER_CONTACT_PAIRS);
    colliderDesc.setActiveEvents(rapier.ActiveEvents.COLLISION_EVENTS);
    const collider = world.createCollider(colliderDesc, body);

    // Keep track of platform drop-though.
    level.registerEntityPhysicsHooks({
      entityId: entity.id,
      rigidBodyHandle: body.handle,
      colliderHandles: [collider.handle],
      beginCollision: (_thisEntity, otherEntity, normal) => {
        if (otherEntity) {
          this.entityIdsColliding.push([otherEntity.id, normal]);
        }
      }
    });

    this.level = level;
    this.body = body;
    this.colliders = [collider];
  }
  detachFromLevel() {
    const { body, level } = this;
    if (level && this.entity) {
      level.removeEntityPhysicsHooks(this.entity.id);
    }
    for (const collider of this.colliders ?? []) {
      level?.world.removeCollider(collider, false);
    }
    if (body && level) {
      level.world.removeRigidBody(body);
    }
    this.body = undefined;
    this.colliders = undefined;
    this.level = undefined;
  }

  setGravityScale(gravityScale: number): void {
    this.gravityScale = gravityScale;
    this.body?.setGravityScale(gravityScale, false);
  }

  step() {
    const { body, entity } = this;
    if (!body || !entity) return;
    const pos = body.translation();
    const rotation = body.rotation();
    entity.position.x = pos.x;
    entity.position.y = pos.y;
    entity.angle = rotation;
    const { object3D } = entity;
    if (!object3D) return;
    if (this.roundObject3DPosition) {
      object3D.position.x = kInvPixelScale * Math.round(pos.x * kPixelScale);
      object3D.position.y = kInvPixelScale * Math.round(pos.y * kPixelScale);
    } else {
      object3D.position.x = pos.x;
      object3D.position.y = pos.y;
    }
    object3D.rotation.z = rotation;
    if (this.entityIdsColliding.length > 0) {
      for (const [id, normal] of this.entityIdsColliding) {
        const otherEntity = this.level?.getEntity(id);
        if (!otherEntity) continue;
        this.events.emit(ItemPhysicsEvents.CollideWithEntity, [
          otherEntity,
          new Vector2(normal.x, normal.y)
        ]);
      }
      this.entityIdsColliding = [];
    }
  }
}
