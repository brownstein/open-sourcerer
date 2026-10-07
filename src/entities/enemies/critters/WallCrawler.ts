import { Collider, RigidBody } from "@dimforge/rapier2d-compat";
import { ProtoSpriteSheetThree } from "protosprite-three";
import { Color, Object3D, Vector2 } from "three";

import { EnemyProps } from "src/api/enemy";
import {
  BaseEntityType,
  ElementalType,
  EntityAlignment,
  EntityBehavior,
  EntityLifecycleEvents,
  EntityProps,
  LevelAPI
} from "src/api/entity";
import { CollisionBehavior } from "src/api/physics";
import { createTypedEventEmitter } from "src/api/util";
import {
  enemyCollisionGroup,
  inactiveCollisionGroup
} from "src/engine/constants/collisionGroups";
import { kInvPixelScale, kPixelScale } from "src/engine/constants/scaling";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import { addResourceLoader, getResource } from "src/engine/entity/decorators";
import { kWorldGravity } from "src/engine/level/Level";
import { ProtoSpriteLoader } from "src/engine/loader/Loaders";
import { vector3To2 } from "src/engine/util/vecTypes";
import { addDebugRay } from "src/entities/dev/DebugRayBatcher";
import { OutOfBoundsBehaviour } from "src/entities/shared/behaviors/OutOfBoundsBehaviour";
import { StatusBehavior } from "src/entities/shared/behaviors/StatusBehavior";
import { getEntityPalette } from "src/entities/shared/util/palette";
import { isLadderTerrain } from "src/entities/terrain/LadderTerrain";
import { isAnyTerrain } from "src/entities/terrain/allTerrain";
import { isDevMode } from "src/util/devUtil";
import { diffAngle, lerpAngle } from "src/util/lerp";

import {
  sprite_animations as WallCrawlerAnimation,
  sprite_layers as WallCrawlerLayer
} from "../sprites/wall-crawler/wall-crawler-types";
import wallCrawlerPrs from "../sprites/wall-crawler/wall-crawler.prs";

export type WallCrawlerProps = EntityProps &
  EnemyProps & {
    facingRight?: boolean;
    scale?: number;
    movementSpeed?: number;
  };

@addResourceLoader(new ProtoSpriteLoader("wallCrawlerSheet", wallCrawlerPrs))
export class WallCrawler extends CoreEntity {
  static type = "WallCrawler";
  public type = "WallCrawler";
  public alignment = EntityAlignment.Enemy;
  public elementalType?: ElementalType;
  public object3D = new Object3D();
  public spriteObject3D = new Object3D();
  private sprite = getResource<ProtoSpriteSheetThree>(
    WallCrawler,
    "wallCrawlerSheet"
  ).getSprite<WallCrawlerLayer, WallCrawlerAnimation>();
  private spriteDisposed = false;

  public behaviors = {
    status: new StatusBehavior().setMaxHealth(25),
    physics: new WallCrawlerPhysicsBehavior(),
    outOfBounds: new OutOfBoundsBehaviour()
  };

  constructor(props: WallCrawlerProps) {
    super(props);
    const { facingRight = true, scale = 1, movementSpeed = 1 } = props;

    this.elementalType = props.element ?? this.elementalType;
    const palette = this.elementalType
      ? getEntityPalette(this.elementalType, 2)
      : [0xee8800, 0xffbb66];

    this.object3D.add(this.spriteObject3D);
    this.sprite.gotoAnimation("Walk");
    this.sprite.center();
    this.sprite.fadeAllLayers(new Color(0x001122), 0.5, false);
    this.sprite.multiplyLayers(new Color(palette.at(0)), 0.8, "body");
    this.sprite.multiplyLayers(new Color(palette.at(1)), 0.8, [
      "left_hand",
      "right_hand",
      "rear_leg_a",
      "read_leg_b",
      "shadow_legs"
    ]);
    this.sprite.mesh.scale.multiplyScalar(kInvPixelScale * scale);
    this.sprite.mesh.scale.y *= -1;
    if (facingRight) this.sprite.mesh.scale.x *= -1;
    this.spriteObject3D.add(this.sprite.mesh);
    this.object3D.position.copy(this.position);

    this.behaviors.physics
      .init(this, this.spriteObject3D)
      .setSize(new Vector2(scale, scale * 0.8));
    this.behaviors.physics.facingRight = facingRight;
    this.behaviors.physics.movementSpeed = movementSpeed;
    this.behaviors.status.setMaxHealth(props.health ?? 25);
    this.behaviors.status.init(this).attachProtosSprite(this.sprite);
    this.behaviors.outOfBounds.init(this);

    this.events.on(EntityLifecycleEvents.Die, () => {
      this.behaviors.physics.wallCrawlingEnabled = false;
      this.behaviors.physics.setInactive();
      this.scheduler.add({
        id: "death",
        duration: 250,
        invokeFunction: (t) => {
          this.sprite.setOpacity(1 - t);
        },
        invokeFunctionAtComplete: () => {
          this.level?.removeEntity(this.id);
          this.disposeSprite();
        }
      });
    });

    // Hit things we collide with.
    this.behaviors.physics.events.on(
      // eslint-disable-next-line @typescript-eslint/no-use-before-define
      WallCrawlerPhysicsEvents.CollideWithEntity,
      ([entity, normal]) => {
        if (entity.alignment === EntityAlignment.Player) {
          entity.hit?.({
            hittingEntity: this,
            sourceEntity: this,
            damage: props.attack ? props.attack : 4,
            elementalDamageType: this.elementalType,
            hitImpulse: new Vector2(normal.x > 0 ? 15 : -15, normal.y)
          });
        }
      }
    );
  }
  step(ms: number) {
    super.step(ms);
    this.sprite.advance(ms);
  }
  destroy() {
    super.destroy();
    this.disposeSprite();
  }
  private disposeSprite() {
    if (this.spriteDisposed) return;
    this.spriteDisposed = true;
    this.sprite.dispose();
  }
}

export enum WallCrawlerPhysicsEvents {
  CollideWithEntity = "CollideWithEntity"
}

export type WallCrawlerPhysicsEventTypes = {
  [WallCrawlerPhysicsEvents.CollideWithEntity]: [BaseEntityType, Vector2];
};

export class WallCrawlerPhysicsBehavior implements EntityBehavior {
  public type = "WallCrawlerPhysics";
  public body?: RigidBody;
  public colliders?: Collider[];
  public size = new Vector2(1, 1);
  public facingRight = false;
  public movementSpeed = 1;
  public wallCrawlingEnabled = true;
  public events = createTypedEventEmitter<WallCrawlerPhysicsEventTypes>();
  private level?: LevelAPI;
  private entity?: BaseEntityType;
  private entityRotationObject3D?: Object3D;
  private collisionGroupBitmask = enemyCollisionGroup;
  private pivotPoint?: Vector2;
  private stuckFrames = 0;
  private lastStuckCheckPos = new Vector2();

  constructor() {
    this.step = this.step.bind(this);
  }
  setSize(size: Vector2) {
    this.size.copy(size);
    return this;
  }
  init(entity: BaseEntityType, object3D?: Object3D) {
    this.entity = entity;
    this.entityRotationObject3D = object3D;
    this.entity.events.on(EntityLifecycleEvents.Step, this.step);
    return this;
  }
  attachToLevel(level: LevelAPI) {
    const { entity, size } = this;
    if (!entity) return;
    const { rapier, world } = level;
    const { ColliderDesc, RigidBodyDesc } = rapier;

    const rigidBodyDesc = RigidBodyDesc.dynamic();
    const body = world.createRigidBody(rigidBodyDesc);
    body.setTranslation(entity.position, true);
    body.setRotation(entity.angle, true);

    const cornerRadius = Math.min(size.x * 0.2, size.y * 0.2);
    const points = new Float32Array(32);
    const r = Math.min(size.x, size.y) * 0.5;
    for (let i = 0; i < 8; i++) {
      const angle = (i * Math.PI) / 7;
      points[i * 2 + 0] = r * Math.cos(angle);
      points[i * 2 + 1] = r * Math.sin(angle);
    }
    for (let i = 0; i < 4; i++) {
      const angle = Math.PI * (1 + i / 4);
      points[16 + i * 2 + 0] =
        -r + cornerRadius + cornerRadius * Math.cos(angle);
      points[16 + i * 2 + 1] =
        -r + cornerRadius + cornerRadius * Math.sin(angle);
    }
    for (let i = 0; i < 4; i++) {
      const angle = Math.PI * (1.5 + i / 4);
      points[24 + i * 2 + 0] =
        r - cornerRadius + cornerRadius * Math.cos(angle);
      points[24 + i * 2 + 1] =
        -r + cornerRadius + cornerRadius * Math.sin(angle);
    }
    const colliderDesc = ColliderDesc.convexHull(points);
    if (!colliderDesc)
      throw new Error("Unable to generate convex hull for wall crawler.");
    colliderDesc.setCollisionGroups(this.collisionGroupBitmask);
    colliderDesc.setActiveHooks(rapier.ActiveHooks.FILTER_CONTACT_PAIRS);
    colliderDesc.setActiveEvents(rapier.ActiveEvents.COLLISION_EVENTS);
    colliderDesc.setMassProperties(4, new rapier.Vector2(0, 0), 4);
    colliderDesc.setFriction(0.01);
    const collider = world.createCollider(colliderDesc, body);

    level.registerEntityPhysicsHooks({
      entityId: entity.id,
      rigidBodyHandle: body.handle,
      colliderHandles: [collider.handle],
      beginCollision: (_thisEntity, otherEntity, normal) => {
        if (otherEntity) {
          this.events.emit(WallCrawlerPhysicsEvents.CollideWithEntity, [
            otherEntity,
            new Vector2(normal.x, normal.y)
          ]);
        }

        return otherEntity && isLadderTerrain(otherEntity)
          ? CollisionBehavior.NoCollide
          : CollisionBehavior.Collide;
      }
    });

    this.level = level;
    this.body = body;
    this.colliders = [collider];
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
  setInactive() {
    if (!this.colliders) return;
    for (const collider of this.colliders) {
      collider.setCollisionGroups(inactiveCollisionGroup);
    }
  }
  step(ms: number) {
    const { body, entity } = this;
    if (!body || !entity) return;

    if (this.wallCrawlingEnabled) {
      this.crawlSurfaces(ms);
    } else {
      this.body?.resetForces(true);
    }

    const pos = body.translation();
    const rotation = body.rotation();
    entity.position.x = pos.x;
    entity.position.y = pos.y;

    entity.angle = rotation;
    const object3D = entity.object3D;
    const rotationObject3D = this.entityRotationObject3D ?? object3D;
    if (!object3D || !rotationObject3D) return;

    object3D.position.x = pos.x;
    object3D.position.y = pos.y;

    rotationObject3D.rotation.z = rotation;
  }

  private crawlSurfaces(_ms: number) {
    const { body, entity, level, facingRight, size, movementSpeed } = this;
    if (!body || !entity || !level) return;

    const entityRotation = body.rotation();
    const motionAngle = entityRotation + (facingRight ? 0 : Math.PI);
    const downwardAngle = entityRotation - Math.PI * 0.5;
    const downwardVector = new Vector2(
      Math.cos(downwardAngle),
      Math.sin(downwardAngle)
    );
    const forwardVector = new Vector2(
      Math.cos(motionAngle),
      Math.sin(motionAngle)
    );

    // Cast rays
    const frontRayOrigin = vector3To2(entity.position)
      .add(downwardVector.clone().multiplyScalar(size.height * 0.4))
      .add(forwardVector.clone().multiplyScalar(size.width * 0.3));
    const frontRayResult = this.projectTerrainRay(
      frontRayOrigin,
      motionAngle,
      size.width * 0.25,
      0xff00ff
    );
    const bottomRayOrigin = vector3To2(entity.position).add(
      downwardVector.clone().multiplyScalar(size.height * 0.4)
    );
    const bottomRayResult = this.projectTerrainRay(
      bottomRayOrigin,
      downwardAngle,
      size.height * 0.5,
      0x00ffff
    );
    const downForwardAngle = lerpAngle(motionAngle, downwardAngle, 0.4);
    const downForwardRayResult = this.projectTerrainRay(
      bottomRayOrigin,
      downForwardAngle,
      size.width * 0.85,
      0xff2222
    );

    const backwardRayOrigin = vector3To2(entity.position)
      .add(downwardVector.clone().multiplyScalar(size.height * 0.8))
      .add(forwardVector.clone().multiplyScalar(size.width * -0.5));
    const downBackwardRayResult = this.projectTerrainRay(
      backwardRayOrigin,
      motionAngle,
      size.width,
      0xff2222
    );

    const currentLinVelRaw = body.linvel();
    const currentLinVel = new Vector2(currentLinVelRaw.x, currentLinVelRaw.y);

    let climbing = false;

    const mass = body.mass();
    body.resetForces(true);
    body.resetTorques(true);

    // When both bottom and front rays hit, use bottom ray (current surface)
    // UNLESS the front ray is very close, meaning the crawler is physically
    // pressed against a wall at a concave corner and needs to transition.
    const frontRayVeryClose =
      frontRayResult && frontRayResult.distance < size.width * 0.2;
    const useBottomRay = bottomRayResult && !frontRayVeryClose;

    if (useBottomRay) {
      const attachRayResult = bottomRayResult;
      climbing ||= attachRayResult.normal.y < 0.8;
      // Update pivot point to last known ground contact.
      this.pivotPoint = bottomRayResult?.position;
      // Align rotation to ground surface normal.
      const normalAngle = attachRayResult.normal.angle();
      const orientationAngle = normalAngle - Math.PI * 0.5;
      const desiredAngleDelta = diffAngle(entityRotation, orientationAngle);
      body.setAngvel(desiredAngleDelta * 15, true);
      // Push toward surface and move along tangent.
      let groundHugAmount = movementSpeed * 1.5;
      const distanceFromNormal = vector3To2(entity.position)
        .sub(attachRayResult.position)
        .dot(attachRayResult.normal);
      if (distanceFromNormal <= size.height * 0.5) groundHugAmount = 0;
      const attachTangent = attachRayResult.normal
        .clone()
        .rotateAround(
          new Vector2(),
          facingRight ? -Math.PI * 0.5 : Math.PI * 0.5
        );
      const currentSpeed = attachTangent.dot(currentLinVel);
      const speedDelta = movementSpeed - currentSpeed;
      body.addForce(
        attachTangent.clone().multiplyScalar(speedDelta * mass * 20),
        true
      );

      body.addForce(
        new Vector2(
          Math.cos(entityRotation + Math.PI * 0.5),
          Math.sin(entityRotation + Math.PI * 0.5)
        ).multiplyScalar(-groundHugAmount * mass * 100),
        true
      );
    } else if (frontRayResult) {
      // No ground contact but wall ahead - follow the wall surface.
      climbing ||= frontRayResult.normal.y < 0.8;
      const normalAngle = frontRayResult.normal.angle();
      const orientationAngle = normalAngle - Math.PI * 0.5;
      const desiredAngleDelta = diffAngle(entityRotation, orientationAngle);
      body.setAngvel(desiredAngleDelta * 3, true);
      let groundHugAmount = movementSpeed * 1.5;
      const distanceFromNormal = vector3To2(entity.position)
        .sub(frontRayResult.position)
        .dot(frontRayResult.normal);
      if (distanceFromNormal <= size.height * 0.5) groundHugAmount = 0;
      if (frontRayResult.distance < size.height * 0.25) groundHugAmount = 0;
      const attachTangent = frontRayResult.normal
        .clone()
        .rotateAround(
          new Vector2(),
          facingRight ? -Math.PI * 0.5 : Math.PI * 0.5
        );
      const currentSpeed = attachTangent.dot(currentLinVel);
      const speedDelta = movementSpeed - currentSpeed;
      body.addForce(
        attachTangent.clone().multiplyScalar(speedDelta * mass * 0.5),
        true
      );

      body.addForce(
        new Vector2(
          Math.cos(entityRotation + Math.PI * 0.5),
          Math.sin(entityRotation + Math.PI * 0.5)
        ).multiplyScalar(-groundHugAmount * mass * 30),
        true
      );
    } else {
      if (downForwardRayResult) {
        // Gap crossing: move forward with anti-gravity.
        const attachTangent = forwardVector;
        const currentSpeed = attachTangent.dot(currentLinVel);
        const speedDelta = movementSpeed - currentSpeed;
        body.addForce(
          attachTangent.clone().multiplyScalar(speedDelta * mass * 20),
          true
        );
        const antiGravity = new Vector2(-kWorldGravity.x, -kWorldGravity.y);
        antiGravity.multiplyScalar(mass);
        body.addForce(antiGravity, true);
        return;
      } else {
        if (!downBackwardRayResult) {
          climbing = false;
          return;
        }
      }

      if (this.pivotPoint) {
        climbing = true;
        // Edge pivoting: rotate around last known edge point.
        const orientationAngle =
          vector3To2(entity.position).sub(this.pivotPoint).angle() -
          Math.PI * 0.5;
        const desiredAngleDelta = diffAngle(entityRotation, orientationAngle);
        body.setAngvel(desiredAngleDelta * 10, true);
        // Move around pivot.
        const deltaFromPivot = vector3To2(entity.position).sub(this.pivotPoint);
        const distFromPivot = deltaFromPivot.length() - size.height * 0.5;
        const downwardForce = distFromPivot > 0 ? 2 : 0;
        const normalFromPivot = deltaFromPivot.clone().normalize();
        const tangentFromPivot = normalFromPivot
          .clone()
          .rotateAround(
            new Vector2(),
            facingRight ? Math.PI * -0.5 : Math.PI * 0.5
          );
        const currentSpeed = tangentFromPivot.dot(currentLinVel);
        const speedDelta = movementSpeed - currentSpeed;
        body.addForce(
          tangentFromPivot.clone().multiplyScalar(speedDelta * mass * 20),
          true
        );
        body.addForce(
          normalFromPivot.clone().multiplyScalar(-downwardForce * mass * 20),
          true
        );
      }
    }

    if (climbing) {
      const antiGravity = new Vector2(-kWorldGravity.x, -kWorldGravity.y);
      antiGravity.multiplyScalar(mass);
      body.addForce(antiGravity, true);
    }

    // Stuck detection: if position barely changes, force rotation to break free.
    const pos = vector3To2(entity.position);
    const distMoved = pos.distanceTo(this.lastStuckCheckPos);
    if (distMoved < 0.02) {
      this.stuckFrames++;
    } else {
      this.stuckFrames = 0;
    }
    this.lastStuckCheckPos.copy(pos);

    // After ~10 frames stuck, force rotation and nudge to break free of
    // concave corners. Ramp up the rotation with stuck duration.
    if (this.stuckFrames > 10) {
      const stuckExtra = this.stuckFrames - 10;
      const rotDir = facingRight ? 1 : -1;
      const rotAmount = Math.min(stuckExtra * 0.02, Math.PI * 0.25);
      body.setRotation(entityRotation + rotDir * rotAmount, true);
      body.setAngvel(0, true);
      // Nudge position in the tangent direction to escape the wedge.
      const nudge = 0.01 * Math.min(stuckExtra, 20);
      const tangent = new Vector2(
        Math.cos(entityRotation + (facingRight ? 0 : Math.PI)),
        Math.sin(entityRotation + (facingRight ? 0 : Math.PI))
      );
      const curPos = body.translation();
      body.setTranslation(
        {
          x: curPos.x + tangent.x * nudge,
          y: curPos.y + tangent.y * nudge
        },
        true
      );
      // Anti-gravity so the crawler doesn't fall while unsticking.
      const antiGravity = new Vector2(-kWorldGravity.x, -kWorldGravity.y);
      antiGravity.multiplyScalar(mass);
      body.addForce(antiGravity, true);
    }
  }

  private projectTerrainRay(
    origin: Vector2,
    angle: number,
    distance: number,
    debugColor?: number
  ) {
    const { entity, level } = this;
    if (!entity || !level) return;
    const { world, rapier } = level;

    const pos = new rapier.Vector2(origin.x, origin.y);
    const normal = new Vector2(Math.cos(angle), Math.sin(angle));
    const ray = new rapier.Ray(pos, normal);
    const rayLength = distance;

    let nearestDist = Infinity;
    let nearestTerrainEntity: BaseEntityType | undefined;
    let nearestTerrainNormal = new Vector2();

    const terrainNormal = new Vector2();
    world.intersectionsWithRay(ray, rayLength, true, (hit) => {
      if (hit.collider.isSensor()) return true;
      const hitDistance = hit.timeOfImpact;
      const hitEntityId = level.getEntityIdForCollider(hit.collider.handle);
      if (!hitEntityId) return true;
      const hitEntity = level.getEntity(hitEntityId);
      if (!hitEntity) return true;
      if (
        !isAnyTerrain(hitEntity) &&
        hitEntity.type !== "EarthBlock" &&
        hitEntity.alignment !== EntityAlignment.TemporaryTerrain
      )
        return true;
      if (isLadderTerrain(hitEntity)) return true;
      if (hitEntity === this.entity) return true;
      terrainNormal.x = hit.normal.x;
      terrainNormal.y = hit.normal.y;
      if (hitDistance < nearestDist && terrainNormal.dot(normal) < 0) {
        nearestDist = hitDistance;
        nearestTerrainEntity = hitEntity;
        nearestTerrainNormal.copy(terrainNormal);
      }
      return true;
    });

    // --- Debug ray rendering ---
    if (isDevMode()) {
      addDebugRay({
        origin: origin.clone(),
        direction: normal.clone(),
        length: distance,
        color: debugColor ?? 0xff2222
      });
    }

    if (!nearestTerrainEntity) return null;

    const resultPos = new Vector2(normal.x, normal.y);
    resultPos.multiplyScalar(nearestDist);
    resultPos.add(origin);

    return {
      position: resultPos,
      normal: nearestTerrainNormal,
      distance: nearestDist
    };
  }
}
