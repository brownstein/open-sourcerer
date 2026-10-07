import { Object3D, Vector2 } from "three";
import { StandardEvents, ThreeAseprite } from "three-aseprite";

import { ControlEvents } from "src/api/controls";
import {
  BaseEntityType,
  EntityAlignment,
  EntityHitDetails,
  EntityLifecycleEvents,
  EntityProps
} from "src/api/entity";
import {
  enemyCollisionGroup,
  inactiveCollisionGroup
} from "src/engine/constants/collisionGroups";
import { kInvPixelScale } from "src/engine/constants/scaling";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import { addResourceLoader, getResource } from "src/engine/entity/decorators";
import { TextureResourceLoader } from "src/engine/loader/Loaders";
import { layerBoundsToCenteredBBox } from "src/engine/util/spriteUtil";
import { vector3To2 } from "src/engine/util/vecTypes";
import { ActionStack } from "src/entities/shared/ActionStack";
import {
  CharacterGroundPhysicsControlBehaviorEvents,
  CharacterGroundPhysicsControlBehaviorStandard
} from "src/entities/shared/behaviors/CharacterGroundPhysicsController";
import {
  CharacterPhysicsBehavior,
  CharacterPhysicsEvents
} from "src/entities/shared/behaviors/CharacterPhysics";
import { MotionCapabilitiesBehavior } from "src/entities/shared/behaviors/MotionCapabilities";
import { NavPathFollowingBehavior } from "src/entities/shared/behaviors/NavPathFollowingBehavior";
import { OutOfBoundsBehaviour } from "src/entities/shared/behaviors/OutOfBoundsBehaviour";
import {
  PerceptionBehavior,
  PerceptionEvents
} from "src/entities/shared/behaviors/Perception";
import { StatusBehavior } from "src/entities/shared/behaviors/StatusBehavior";

import { DevPathRenderingBehavior } from "../dev/behaviors/DevPathRenderingBehavior";
import { HitArea } from "../shared/HitArea";
import deerBotJson from "./sprites/deer-bot/deer-bot.json";
import deerBotPng from "./sprites/deer-bot/deer-bot.png";

// Define the properties for DeerBot
export type DeerBotProps = EntityProps & {};

enum JumpState {
  jumping = "jumping",
  goingUp = "goingUp",
  apex = "apex",
  goingDown = "goingDown",
  landing = "landing"
}

@addResourceLoader(new TextureResourceLoader("DeerBotTexture", deerBotPng))
export class DeerBot extends CoreEntity {
  static type = "DeerBot";
  public type = "DeerBot";
  public alignment = EntityAlignment.Enemy;
  public object3D = new Object3D();
  public behaviors = {
    motionCapabilities: new MotionCapabilitiesBehavior()
      .setJump(true, 0, 4)
      .setSpeedLimits(2),
    physics: new CharacterPhysicsBehavior().setGroup(enemyCollisionGroup),
    physicsControl: new CharacterGroundPhysicsControlBehaviorStandard(),
    pathFollowing: new NavPathFollowingBehavior(),
    perception: new PerceptionBehavior(),
    status: new StatusBehavior(),
    pathRendering: new DevPathRenderingBehavior(),
    outOfBounds: new OutOfBoundsBehaviour()
  };

  public sprite: ThreeAseprite;
  private facingRight: boolean = true; // Default facing direction
  private patrolDistance = 4;
  private chasingEntity?: BaseEntityType;
  private jumpState?: JumpState; // Track the current jump state
  private isCharging = false; // State to track if charging
  private isDying = false; // State to track if dying
  private hasHitPlayer = false; // New flag to track if the player was hit
  private chargeCooldown = 3000; // Cooldown time in milliseconds (3 seconds)
  private lastChargeTime = 0; // Timestamp of the last charge

  private isWalkingBackwards = false; // New flag to track if walking backwards

  private setOrientation() {
    // Do not change the scale.x if DeerBot is walking backwards
    if (!this.isWalkingBackwards) {
      // Only modify the orientation if not backpedaling
      this.sprite.mesh.scale.x = this.facingRight
        ? kInvPixelScale
        : -kInvPixelScale;
    }
  }

  private actionStack = new ActionStack(this, {
    idlePatrol: {
      default: true,
      resume: (entity) => {
        entity.behaviors.motionCapabilities.setSpeedLimits(2);
      },
      run: function* (entity) {
        while (true) {
          let planMsInFlight = 0;
          yield "standIdle";
          entity.facingRight = true;
          entity.setOrientation(); // Ensure correct orientation
          entity.behaviors.pathFollowing.planAndFollowPathToPosition(
            new Vector2(
              entity.position.x + entity.patrolDistance,
              entity.position.y
            )
          );
          planMsInFlight = 0;
          while (
            !entity.behaviors.pathFollowing.hasPlan() &&
            planMsInFlight < 1000
          ) {
            planMsInFlight += yield;
          }
          planMsInFlight = 0;
          while (
            entity.behaviors.pathFollowing.hasPlan() &&
            planMsInFlight < 5000
          ) {
            planMsInFlight += yield;
          }
          yield "standIdle";
          entity.facingRight = false;
          entity.setOrientation(); // Ensure correct orientation
          entity.behaviors.pathFollowing.planAndFollowPathToPosition(
            new Vector2(
              entity.position.x - entity.patrolDistance,
              entity.position.y
            )
          );
          planMsInFlight = 0;
          while (
            !entity.behaviors.pathFollowing.hasPlan() &&
            planMsInFlight < 1000
          ) {
            planMsInFlight += yield;
          }
          planMsInFlight = 0;
          while (
            entity.behaviors.pathFollowing.hasPlan() &&
            planMsInFlight < 5000
          ) {
            planMsInFlight += yield;
          }
        }
      }
    },

    standIdle: {
      resume(entity) {
        entity.behaviors.pathFollowing.cancelPath();
      },
      run: function* () {
        let idleTime = 0;
        while (idleTime < 1000) {
          idleTime += yield;
        }
      }
    },

    chasePlayer: {
      resume(entity) {
        if (!entity.chasingEntity) return;
        entity.behaviors.motionCapabilities.setSpeedLimits(2.5);

        // Determine the direction to face the player
        if (entity.chasingEntity) {
          const chasePlayerPosition = entity.chasingEntity.position;
          entity.facingRight = chasePlayerPosition.x > entity.position.x;

          // Set orientation using the centralized method
          entity.setOrientation();
        }
      },
      run: function* (entity) {
        let timeToNextPlan = 3000;
        const delayBeforeCharge = 1000; // 1 second delay before charging
        let chargeDelayTimer = 0;

        while (true) {
          if (!entity.chasingEntity) return; // Ensure chasingEntity exists before proceeding

          const currentTime = Date.now();
          const timeSinceLastCharge = currentTime - entity.lastChargeTime;

          // Check if the cooldown period has passed before initiating another charge attack
          if (timeSinceLastCharge < entity.chargeCooldown) {
            yield; // Continue waiting until cooldown expires
            continue;
          }

          // Ensure chasingEntity exists after yield
          if (!entity.chasingEntity) {
            chargeDelayTimer = 0; // Reset delay timer if chasingEntity is gone
            yield; // Continue waiting or break out if necessary
            continue;
          }

          // Reduce the charge initiation range to 6 meters and add vertical difference check
          const distanceToPlayer = entity.position.distanceTo(
            entity.chasingEntity.position
          );
          const verticalDifference = Math.abs(
            entity.position.y - entity.chasingEntity.position.y
          );
          const maxVerticalDifference = 2; // Adjust this value based on what you consider to be "on the same surface"

          if (
            distanceToPlayer <= 6 &&
            verticalDifference <= maxVerticalDifference
          ) {
            if (chargeDelayTimer === 0) {
              // Stop DeerBot to prepare for charge attack
              entity.behaviors.pathFollowing.controlEvents.emit(
                ControlEvents.MoveHorizontally,
                0
              );
              entity.behaviors.pathFollowing.cancelPath();
              chargeDelayTimer = Date.now(); // Start the delay timer
            }

            const timeSinceChargeDelayStarted = Date.now() - chargeDelayTimer;

            if (timeSinceChargeDelayStarted >= delayBeforeCharge) {
              // Delay has passed, initiate backpedal before charge attack
              yield "backpedalBeforeCharge";
              chargeDelayTimer = 0; // Reset the delay timer after backpedal
            } else {
              yield; // Continue waiting until delay expires
              continue;
            }
          } else {
            chargeDelayTimer = 0; // Reset the delay timer if player is out of range
          }

          // Ensure chasingEntity still exists after yield
          if (!entity.chasingEntity) {
            yield; // Continue waiting or handle other logic
            continue;
          }

          const chasePosition = vector3To2(entity.chasingEntity.position);
          timeToNextPlan -= yield;
          if (
            timeToNextPlan <= 0 ||
            !(
              entity.behaviors.pathFollowing.hasPlan() ||
              entity.behaviors.pathFollowing.planning()
            )
          ) {
            timeToNextPlan = 3000;
            entity.behaviors.pathFollowing.planAndFollowPathToPosition(
              chasePosition,
              1.25
            );
          }
        }
      }
    },

    // In the backpedalBeforeCharge behavior:
    backpedalBeforeCharge: {
      resume(entity) {
        if (!entity.chasingEntity) return;

        // Ensure DeerBot faces the player and backpedals without flipping orientation
        console.log("DeerBot is backpedaling while facing the player.");

        // Do not change `facingRight` here, keep it the same as when it started the chase
        entity.setOrientation();

        // Ensure DeerBot is walking backwards, but still facing the player
        entity.isWalkingBackwards = true;

        // Ensure animation is set to walk and play in reverse
        if (
          entity.sprite.getCurrentTag() !== "walk" ||
          !entity.sprite.playingAnimationBackwards
        ) {
          entity.sprite.gotoTag("walk");
          entity.sprite.playingAnimation = true;
          entity.sprite.playingAnimationBackwards = true; // Play walking backward
        }
      },
      run: function* (entity) {
        const backupDuration = 500; // Duration of backpedaling
        let backupTime = 0;
        let previousTime = Date.now();

        const backpedalDirection = entity.facingRight ? -1 : 1;

        while (backupTime < backupDuration) {
          const currentTime = Date.now();
          const deltaTime = currentTime - previousTime;
          previousTime = currentTime;

          backupTime += deltaTime;

          // Move backward while facing forward
          entity.behaviors.pathFollowing.controlEvents.emit(
            ControlEvents.MoveHorizontally,
            backpedalDirection
          );

          yield;
        }

        // Stop movement after backpedaling
        entity.behaviors.pathFollowing.controlEvents.emit(
          ControlEvents.MoveHorizontally,
          0
        );

        // Reset backward state and prepare for charge
        entity.isWalkingBackwards = false;
        entity.sprite.playingAnimationBackwards = false;

        // Immediately transition to charge attack
        yield "chargeAttack";
      }
    },

    chargeAttack: {
      run: function* (entity) {
        // Ensure chasingEntity is defined before accessing its position
        if (entity.chasingEntity) {
          const playerPosition = entity.chasingEntity.position;

          // Determine the direction DeerBot should face
          entity.facingRight = playerPosition.x > entity.position.x;
          entity.setOrientation();
        }

        entity.isCharging = true;
        entity.hasHitPlayer = false; // Flag to indicate collision

        // Temporarily set max speed for charging
        const _originalSpeedLimit =
          entity.behaviors.motionCapabilities.setSpeedLimits(2); // Store the original speed
        entity.behaviors.motionCapabilities.setSpeedLimits(6); // Increase max speed for charge attack

        let chargeDone = false;
        const onAnimationComplete = () => {
          chargeDone = true;
        };
        entity.sprite.addEventListener("chargeDone", onAnimationComplete);

        // Emit motion events to start moving horizontally during charge
        entity.behaviors.pathFollowing.controlEvents.emit(
          ControlEvents.MoveHorizontally,
          entity.facingRight ? 1 : -1
        );

        const chargeDuration = 3000; // Duration of charge in milliseconds
        let chargeTime = 0;
        let previousTime = Date.now();

        // Handle collision during charge
        entity.behaviors.physics.events.on(
          CharacterPhysicsEvents.CollideWithEntity,
          ([collidedEntity]) => {
            if (
              collidedEntity.alignment === EntityAlignment.Player &&
              !entity.hasHitPlayer
            ) {
              entity.hasHitPlayer = true; // Set flag on first hit

              // Stop DeerBot immediately upon impact
              entity.behaviors.pathFollowing.controlEvents.emit(
                ControlEvents.MoveHorizontally,
                0
              );

              // Apply a strong impulse to the player to knock them back
              collidedEntity.hit?.({
                hittingEntity: entity,
                sourceEntity: entity,
                damage: 1,
                hitImpulse: new Vector2(entity.facingRight ? 10 : -10, 1) // Adjusted for reduced knockback
              });

              chargeDone = true; // End the charge attack immediately

              // Update lastChargeTime to start the cooldown
              entity.lastChargeTime = Date.now();
            }
          }
        );

        while (
          !chargeDone &&
          chargeTime < chargeDuration &&
          !entity.hasHitPlayer
        ) {
          const currentTime = Date.now();
          const deltaTime = currentTime - previousTime; // Time in milliseconds since the last frame
          previousTime = currentTime;
          chargeTime += deltaTime; // Increment charge time

          yield; // Yield to the next frame

          // Ensure that the player (or other game state) hasn't changed in a way that affects the charge
          if (!entity.chasingEntity) {
            break; // Exit charge if the chasing target is no longer valid
          }
        }

        entity.sprite.removeEventListener("chargeDone", onAnimationComplete);
        entity.isCharging = false;
        entity.behaviors.pathFollowing.enableMotion();

        // Restore original speed limits after charge attack
        entity.behaviors.motionCapabilities.setSpeedLimits(2); // Restore the original speed limit

        // Ensure DeerBot stops after the charge
        entity.behaviors.pathFollowing.controlEvents.emit(
          ControlEvents.MoveHorizontally,
          0
        );

        entity.hasHitPlayer = false; // Reset the flag for future charge attacks

        // Resume chasing the player if they are still within range
        yield "chasePlayer";
      }
    },
    die: {
      run: function* (entity) {
        entity.sprite.playingAnimation = false;
        entity.isDying = true;
        entity.behaviors.physics.setRotationLocked(false);
        if (entity.behaviors.physics.body) {
          entity.behaviors.physics.body.setAngvel(
            entity.facingRight ? 10 : -10,
            true
          );
        }
        entity.scheduler.add({
          id: "deathFadeOut",
          duration: 500,
          invokeFunction: (t) => {
            entity.sprite.setOpacity(1 - t);
            entity.behaviors.status.healthBar.setOpacity(1 - t);
          },
          invokeFunctionAtComplete: () => {
            entity.level?.removeEntity(entity.id);
            entity.destroy();
          }
        });
        while (true) yield;
      }
    }
  });

  constructor(props: EntityProps) {
    super(props);
    this.size = {
      width: 43 * kInvPixelScale,
      height: 60 * kInvPixelScale
    };
    this.behaviors.motionCapabilities.init(this);
    this.behaviors.physics.init(this);
    this.behaviors.physicsControl.init(this);
    this.behaviors.perception.init(this);
    this.behaviors.perception.direction.x = -1;
    this.behaviors.status.init(this);
    this.behaviors.outOfBounds.init(this);

    // Temp path debugging.
    this.behaviors.pathRendering
      .init(this)
      .attachPathFollowing(this.behaviors.pathFollowing);

    this.behaviors.physicsControl
      .attachPhysicsBehavior(this.behaviors.physics)
      .assignMotionCapabilities(this.behaviors.motionCapabilities.capabilities);
    this.behaviors.pathFollowing
      .init(this)
      .setMotionCapabilities(this.behaviors.motionCapabilities.capabilities)
      .setPhysicsControl(this.behaviors.physicsControl);
    this.behaviors.physicsControl.attachControlEvents(
      this.behaviors.pathFollowing.controlEvents
    );

    // Hit things we collide with.
    this.behaviors.physics.events.on(
      CharacterPhysicsEvents.CollideWithEntity,
      ([entity, normal]) => {
        if (entity.alignment === EntityAlignment.Player) {
          entity.hit?.({
            hittingEntity: this,
            sourceEntity: this,
            damage: 1,
            hitImpulse: new Vector2(normal.x > 0 ? 6 : -6, normal.y)
          });
        }
      }
    );

    this.behaviors.pathFollowing.controlEvents.on(
      ControlEvents.MoveHorizontally,
      (dx) => {
        if (dx > 0) {
          this.facingRight = true;
          this.setOrientation(); // Use the centralized orientation method
          this.behaviors.perception.direction.x = 1;
        } else if (dx < 0) {
          this.facingRight = false;
          this.setOrientation(); // Use the centralized orientation method
          this.behaviors.perception.direction.x = -1;
        }
      }
    );

    // Perception event handlers
    this.behaviors.perception.perceptionEvents.on(
      PerceptionEvents.PerceiveEntityStart,
      (entity) => {
        if (this.chasingEntity !== entity) {
          this.scheduler.cancel("waitForEndOfChase");
          this.chasingEntity = entity;

          // Check distance to player and start charge if within 5 meters
          const distanceToPlayer = this.position.distanceTo(entity.position);
          if (distanceToPlayer <= 3) {
            this.actionStack.beginAction("chargeAttack", undefined, true, true);
          } else {
            this.actionStack.beginAction("chasePlayer", undefined, true, true);
          }
        }
      }
    );

    this.behaviors.perception.perceptionEvents.on(
      PerceptionEvents.PerceiveEntityEnd,
      (entityId) => {
        if (this.chasingEntity?.id === entityId) {
          this.scheduler.add({
            id: "waitForEndOfChase",
            startIn: 5000,
            invokeFunctionAtComplete: () => {
              if (
                !this.behaviors.perception.currentEntityIdsInSight.has(entityId)
              ) {
                this.chasingEntity = undefined;
              }
            }
          });
        }
      }
    );

    this.sprite = new ThreeAseprite({
      sourceJSON: deerBotJson,
      texture: getResource(DeerBot, "DeerBotTexture"),
      frameName: ({ layerName, frame }) => `(${layerName}) ${frame}`,
      offset: new Vector2(-2, -19)
    });
    this.sprite.mesh.scale.multiplyScalar(kInvPixelScale);
    this.sprite.addTagFrameTrigger("charge", 3, "charge attack");
    this.sprite.addTagFrameTrigger("charge", 0, "chargeDone");
    this.object3D.add(this.sprite.mesh);

    this.behaviors.status.attachSprite(this.sprite);

    this.sprite.addEventListener("charge attack", () => {
      const chargeBounds = this.sprite.getLayerBoundingBox("Main");
      if (!chargeBounds) return;
      const chargeBBox = layerBoundsToCenteredBBox(chargeBounds);
      const chargeHit = new HitArea({
        sourceEntity: this,
        shouldCheckLineOfSight: true,
        position: {
          x:
            this.position.x +
            (this.facingRight ? 1 : -1) * (chargeBBox.x - 0.75),
          y: this.position.y + chargeBBox.y,
          z: 0
        }
      })
        .setRect({
          x: chargeBBox.width,
          y: chargeBBox.height
        })
        .setImpulse(new Vector2(this.facingRight ? 15 : -15, 1))
        .setDamage(1);
      this.level?.addEntity(chargeHit);
    });

    this.object3D.position.copy(this.position);

    this.events.on(EntityLifecycleEvents.Die, () => {
      this.behaviors.pathFollowing.disableMotion();
      this.behaviors.pathFollowing.cancelPath();
      this.behaviors.pathFollowing.controlEvents.emit(
        ControlEvents.MoveHorizontally,
        0
      );
      this.behaviors.physics.setGroup(inactiveCollisionGroup);
      this.actionStack.beginAction("die");
    });

    // Hook into jump lifecycle.
    this.behaviors.physicsControl.events.on(
      CharacterGroundPhysicsControlBehaviorEvents.PreJump,
      () => {
        this.jumpState = JumpState.jumping;
        this.scheduler.cancel("jumpCancel");
        this.scheduler.add({
          id: "jumpCancel",
          startIn: 1000,
          invokeEventAtComplete: "jumpCancel"
        });
      }
    );
    this.behaviors.physicsControl.events.on(
      CharacterGroundPhysicsControlBehaviorEvents.Jump,
      () => {
        this.jumpState = JumpState.goingUp;
        this.scheduler.cancel("jumpCancel");
        this.scheduler.add({
          id: "jumpCancel",
          startIn: 1000,
          invokeEventAtComplete: "jumpCancel"
        });
      }
    );
    this.behaviors.physicsControl.events.on(
      CharacterGroundPhysicsControlBehaviorEvents.JumpApex,
      () => (this.jumpState = JumpState.apex)
    );
    this.behaviors.physicsControl.events.on(
      CharacterGroundPhysicsControlBehaviorEvents.Fall,
      () => (this.jumpState = JumpState.goingDown)
    );
    this.behaviors.physicsControl.events.on(
      CharacterGroundPhysicsControlBehaviorEvents.Land,
      () => {
        this.jumpState = JumpState.landing;
        this.scheduler.cancel("jumpCancel");
      }
    );
    this.scheduler.on("jumpCancel", () => {
      if (this.jumpState) this.jumpState = undefined;
    });

    // Bind methods for use as callbacks.
    this.onBodyAnimationDone = this.onBodyAnimationDone.bind(this);
    this.sprite.addEventListener(
      StandardEvents.animationComplete,
      this.onBodyAnimationDone
    );
  }

  // Step method that runs every frame
  step(ms: number) {
    super.step(ms);
    this.actionStack.step(ms);

    // Continuously animate the sprite based on movement or charging
    if (
      this.sprite.getCurrentTag() === "walk" ||
      this.sprite.getCurrentTag() === "chargeattack"
    ) {
      const xVel = this.behaviors.physics.body?.linvel().x ?? 0;
      this.sprite.animate(0.75 * ms * Math.abs(xVel)); // Animate according to velocity
    } else {
      this.sprite.animate(ms); // Default animation
    }

    this.applyMotionToSprite();

    // Update object3D position based on physics body position
    if (this.behaviors.physics.body) {
      const bodyPosition = this.behaviors.physics.body.translation();
      this.object3D.position.set(bodyPosition.x, bodyPosition.y, 0);
    }
  }

  // Method for applying motion states to the sprite animation
  private applyMotionToSprite() {
    const { sprite } = this;
    if (!sprite) return;

    // Update the sprite based on the current jump state
    if (this.jumpState) {
      if (sprite.getCurrentTag() !== "jump") {
        sprite.gotoTag("jump");
        sprite.gotoTagFrame(0);
        sprite.playingAnimation = true;
      }
      switch (this.jumpState) {
        case JumpState.jumping:
          if ((sprite.getCurrentTagFrame() ?? 0) > 1) sprite.gotoTagFrame(1);
          break;
        case JumpState.goingUp:
          if ((sprite.getCurrentTagFrame() ?? -1) !== 2) sprite.gotoTagFrame(2);
          break;
        case JumpState.apex:
          if ((sprite.getCurrentTagFrame() ?? -1) !== 3) sprite.gotoTagFrame(3);
          break;
        case JumpState.goingDown:
          if ((sprite.getCurrentTagFrame() ?? -1) !== 4) sprite.gotoTagFrame(4);
          break;
        case JumpState.landing:
          if ((sprite.getCurrentTagFrame() ?? -1) !== 5) sprite.gotoTagFrame(5);
          break;
      }
      return;
    }

    // Apply movement and animation handling
    const xVel = Math.abs(this.behaviors.physics.body?.linvel().x ?? 0);

    // Charging logic should take precedence over other states
    if (this.isCharging) {
      if (sprite.getCurrentTag() !== "charge") {
        sprite.gotoTag("charge");
        sprite.playingAnimation = true;
        console.log("Starting charge animation.");
      }

      // Ensure the charge animation progresses frame by frame
      const speedFactor = xVel > 0 ? Math.max(0.1, xVel * 0.1) : 1;
      sprite.animate(speedFactor * 16); // Use speed factor to control animation frame progression
      console.log(`Animating charge, speedFactor: ${speedFactor}`);

      return; // Exit early to avoid triggering other animations during charge
    }

    // Backpedaling logic
    if (this.isWalkingBackwards && xVel > 0) {
      // Ensure backward walking animation plays properly
      if (
        sprite.getCurrentTag() !== "walk" ||
        !sprite.playingAnimationBackwards
      ) {
        sprite.gotoTag("walk");
        sprite.playingAnimation = true;
        sprite.playingAnimationBackwards = true; // Set to play backwards
        console.log("Playing backpedal animation.");
      }
    } else if (xVel > 0) {
      // Forward walking logic
      if (
        sprite.getCurrentTag() !== "walk" ||
        sprite.playingAnimationBackwards
      ) {
        sprite.gotoTag("walk");
        sprite.playingAnimation = true;
        sprite.playingAnimationBackwards = false; // Set to play forward
        this.setOrientation(); // Update orientation for forward movement
        console.log("Playing forward walk animation.");
      }
    } else if (
      !this.isCharging &&
      !this.isDying &&
      sprite.getCurrentTag() !== "idle"
    ) {
      // Idle animation logic if not moving, charging, or dying
      sprite.gotoTag("idle");
      sprite.playingAnimation = true;
      console.log("Playing idle animation.");
    }

    // Handle dying state
    if (this.isDying) {
      if (sprite.getCurrentTag() !== "die") {
        sprite.gotoTag("die");
        sprite.playingAnimation = true;
        console.log("Playing dying animation.");
      }
    }
  }

  // Define the onBodyAnimationDone method here
  private onBodyAnimationDone() {
    // This will handle what happens when an animation is complete
    const currentTag = this.sprite.getCurrentTag();

    switch (currentTag) {
      case "jump":
        // Reset jump state when the jump animation finishes
        if (this.jumpState) {
          this.jumpState = undefined; // Ensure the jump state is cleared when the jump animation is done
        }
        break;

      case "walk":
      case "idle":
        // Continue playing the current animation (in case it's a looping animation)
        this.sprite.playingAnimation = true;
        break;

      default:
        // You can add other cases if needed, depending on the animation
        break;
    }
  }

  // Hit method
  hit(hit: EntityHitDetails) {
    super.hit(hit);
    if (hit.hitImpulse) {
      this.behaviors.physics.body?.applyImpulse(hit.hitImpulse, true);
    }
  }

  destroy() {
    super.destroy();
    this.sprite.dispose();
  }
}
