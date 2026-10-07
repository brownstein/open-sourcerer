import { Collider, RigidBody } from "@dimforge/rapier2d-compat";
import { Vector2 } from "three";

import { BaseEntityType, EntityBehavior, LevelAPI } from "src/api/entity";
import { terrainCollisionGroup } from "src/engine/constants/collisionGroups";

export class ShrineDoorPhysicsBehavior implements EntityBehavior {
  public type = "ShrineDoorPhysicsBehavior";
  public body?: RigidBody;
  public collider?: Collider;
  public enabled = true;
  public size = new Vector2(1, 1);
  private entity?: BaseEntityType;
  private level?: LevelAPI;
  init(entity: BaseEntityType) {
    this.entity = entity;
    this.size.x = this.entity.size.width;
    this.size.y = this.entity.size.height;
    return this;
  }
  setSize(size: Vector2) {
    this.size = size;
    return this;
  }
  enable() {
    this.enabled = true;
    this.body?.setEnabled(true);
    return this;
  }
  disable() {
    this.enabled = false;
    this.body?.setEnabled(false);
    return this;
  }
  attachToLevel(level: LevelAPI) {
    this.level = level;

    const { entity, size } = this;
    if (!entity) return;
    const { rapier, world } = level;
    const { ColliderDesc, RigidBodyDesc } = rapier;

    const rigidBodyDesc = RigidBodyDesc.fixed()
      .lockRotations()
      .setTranslation(entity.position.x, entity.position.y);
    this.body = world.createRigidBody(rigidBodyDesc);

    if (!this.enabled) this.body.setEnabled(false);

    const colliderDesc = ColliderDesc.cuboid(
      size.x * 0.5,
      size.y * 0.5
    ).setCollisionGroups(terrainCollisionGroup);
    this.collider = world.createCollider(colliderDesc, this.body);

    level.registerEntityPhysicsHooks({
      entityId: entity.id,
      rigidBodyHandle: this.body.handle,
      colliderHandles: [this.collider.handle]
    });
  }
  detachFromLevel() {
    const { body, level } = this;
    if (body && level) {
      level.world.removeRigidBody(body);
    }
    this.body = undefined;
    this.collider = undefined;
    this.level = undefined;
  }
}
