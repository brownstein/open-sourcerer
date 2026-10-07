import { Collider, RigidBody } from "@dimforge/rapier2d-compat";
import { Object3D, Vector2, Vector3 } from "three";

import {
  BaseEntityType,
  EntityBehavior,
  EntityLifecycleEvents,
  LevelAPI
} from "src/api/entity";
import { CollisionBehavior } from "src/api/physics";
import { createTypedEventEmitter } from "src/api/util";
import { kInvPixelScale, kPixelScale } from "src/engine/constants/scaling";
import { CollisionHandleTracker } from "src/engine/util/collisionUtil";
import { isLadderTerrain } from "src/entities/terrain/LadderTerrain";
import { isWaterTerrain } from "src/entities/terrain/WaterTerrain";
import { isAnyPlatform } from "src/entities/terrain/allTerrain";
import { isCommonTerrain } from "src/entities/terrain/commonTerrainApi";

import { PhysicsBehaviorAPI } from "./PhysicsBehaviorAPI";

export enum CharacterPhysicsEvents {
  CollideWithEntity = "CollideWithEntity",
  OngoingColliderWithEntity = "OngoingColliderWithEntity",
  AttachLadder = "AttachLadder",
  DetachLadder = "DetachLadder",
  LadderFound = "LadderFound",
  PassBehindTerrain = "PassBehindTerrain",
  ExitTerrain = "ExitTerrain"
}

export type CharacterPhysicsEventTypes = {
  [CharacterPhysicsEvents.CollideWithEntity]: [BaseEntityType, Vector2];
  [CharacterPhysicsEvents.OngoingColliderWithEntity]: BaseEntityType;
  [CharacterPhysicsEvents.AttachLadder]: void;
  [CharacterPhysicsEvents.DetachLadder]: void;
  [CharacterPhysicsEvents.LadderFound]: void;
  [CharacterPhysicsEvents.PassBehindTerrain]: BaseEntityType;
  [CharacterPhysicsEvents.ExitTerrain]: BaseEntityType;
};

export type TrackedCollisionInfo = {
  passingThrough: boolean;
  solidContactCount: number;
  foregroundTerrain?: boolean;
};

/**
 * Standard character physics handler.
 */
export class CharacterPhysicsBehavior
  implements EntityBehavior, PhysicsBehaviorAPI
{
  static type = "CharacterPhysics";
  public type = "CharacterPhysics";
  static readonly LADDER_RECENT_TIMEOUT_MS = 150;
  public body?: RigidBody;
  public colliders?: Collider[];
  public size = new Vector2(1, 1);
  public roundObject3DPosition = true;
  public lockRotations = true;
  public shouldPushAwayOtherCharacterPhysics = true;
  public controlObject3D = true; // Disable this flag to de-sync from Three.js objects.
  public currentCollisionColliderHandles = new Set<number>();
  public collidedEntitiesToNormal = new Map<BaseEntityType, Vector2>();
  public currentCollisions = new Map<string, TrackedCollisionInfo>();
  public currentWater = new CollisionHandleTracker();
  public currentLadderColliders = new Set<number>();
  public currentRotation = 0;
  public events = createTypedEventEmitter<CharacterPhysicsEventTypes>();

  private level?: LevelAPI;
  private entity?: BaseEntityType;
  private droppingThroughPlatforms = false;
  private collisionGroupBitmask?: number;
  private gravityScale = 1;
  private damping = 0;
  private density = 1;
  private onLadder = false;
  private timeJumpedOffLadder = 0;
  private rotateObject3D?: Object3D;
  private ongoingCollisionsToResolve: string[] = [];

  setSize(size: Vector2) {
    this.size = size;
    return this;
  }
  setDensity(density: number) {
    this.density = density;
    return this;
  }
  setGravityScale(gravityScale: number) {
    this.gravityScale = gravityScale;
    if (this.body) this.body.setGravityScale(gravityScale, true);
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
  setRotation(rotation: number) {
    this.currentRotation = rotation;
    if (this.body) {
      this.body.setRotation(rotation, true);
    }
    return this;
  }
  setAngVel(angVel: number) {
    this.body?.setAngvel(angVel ?? 0, true);
    return this;
  }
  setRotateObject3D(rotateObject3D?: Object3D) {
    this.rotateObject3D = rotateObject3D;
    return this;
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
  setGroup(groupBitmask: number) {
    this.collisionGroupBitmask = groupBitmask;
    if (!this.colliders || !this.level) return this;
    for (const collider of this.colliders) {
      collider.setCollisionGroups(groupBitmask);
    }
    return this;
  }
  getGroup(): number | undefined {
    return this.collisionGroupBitmask;
  }
  attachToLevel(level: LevelAPI) {
    const { entity, size } = this;
    if (!entity) return;
    const { rapier, world } = level;
    const { ColliderDesc, RigidBodyDesc } = rapier;

    const rigidBodyDesc = RigidBodyDesc.dynamic();
    if (this.lockRotations) rigidBodyDesc.lockRotations();
    rigidBodyDesc.setGravityScale(this.gravityScale);
    rigidBodyDesc.setLinearDamping(this.damping);
    rigidBodyDesc.setAngularDamping(this.damping);
    const body = world.createRigidBody(rigidBodyDesc);
    body.setTranslation(entity.position, true);
    body.setRotation(entity.angle, true);
    // Enable CCD to handle fast motion.
    body.enableCcd(true);

    const cornerRadius = Math.min(size.x * 0.2, size.y * 0.2);
    const colliderDesc = ColliderDesc.roundCuboid(
      size.x * 0.5 - cornerRadius * 0.5,
      size.y * 0.5 - cornerRadius * 0.5,
      cornerRadius * 0.5
    );
    colliderDesc.setDensity(this.density);
    if (this.collisionGroupBitmask !== undefined) {
      colliderDesc.setCollisionGroups(this.collisionGroupBitmask);
    }
    colliderDesc.setActiveHooks(rapier.ActiveHooks.FILTER_CONTACT_PAIRS);
    colliderDesc.setActiveEvents(
      rapier.ActiveEvents.COLLISION_EVENTS |
        rapier.ActiveEvents.CONTACT_FORCE_EVENTS
    );
    const collider = world.createCollider(colliderDesc, body);

    // // This adds a secondary collider.
    // const bodyColliderDesc = ColliderDesc.roundCuboid(
    //   size.x * 0.5 - cornerRadius * 0.5,
    //   size.y * 0.5 - cornerRadius,
    //   cornerRadius * 0.5
    // );
    // bodyColliderDesc.setTranslation(0, cornerRadius);
    // if (this.collisionGroupBitmask !== undefined) {
    //   bodyColliderDesc.setCollisionGroups(this.collisionGroupBitmask);
    // }
    // bodyColliderDesc.setFriction(0);
    // bodyColliderDesc.setActiveHooks(rapier.ActiveHooks.FILTER_CONTACT_PAIRS);
    // bodyColliderDesc.setActiveEvents(rapier.ActiveEvents.COLLISION_EVENTS);
    // const bodyCollider = world.createCollider(bodyColliderDesc, body);

    // Keep track of platform drop-though.
    level.registerEntityPhysicsHooks({
      entityId: entity.id,
      rigidBodyHandle: body.handle,
      colliderHandles: [collider.handle],
      beginCollision: (
        _thisEntity,
        otherEntity,
        normal,
        _thisHandle,
        handle,
        isSolid
      ) => {
        this.currentCollisionColliderHandles.add(handle);
        if (otherEntity) {
          this.collidedEntitiesToNormal.set(otherEntity, normal.clone());

          this.events.emit(CharacterPhysicsEvents.CollideWithEntity, [
            otherEntity,
            new Vector2(normal.x, normal.y)
          ]);
        }

        // For character-on-character collisions, perform custom logic without colliding.
        const otherCharacterPhysics =
          otherEntity &&
          "physics" in otherEntity.behaviors &&
          (otherEntity.behaviors.physics as EntityBehavior).type ===
            CharacterPhysicsBehavior.type
            ? (otherEntity.behaviors.physics as CharacterPhysicsBehavior)
            : undefined;

        const shouldPushAway =
          otherCharacterPhysics &&
          this.shouldPushAwayOtherCharacterPhysics &&
          otherCharacterPhysics.shouldPushAwayOtherCharacterPhysics;

        if (shouldPushAway) {
          return CollisionBehavior.NoCollideWithCallback;
        }

        if (!otherEntity) return;

        // Keep track of water.
        if (isWaterTerrain(otherEntity)) {
          this.currentWater.add(otherEntity.id, handle);
          return;
        }

        // Keep track of ladders.
        if (isLadderTerrain(otherEntity)) {
          this.currentLadderColliders.add(handle);

          // Check to only fire once, for multiple segments of a ladder being climbed and overlapped.
          if (this.currentLadderColliders.size === 1) {
            this.events.emit(CharacterPhysicsEvents.LadderFound);
          }
        }

        // Keep track of foreground terrain.
        if (isCommonTerrain(otherEntity) && otherEntity.foreground) {
          let platformInfo = this.currentCollisions.get(otherEntity.id);
          if (!platformInfo) {
            platformInfo = {
              passingThrough: true,
              solidContactCount: 0,
              foregroundTerrain: true
            };
            this.currentCollisions.set(otherEntity.id, platformInfo);
            this.events.emit(
              CharacterPhysicsEvents.PassBehindTerrain,
              otherEntity
            );
          }
          platformInfo.solidContactCount++;
          return CollisionBehavior.NoCollide;
        }

        // Other than that, we just want to check platforms and ladders we're on top of.
        if (isAnyPlatform(otherEntity) || isLadderTerrain(otherEntity)) {
          let platformInfo = this.currentCollisions.get(otherEntity.id);
          if (!platformInfo) {
            if (isSolid) {
              platformInfo = {
                passingThrough: normal.y >= 0 || this.droppingThroughPlatforms,
                solidContactCount: isSolid ? 1 : 0
              };
              this.currentCollisions.set(otherEntity.id, platformInfo);
            }
          } else {
            if (isSolid) platformInfo.solidContactCount++;
            if (this.droppingThroughPlatforms) {
              platformInfo.passingThrough = true;
              if (isLadderTerrain(otherEntity)) this.attachLadder();
            }
          }
          if (platformInfo?.passingThrough) return CollisionBehavior.NoCollide;
        }
      },
      // For ongoing collisions, apply force to push the bodies apart.
      handleOngoingCollision: (otherEntity) => {
        if (!this.entity) return;
        this.ongoingCollisionsToResolve.push(otherEntity.id);
      },
      endCollision: (
        _thisEntity,
        otherEntity,
        _thisHandle,
        handle,
        isSolid
      ) => {
        this.currentCollisionColliderHandles.delete(handle);
        if (otherEntity) {
          this.collidedEntitiesToNormal.delete(otherEntity);
          this.currentWater.delete(otherEntity.id, handle);
          this.currentLadderColliders.delete(handle);
          if (this.currentLadderColliders.size === 0) {
            this.detachLadder();
          }
          const platformInfo = this.currentCollisions.get(otherEntity.id);
          if (platformInfo) {
            if (isSolid) platformInfo.solidContactCount--;
            if (platformInfo.solidContactCount <= 0) {
              this.currentCollisions.delete(otherEntity.id);
              if (platformInfo.foregroundTerrain)
                this.events.emit(
                  CharacterPhysicsEvents.ExitTerrain,
                  otherEntity
                );
            }
          }
        }
      }
    });

    this.level = level;
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
  dropThroughCurrentPlatform() {
    const { body, entity, level } = this;
    if (!body || !entity || !level) return;
    for (const [platformId, platformColl] of this.currentCollisions) {
      level.disableActiveCollisionsBetween(entity.id, platformId);
      platformColl.passingThrough = true;
    }
    for (const ladderColliderId of this.currentLadderColliders) {
      const ladderEntityId = level.getEntityIdForCollider(ladderColliderId);
      if (ladderEntityId) {
        this.attachLadder();
      }
    }
    body.applyImpulse({ x: 0, y: -1 }, true);
  }
  setDropThroughPlatforms(dropThrough: boolean) {
    this.droppingThroughPlatforms = dropThrough;
  }
  step() {
    const { body, entity, rotateObject3D, controlObject3D } = this;
    if (!body || !entity) return;
    const pos = body.translation();
    const rotation = body.rotation();
    entity.position.x = pos.x;
    entity.position.y = pos.y;
    entity.angle = rotation;
    const { object3D } = entity;
    if (!object3D || !controlObject3D) return;
    if (this.roundObject3DPosition) {
      object3D.position.x = kInvPixelScale * Math.round(pos.x * kPixelScale);
      object3D.position.y = kInvPixelScale * Math.round(pos.y * kPixelScale);
    } else {
      object3D.position.x = pos.x;
      object3D.position.y = pos.y;
    }
    if (rotateObject3D) {
      rotateObject3D.rotation.z = rotation;
    } else {
      object3D.rotation.z = rotation;
    }
    // Apply centering force when on a narrow ladder.
    if (this.onLadder) {
      this.applyLadderCenteringImpulse();
    }
    // Handle ongoing collisions.
    if (this.ongoingCollisionsToResolve.length > 0) {
      for (const otherEntityId of this.ongoingCollisionsToResolve) {
        const otherEntity = this.level?.getEntity(otherEntityId);
        if (!otherEntity) continue;
        if (
          "physics" in otherEntity.behaviors &&
          (otherEntity.behaviors.physics as CharacterPhysicsBehavior).type ===
            "CharacterPhysics"
        ) {
          const otherBehavior = otherEntity.behaviors
            .physics as CharacterPhysicsBehavior;
          if (entity.position.x > otherEntity.position.x) {
            this.body?.applyImpulse(new Vector2(0.5, 0), true);
            otherBehavior.body?.applyImpulse(new Vector2(-0.5, 0), true);
          } else {
            this.body?.applyImpulse(new Vector2(-0.5, 0), true);
            otherBehavior.body?.applyImpulse(new Vector2(0.5, 0), true);
          }
        }
        this.events.emit(
          CharacterPhysicsEvents.OngoingColliderWithEntity,
          otherEntity
        );
      }
      this.ongoingCollisionsToResolve = [];
    }
  }
  setRotationLocked(locked: boolean) {
    const { body } = this;
    this.lockRotations = locked;
    if (!body) return this;
    body.lockRotations(locked, true);
    return this;
  }
  setShouldPushAwayOtherCharacterPhysics(shouldPushAway: boolean): this {
    this.shouldPushAwayOtherCharacterPhysics = shouldPushAway;
    return this;
  }
  teleport(position: Vector3) {
    if (this.body) this.body.setTranslation(position, true);
  }
  isInWater() {
    return this.currentWater.any();
  }
  isLadderAvailable() {
    return this.currentLadderColliders.size !== 0;
  }
  isOnLadder() {
    return this.onLadder;
  }
  attachLadder() {
    if (!this.isLadderAvailable()) return;
    this.onLadder = true;
    this.body?.setGravityScale(0, true);
    this.body?.setLinearDamping(25);
    this.events.emit(CharacterPhysicsEvents.AttachLadder);
  }
  private applyLadderCenteringImpulse() {
    if (!this.body || !this.level) return;
    for (const handle of this.currentLadderColliders) {
      const entityId = this.level.getEntityIdForCollider(handle);
      if (!entityId) continue;
      const entity = this.level.getEntity(entityId);
      if (!entity || !isLadderTerrain(entity)) continue;
      // Only center on narrow (2-tile-wide = 1.0 game unit) ladders.
      if (Math.abs(entity.size.width - 1.0) < 0.1) {
        const currentPos = this.body.translation();
        const offset = entity.position.x - currentPos.x;
        const mass = this.body.mass();
        // Proportional impulse toward ladder center; high ladder damping (25)
        // ensures smooth deceleration without oscillation.
        this.body.applyImpulse({ x: mass * 15 * offset, y: 0 }, true);
        break;
      }
    }
  }
  detachLadder() {
    if (this.onLadder) {
      this.timeJumpedOffLadder = Date.now();
    }
    this.onLadder = false;
    this.body?.setGravityScale(this.gravityScale, true);
    this.body?.setLinearDamping(this.damping);
    this.events.emit(CharacterPhysicsEvents.DetachLadder);
  }
  wasRecentlyOnLadder() {
    return (
      Date.now() - this.timeJumpedOffLadder <
      CharacterPhysicsBehavior.LADDER_RECENT_TIMEOUT_MS
    );
  }
  disable() {
    if (this.body) this.body.setEnabled(false);
  }
  enable() {
    if (this.body) this.body.setEnabled(true);
  }
}
