import { Collider, RigidBody } from "@dimforge/rapier2d-compat";
import { Vector3 } from "three";

import {
  BaseEntityType,
  EntityBehavior,
  EntityLifecycleEvents,
  LevelAPI
} from "src/api/entity";
import { CollisionBehavior } from "src/api/physics";
import { playerCollisionGroup } from "src/engine/constants/collisionGroups";
import { kInvPixelScale, kPixelScale } from "src/engine/constants/scaling";
import { isAnyPlatform } from "src/entities/terrain/allTerrain";

import { PhysicsBehaviorAPI } from "./PhysicsBehaviorAPI";

export class FloatingSpherePhysicsBehavior
  implements EntityBehavior, PhysicsBehaviorAPI
{
  static type = "FloatingSpherePhysics";
  public type = FloatingSpherePhysicsBehavior.type;
  public body?: RigidBody;
  public colliders?: Collider[];
  public roundObject3DPosition = true;
  private radius = 0.4;
  private collisionGroupBitmask = playerCollisionGroup;
  private level?: LevelAPI;
  private entity?: BaseEntityType;
  private damping = 0.2;
  setRadius(radius: number) {
    this.radius = radius;
    return this;
  }
  setDamping(damping: number) {
    this.damping = damping;
    if (this.body) {
      this.body.setLinearDamping(damping);
      this.body.setAngularDamping(damping);
    }
    return this;
  }
  setGroup(groupBitmask: number) {
    this.collisionGroupBitmask = groupBitmask;
    if (!this.colliders || !this.level) return this;
    for (const collider of this.colliders) {
      collider.setCollisionGroups(groupBitmask);
    }
    return this;
  }
  init(entity: BaseEntityType) {
    this.entity = entity;
    this.entity.events.on(EntityLifecycleEvents.Step, this.step.bind(this));
    this.entity.events.on(EntityLifecycleEvents.Teleport, (pos) => {
      this.body?.setTranslation(pos, true);
    });
  }
  attachToLevel(level: LevelAPI) {
    const { entity } = this;
    this.level = level;
    if (!entity) return;
    const { rapier, world } = level;
    const { ColliderDesc, RigidBodyDesc } = rapier;

    const rigidBodyDesc = RigidBodyDesc.dynamic()
      .lockRotations()
      .setGravityScale(0)
      .setLinearDamping(this.damping)
      .setTranslation(entity.position.x, entity.position.y)
      .setCcdEnabled(true);
    const body = world.createRigidBody(rigidBodyDesc);
    const colliderDesc = ColliderDesc.ball(this.radius)
      .setFriction(0)
      .setCollisionGroups(this.collisionGroupBitmask);
    const collider = world.createCollider(colliderDesc, body);
    level.registerEntityPhysicsHooks({
      entityId: entity.id,
      rigidBodyHandle: body.handle,
      colliderHandles: [collider.handle],
      beginCollision: (_thisEntity, otherEntity) => {
        if (!otherEntity || isAnyPlatform(otherEntity))
          return CollisionBehavior.NoCollide;
        return CollisionBehavior.Collide;
      }
    });
    this.body = body;
    this.colliders = [collider];

    // Wire up impulse handling.
    this.entity?.events.on(EntityLifecycleEvents.Hit, (hit) => {
      if (!hit.hitImpulse) return;
      this.body?.applyImpulse(hit.hitImpulse, true);
    });
  }
  detachFromLevel() {
    const { body, level } = this;
    if (body && level) {
      level.world.removeRigidBody(body);
    }
    this.body = undefined;
    this.colliders = undefined;
    this.level = undefined;
  }
  step(ms: number) {
    const { body, entity } = this;
    if (!body || !entity) return;
    const pos = body.translation();
    const _rotation = body.rotation();
    entity.position.x = pos.x;
    entity.position.y = pos.y;
    const { object3D } = entity;
    if (object3D) {
      object3D.position.x = kInvPixelScale * Math.round(pos.x * kPixelScale);
      object3D.position.y = kInvPixelScale * Math.round(pos.y * kPixelScale);
    }
  }
  teleport(position: Vector3) {
    if (this.body) this.body.setTranslation(position, true);
  }
}
