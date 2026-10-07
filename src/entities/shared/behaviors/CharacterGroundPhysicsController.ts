import RAPIER, {
  CoefficientCombineRule,
  Collider
} from "@dimforge/rapier2d-compat";
import { Vector2 } from "three";
import { clamp, degToRad } from "three/src/math/MathUtils.js";

import {
  ControlEventEmitter,
  ControlEvents,
  ControlsAPI
} from "src/api/controls";
import {
  BaseEntityType,
  EntityAlignment,
  EntityBehavior,
  EntityLevelEvents,
  EntityLifecycleEvents,
  LevelAPI
} from "src/api/entity";
import { isSolidTerrainLike } from "src/api/entityInteractions";
import { MotionCapabilities } from "src/api/navigation";
import { createTypedEventEmitter } from "src/api/util";
import {
  BaseTerrain,
  isBouncyTerrain,
  isTerrain
} from "src/entities/terrain/BaseTerrain";
import { isLadderTerrain } from "src/entities/terrain/LadderTerrain";
import { isWaterTerrain } from "src/entities/terrain/WaterTerrain";
import { isAnyTerrain } from "src/entities/terrain/allTerrain";

import { CharacterPhysicsBehavior } from "./CharacterPhysics";
import { MotionCapabilitiesBehavior } from "./MotionCapabilities";

export enum CharacterGroundPhysicsControlBehaviorEvents {
  PreJump = "PreJump",
  Jump = "Jump",
  JumpApex = "JumpApex",
  Fall = "Fall",
  Land = "Land"
}

export type CharacterGroundPhysicsControlBehaviorEventTypes = {
  [CharacterGroundPhysicsControlBehaviorEvents.PreJump]: void;
  [CharacterGroundPhysicsControlBehaviorEvents.Jump]: void;
  [CharacterGroundPhysicsControlBehaviorEvents.JumpApex]: void;
  [CharacterGroundPhysicsControlBehaviorEvents.Fall]: void;
  [CharacterGroundPhysicsControlBehaviorEvents.Land]: void;
};

export class CharacterGroundPhysicsControlBehavior implements EntityBehavior {
  public type = "CharacterGroundPhysicsController";
  public lastSetHSpeedRatio = 0;
  public lastSetVSpeedRatio = 0;
  public motionCapabilities?: MotionCapabilities;
  public isJumpingCurrentlyInputted = false;
  public isInJumpingState = false;

  // WARN: if an entity jumps but remains grounded the whole time,
  // such as when they jump under a low cieling, there is a bug where
  // they remain in that jumping state.
  //
  // WARN: This cannot be fixed by simply checking for if we are in jump state
  // and grounded, because the player remains grounded for the first few frames of
  // their jump. Thus, only check after a short delay :/.
  private checkForSuccessfulJumpTimer = 0;
  private readonly timeMsToCheckForSuccessfulJump = 100;

  public jumpPastApex = false;
  public inTheAir = false;
  public facingRight = true;
  public events =
    createTypedEventEmitter<CharacterGroundPhysicsControlBehaviorEventTypes>();
  private level?: LevelAPI;
  private entity?: BaseEntityType;
  private autoAttachControls = false;
  private controlEvents?: ControlEventEmitter;
  private characterPhysics?: CharacterPhysicsBehavior;
  private groundSensorCollider?: RAPIER.Collider;
  private groundedLastFrame = true;
  private sensorCollisionGroup?: number;
  private enabled = true;
  private jumpTimeout = 0;
  private debugEnabled = false;
  private timeSinceLastGroundedMs = 0;
  private readonly coyoteTimeMs = 75;

  /*
   * These are used when a landing for a jump is ambiguous (i.e. jumping through a platform)
   * Give a short delay to confirm we have truly landed on the ground
   */
  private pendingLandConfirmMs = -1;
  private readonly landConfirmDelayMs = 100;

  // Grace period (in step calls) during which isGrounded() returning null is
  // treated as grounded.  Needed because the ground sensor collider won't
  // register intersections until the next world.step() after the body is
  // created, so entities spawned mid-frame would otherwise emit a false Fall
  // event for one frame.
  private groundedGraceFrames = 0;
  constructor(autoAttach = false) {
    this.autoAttachControls = autoAttach;
    this.step = this.step.bind(this);
    this.preJump = this.preJump.bind(this);
    this.jump = this.jump.bind(this);
    this.jumpEnd = this.jumpEnd.bind(this);
    this.moveHorizontally = this.moveHorizontally.bind(this);
    this.moveVertically = this.moveVertically.bind(this);
    this.fallThroughStart = this.fallThroughStart.bind(this);
    this.fallThroughEnd = this.fallThroughEnd.bind(this);
    this.attachControls = this.attachControls.bind(this);
  }
  init(entity: BaseEntityType) {
    this.entity = entity;
    this.entity.events.on(EntityLifecycleEvents.Step, this.step);
    return this;
  }
  attachControls(controls: ControlsAPI<BaseEntityType>) {
    return this.attachControlEvents(controls.events);
  }
  attachControlEvents(controlEvents: ControlEventEmitter) {
    this.controlEvents = controlEvents;
    this.controlEvents.on(ControlEvents.PreJump, this.preJump);
    this.controlEvents.on(ControlEvents.JumpStart, this.jump);
    this.controlEvents.on(ControlEvents.JumpRelease, this.jumpEnd);
    this.controlEvents.on(
      ControlEvents.MoveHorizontally,
      this.moveHorizontally
    );
    this.controlEvents.on(ControlEvents.MoveVertically, this.moveVertically);
    this.controlEvents.on(ControlEvents.FallThrough, this.fallThroughStart);
    this.controlEvents.on(ControlEvents.FallThroughEnd, this.fallThroughEnd);
    return this;
  }
  detachControlEvents() {
    if (this.controlEvents) {
      this.controlEvents.off(ControlEvents.PreJump, this.preJump);
      this.controlEvents.off(ControlEvents.JumpStart, this.jump);
      this.controlEvents.off(ControlEvents.JumpRelease, this.jumpEnd);
      this.controlEvents.off(
        ControlEvents.MoveHorizontally,
        this.moveHorizontally
      );
      this.controlEvents.off(
        ControlEvents.MoveVertically,
        this.moveVertically
      );
      this.controlEvents.off(ControlEvents.FallThrough, this.fallThroughStart);
      this.controlEvents.off(ControlEvents.FallThroughEnd, this.fallThroughEnd);
      this.controlEvents = undefined;
    }
    return this;
  }
  assignMotionCapabilities(motionCapabilities: MotionCapabilities) {
    this.motionCapabilities = motionCapabilities;
    return this;
  }
  attachPhysicsBehavior(characterPhysics: CharacterPhysicsBehavior) {
    this.characterPhysics = characterPhysics;
    return this;
  }
  setSensorCollisionGroup(collGroup: number) {
    this.sensorCollisionGroup = collGroup;
    return this;
  }
  attachToLevel(level: LevelAPI) {
    this.level = level;
    if (this.autoAttachControls) {
      if (level.controls) this.attachControls(level.controls);
      level.on(EntityLevelEvents.AttachControls, this.attachControls);
    }
    if (this.entity && this.characterPhysics?.body) {
      const groundColliderThickness = 0.5;
      const cornerRadius = Math.min(
        this.characterPhysics.size.x * 0.2,
        groundColliderThickness * 0.25
      );
      const groundSensorColliderDesc = level.rapier.ColliderDesc.roundCuboid(
        this.characterPhysics.size.x * 0.4 - cornerRadius,
        groundColliderThickness * 0.5 - cornerRadius,
        cornerRadius
      );
      groundSensorColliderDesc.setTranslation(
        0,
        -this.characterPhysics.size.y * 0.45
      );
      groundSensorColliderDesc.setSensor(true);
      if (this.sensorCollisionGroup !== undefined)
        groundSensorColliderDesc.setCollisionGroups(this.sensorCollisionGroup);
      const groundSensorCollider = level.world.createCollider(
        groundSensorColliderDesc,
        this.characterPhysics.body
      );
      level.registerSensor(this.entity.id, groundSensorCollider.handle);
      this.groundSensorCollider = groundSensorCollider;
    }
  }
  detachFromLevel(level: LevelAPI) {
    if (this.autoAttachControls) {
      level.off(EntityLevelEvents.AttachControls, this.attachControls);
    }
    this.detachControlEvents();
    this.level = undefined;
  }
  destroy() {
    this.detachControlEvents();
    this.entity?.events.off(EntityLifecycleEvents.Step, this.step);
  }
  preJump() {
    if (!this.enabled) return;
    this.events.emit(CharacterGroundPhysicsControlBehaviorEvents.PreJump);
  }
  jump() {
    if (!this.enabled || !this.motionCapabilities) return;
    if (this.jumpTimeout > 0) return;

    const isOnLadder = this.characterPhysics?.isOnLadder();
    const inCoyoteTime = this.timeSinceLastGroundedMs <= this.coyoteTimeMs;
    const isInWater =
      this.characterPhysics?.isInWater() && this.isTopPartInWater();
    if (!this.isGrounded() && !inCoyoteTime && !isOnLadder && !isInWater)
      return;

    this.isJumpingCurrentlyInputted = true;
    this.isInJumpingState = true;
    this.checkForSuccessfulJumpTimer = this.timeMsToCheckForSuccessfulJump;
    this.jumpPastApex = false;
    if (this.characterPhysics === undefined) return;
    const { body } = this.characterPhysics;
    if (body === undefined) return;

    const jumpVerticalImpulse = this.motionCapabilities.maxJumpImpulseY ?? 8;
    const currentVerticalVelocity = body.linvel().y;

    const adjustedJumpVerticalImpulse =
      jumpVerticalImpulse - currentVerticalVelocity;

    // additive impulse if on upward moving vertical ground because it feels nice
    const [groundVelocity] = this.isGrounded() ?? [new Vector2()];
    const clampedGroundVerticalVelocity = Math.max(0, groundVelocity.y);

    const finalVerticalImpulse =
      adjustedJumpVerticalImpulse + clampedGroundVerticalVelocity;

    body.applyImpulse({ x: 0, y: body.mass() * finalVerticalImpulse }, true);
    this.events.emit(CharacterGroundPhysicsControlBehaviorEvents.Jump);
    this.jumpTimeout = 20;
    this.timeSinceLastGroundedMs = this.coyoteTimeMs + 1;
  }
  jumpEnd() {
    if (!this.enabled) return;
    this.isJumpingCurrentlyInputted = false;

    const body = this.characterPhysics?.body;
    if (!this.isInJumpingState || this.jumpPastApex || !body) return;

    const currentJumpingVelocity = body.linvel().y;
    // NOTE: should never happen, but just in case
    if (currentJumpingVelocity <= 0) return;

    const JUMP_CANCELING_FACTOR = 0.8;
    body.applyImpulse(
      {
        x: 0,
        y: body.mass() * -currentJumpingVelocity * JUMP_CANCELING_FACTOR
      },
      true
    );
  }
  moveHorizontally(desiredHSpeedRatio: number) {
    if (!this.enabled) return;
    if (desiredHSpeedRatio > 0) this.facingRight = true;
    if (desiredHSpeedRatio < 0) this.facingRight = false;
    this.lastSetHSpeedRatio = desiredHSpeedRatio;
  }
  moveVertically(desiredVSpeedRatio: number) {
    if (!this.enabled) return;
    this.lastSetVSpeedRatio = desiredVSpeedRatio;
  }
  fallThroughStart() {
    if (!this.enabled) return;
    if (this.characterPhysics === undefined) return;
    this.characterPhysics.dropThroughCurrentPlatform();
    this.characterPhysics.setDropThroughPlatforms(true);
  }
  fallThroughEnd() {
    if (!this.enabled) return;
    if (this.characterPhysics === undefined) return;
    this.characterPhysics.setDropThroughPlatforms(false);
  }
  private isTopPartInWater(): boolean {
    if (!this.level || !this.characterPhysics?.body) return false;
    const pos = this.characterPhysics.body.translation();
    const topY = pos.y;
    const checkShape = new RAPIER.Ball(0.05);
    let foundWater = false;
    this.level.world.intersectionsWithShape(
      { x: pos.x, y: topY },
      0,
      checkShape,
      (collider) => {
        const entityId = this.level?.getEntityIdForCollider(collider.handle);
        if (!entityId) return true;
        const entity = this.level?.getEntity(entityId);
        if (entity && isWaterTerrain(entity)) {
          foundWater = true;
          return false;
        }
        return true;
      }
    );
    return foundWater;
  }
  isGrounded(): [Vector2, Vector2] | null {
    if (!this.level || !this.groundSensorCollider) return null;
    let groundContactFound = false;
    const groundLinVel = new Vector2();
    const groundNormal = new Vector2(0, 0);
    const groundContactColliders: Collider[] = [];
    this.level.world.intersectionPairsWith(
      this.groundSensorCollider,
      (collider2) => {
        const otherEntityId = this.level?.getEntityIdForCollider(
          collider2.handle
        );
        if (otherEntityId === undefined) return;
        if (
          this.characterPhysics?.currentCollisions.get(otherEntityId)
            ?.passingThrough
        )
          return;
        const otherEntity = this.level?.getEntity(otherEntityId);

        if (otherEntity && isWaterTerrain(otherEntity)) return;

        if (
          otherEntity &&
          isBouncyTerrain(otherEntity) &&
          Math.sin(degToRad(otherEntity.bounceDir ?? 90)) > 0
        ) {
          return;
        }
        if (otherEntity && isLadderTerrain(otherEntity)) {
          groundContactFound = true;
        }

        if (
          (otherEntity && isAnyTerrain(otherEntity)) ||
          (otherEntity && isSolidTerrainLike(otherEntity)) ||
          otherEntity?.alignment === EntityAlignment.TemporaryTerrain ||
          otherEntity?.alignment === EntityAlignment.EnvironmentalHazard
        ) {
          groundContactFound = true;
          const body2 = collider2.parent();
          if (body2) {
            const linVel = body2.linvel();
            groundLinVel.x = linVel.x;
            groundLinVel.y = linVel.y;
            groundContactColliders.push(collider2);
          }
        }
      }
    );
    const contactNormal = new Vector2();
    let collOnBothSides = false;
    const mainCollider = this.characterPhysics?.colliders?.at(0);
    if (mainCollider) {
      for (const collider2 of groundContactColliders) {
        if (collOnBothSides) break;
        this.level.world.contactPair(
          mainCollider,
          collider2,
          // eslint-disable-next-line no-loop-func
          (manifold, flipped) => {
            const normal = manifold.normal();
            contactNormal.x = normal.x;
            contactNormal.y = normal.y;
            if (!flipped) contactNormal.multiplyScalar(-1);
            if (groundNormal.x && groundNormal.x * contactNormal.x < 0) {
              groundNormal.x = 0;
              groundNormal.y = 1;
              collOnBothSides = true;
            } else {
              groundNormal.x += contactNormal.x;
              groundNormal.y += contactNormal.y;
            }
          }
        );
      }
    }
    if (groundNormal.lengthSq()) {
      groundNormal.normalize();
    } else {
      groundNormal.y = 1;
    }
    return groundContactFound ? [groundLinVel, groundNormal] : null;
  }
  hugTheGround(ms: number) {
    if (!this.enabled) return;
    if (this.isInJumpingState) return;
    if (
      !this.level ||
      !this.groundSensorCollider ||
      !this.characterPhysics?.body
    )
      return;
    const groundSensorHandles = new Set<number>();
    this.level.world.intersectionPairsWith(
      this.groundSensorCollider,
      (collider) => {
        groundSensorHandles.add(collider.handle);
      }
    );
    if (groundSensorHandles.size === 0) return;
    let anyHandlesMatchedToCollisions = false;
    const physicsCollHandles =
      this.characterPhysics.currentCollisionColliderHandles;
    for (const handle of groundSensorHandles) {
      if (physicsCollHandles.has(handle)) anyHandlesMatchedToCollisions = true;
    }
    if (!anyHandlesMatchedToCollisions) {
      const hVel = this.characterPhysics.body.linvel().x ?? 0;
      this.characterPhysics.body.applyImpulse(
        { x: 0, y: -Math.abs(hVel) * this.characterPhysics.body.mass() * 0.25 },
        true
      );
    }
  }
  step(ms: number) {
    this.jumpTimeout = Math.max(0, this.jumpTimeout - ms);

    const hasGravity = this.characterPhysics?.body?.gravityScale() !== 0;

    if (this.groundedLastFrame && this.lastSetHSpeedRatio !== 0 && hasGravity) {
      this.hugTheGround(ms);
    }

    const [groundVel, groundNormal] = this.isGrounded() ?? [null, null];
    const isGrounded = !!groundVel;
    if (isGrounded) {
      this.timeSinceLastGroundedMs = 0;
    } else {
      this.timeSinceLastGroundedMs += ms;
    }
    const isOnLadder = this.characterPhysics?.isOnLadder();
    const isInWater = this.characterPhysics?.isInWater();

    let inTheAir = !isGrounded && !isOnLadder && !isInWater;

    if (inTheAir && this.groundedGraceFrames > 0) {
      this.groundedGraceFrames--;
      inTheAir = false;
    }

    if (inTheAir !== this.inTheAir) {
      this.inTheAir = inTheAir;
      if (!inTheAir) {
        if (this.jumpPastApex || !this.isInJumpingState) {
          this.isInJumpingState = false;
          this.events.emit(CharacterGroundPhysicsControlBehaviorEvents.Land);
        } else {
          this.pendingLandConfirmMs = this.landConfirmDelayMs;
        }
      } else {
        // Went airborne — cancel any pending land confirmation
        this.pendingLandConfirmMs = -1;

        if (!this.isInJumpingState) {
          // TODO: technically not as robust since a flying enemy can still fall...
          const isNotFlying = !this.motionCapabilities?.canFly;

          if (hasGravity && isNotFlying)
            this.events.emit(CharacterGroundPhysicsControlBehaviorEvents.Fall);
        }
      }
    }

    // NOTE: fix bug where get stuck in jump state if entity remains grounded the entire time
    this.checkForSuccessfulJumpTimer -= ms;
    if (
      this.checkForSuccessfulJumpTimer <= 0 &&
      this.isInJumpingState &&
      this.pendingLandConfirmMs < 0 &&
      isGrounded
    ) {
      this.pendingLandConfirmMs = this.landConfirmDelayMs;
    }

    if (this.pendingLandConfirmMs >= 0) {
      this.pendingLandConfirmMs -= ms;
      if (this.pendingLandConfirmMs < 0) {
        this.isInJumpingState = false;
        this.events.emit(CharacterGroundPhysicsControlBehaviorEvents.Land);
      }
    }

    if (this.characterPhysics === undefined) return;
    const { body, colliders } = this.characterPhysics;
    if (body === undefined) return;
    const currentVelocity = body.linvel();

    if (this.inTheAir && this.isInJumpingState) {
      if (!this.jumpPastApex && currentVelocity.y < 0) {
        this.jumpPastApex = true;
        this.events.emit(CharacterGroundPhysicsControlBehaviorEvents.JumpApex);
      }
    }

    // Perform enabled check to ensure we can actually move.
    if (!this.enabled) return;

    // Swimming (submerged and off the ground) uses its own drive speed so the
    // fluid drag can be tuned against without changing how the entity walks.
    // Flight-capable entities keep their normal drive — they aren't swimming.
    const isSwimming =
      !!isInWater && !isGrounded && !this.motionCapabilities?.canFly;
    const maxHSpeed =
      (isSwimming ? this.motionCapabilities?.maxSwimSpeedX : undefined) ??
      this.motionCapabilities?.maxGroundSpeedX ??
      1;
    const maxHAcceleration = this.motionCapabilities?.maxGroundAccelX ?? 0.05;

    const desiredHSpeed = maxHSpeed * clamp(this.lastSetHSpeedRatio, -1, 1);
    const isStationary = !!groundVel && desiredHSpeed === 0;
    for (const collider of colliders ?? []) {
      collider.setFriction(isStationary ? 1.5 : 0);
      collider.setFrictionCombineRule(
        isStationary
          ? CoefficientCombineRule.Average
          : CoefficientCombineRule.Min
      );
    }

    // const isSameDirection = desiredHSpeed * currentVelocity.x >= 0;
    const desiredSpeedDelta = groundVel
      ? groundVel.x + desiredHSpeed - currentVelocity.x
      : (desiredHSpeed - currentVelocity.x) * 0.1;
    const desiredAccel = desiredSpeedDelta * maxHAcceleration;
    let accelX = desiredAccel;
    if (accelX < -maxHAcceleration) accelX = -maxHAcceleration;
    if (accelX > maxHAcceleration) accelX = maxHAcceleration;
    let accelY = 0;
    if (
      (this.motionCapabilities?.canFly ||
        this.characterPhysics?.isOnLadder()) &&
      (this.lastSetVSpeedRatio !== 0 || !hasGravity)
    ) {
      const maxFlightSpeed = this.motionCapabilities?.maxFlySpeed ?? 1;
      const desiredVSpeedDelta =
        maxFlightSpeed * this.lastSetVSpeedRatio - currentVelocity.y;
      accelY = desiredVSpeedDelta * 0.1;
    }
    const mass = body.mass();
    const dt = Math.min(ms, 30);
    const impulse = new Vector2(mass * dt * accelX, mass * dt * accelY);
    if (groundNormal) {
      const groundRot = groundNormal.angle() - Math.PI * 0.5;
      impulse.rotateAround(new Vector2(), groundRot);
    }
    body.applyImpulse(impulse, true);
    this.groundedLastFrame = !inTheAir;
  }
  enable() {
    this.enabled = true;
  }
  disable() {
    this.enabled = false;
  }
  setGrounded() {
    this.groundedLastFrame = true;
    // Allow the ground sensor 2 physics frames to register contacts before
    // treating the entity as airborne.  Without this, entities spawned
    // mid-frame would briefly report as in-air and emit a spurious Fall event.
    this.groundedGraceFrames = 2;
  }
  setDebugEnabled(enabled = true) {
    this.debugEnabled = enabled;
  }
  get groundSpeed() {
    return (
      (this.motionCapabilities?.maxGroundSpeedX ?? 1) * this.lastSetHSpeedRatio
    );
  }
}

/**
 * Standardized naming convention version of CharacterGroundPhysicsControlBehavior.
 * Expects the host entity to have the following standard behaviors:
 * - motionCapabilities: MotionCapabilitiesBehavior
 * - physics: CharacterPhysicsBehavior
 */
export class CharacterGroundPhysicsControlBehaviorStandard
  extends CharacterGroundPhysicsControlBehavior
  implements
    EntityBehavior<
      BaseEntityType<{
        motionCapabilities: MotionCapabilitiesBehavior;
        physics: CharacterPhysicsBehavior;
      }>
    >
{
  init(
    entity: BaseEntityType<{
      motionCapabilities: MotionCapabilitiesBehavior;
      physics: CharacterPhysicsBehavior;
    }>
  ) {
    super.init(entity);
    this.assignMotionCapabilities(
      entity.behaviors.motionCapabilities.capabilities
    );
    this.attachPhysicsBehavior(entity.behaviors.physics);
    return this;
  }
}
