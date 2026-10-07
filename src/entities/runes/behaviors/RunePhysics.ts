import { Collider, RigidBody } from "@dimforge/rapier2d-compat";
import { Vector2, Vector3 } from "three";

import {
  BaseEntityType,
  EntityBehavior,
  EntityLifecycleEvents,
  LevelAPI
} from "src/api/entity";
import { runesCollisionGroup } from "src/engine/constants/collisionGroups";
import { kInvPixelScale, kPixelScale } from "src/engine/constants/scaling";

export class RunePhysicsBehavior implements EntityBehavior {
  public type = "RunePhysics";
  public body?: RigidBody;
  public collider?: Collider;
  public size = new Vector2(1, 1);
  public enabled = true;
  public roundObject3DPosition = true;
  private level?: LevelAPI;
  private entity?: BaseEntityType;
  private collisionGroup = runesCollisionGroup;
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
    this.body?.setLinvel({ x: 0, y: 0 }, false);
    return this;
  }
  setCollisionGroup(collisionGroup: number) {
    this.collisionGroup = collisionGroup;
    if (this.collider) this.collider.setCollisionGroups(collisionGroup);
    return;
  }
  init(entity: BaseEntityType) {
    this.entity = entity;
    this.entity.events.on(EntityLifecycleEvents.Step, this.step.bind(this));
    this.entity.events.on(
      EntityLifecycleEvents.Teleport,
      this.teleport.bind(this)
    );
    this.size.x = this.entity.size.width;
    this.size.y = this.entity.size.height;
    return this;
  }
  attachToLevel(level: LevelAPI) {
    this.level = level;

    const { entity, size } = this;
    if (!entity) return;
    const { rapier, world } = level;
    const { ColliderDesc, RigidBodyDesc } = rapier;

    const rigidBodyDesc = RigidBodyDesc.dynamic()
      .lockRotations()
      .setTranslation(entity.position.x, entity.position.y);
    this.body = world.createRigidBody(rigidBodyDesc);

    if (!this.enabled) this.body.setEnabled(false);

    const cornerRadius = Math.min(size.x * 0.2, size.y * 0.2);
    const colliderDesc = ColliderDesc.roundCuboid(
      size.x * 0.5 - cornerRadius,
      size.y * 0.5 - cornerRadius,
      cornerRadius
    )
      .setCollisionGroups(this.collisionGroup)
      .setActiveHooks(rapier.ActiveHooks.FILTER_CONTACT_PAIRS)
      .setActiveEvents(rapier.ActiveEvents.COLLISION_EVENTS);
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
  step() {
    const { body, entity, enabled } = this;
    if (!body || !entity || !enabled) return;
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
  }
  teleport(pos: Vector3) {
    this.body?.setTranslation(pos, true);
  }
}
