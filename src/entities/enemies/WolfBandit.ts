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
import { CenteredBBox } from "src/engine/navigation/CenteredBBox";
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
import wolfBanditJson from "./sprites/wolf-bandit/wolf-bandit.json";
import wolfBanditPng from "./sprites/wolf-bandit/wolf-bandit.png";

// Define the properties for WolfBandit
export type WolfBanditProps = EntityProps & {};

// Enums for different states the WolfBandit can be in
enum JumpState {
  jumping = "jumping",
  goingUp = "goingUp",
  apex = "apex",
  goingDown = "goingDown",
  landing = "landing"
}

@addResourceLoader(
  new TextureResourceLoader("WolfBanditTexture", wolfBanditPng)
)
export class WolfBandit extends CoreEntity {
  static type = "WolfBandit";
  public type = "WolfBandit";
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
  private facingRight?: boolean;
  private patrolDistance = 4;
  private chasingEntity?: BaseEntityType;
  private jumpState?: JumpState; // Track the current jump state
  private isSlashing = false; // State to track if slashing
  private isDying = false; // State to track if dying
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
      },
      run: function* (entity) {
        let timeToNextPlan = 3000;
        while (true) {
          if (!entity.chasingEntity) return;
          const slashBBox = new CenteredBBox(
            entity.position.x + (entity.facingRight ? 1 : -1),
            entity.position.y,
            entity.size.width * 0.5 + entity.chasingEntity.size.width * 0.5,
            entity.size.height + entity.chasingEntity.size.height * 0.5
          );
          const chasePosition = vector3To2(entity.chasingEntity.position);
          if (slashBBox.contains(chasePosition.x, chasePosition.y)) {
            yield "slash";
          }
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
    slash: {
      run: function* (entity) {
        entity.behaviors.pathFollowing.controlEvents.emit(
          ControlEvents.MoveHorizontally,
          0
        );
        entity.behaviors.pathFollowing.cancelPath();
        entity.behaviors.pathFollowing.disableMotion();
        entity.isSlashing = true; // Use instance variable
        let slashDone = false;
        const onAnimationComplete = () => {
          slashDone = true;
        };
        entity.sprite.addEventListener("slashDone", onAnimationComplete);
        while (!slashDone) yield;
        entity.sprite.removeEventListener("slashDone", onAnimationComplete);
        entity.isSlashing = false; // Use instance variable
        entity.behaviors.pathFollowing.enableMotion();
      }
    },
    // Requires a death animation
    die: {
      run: function* (entity) {
        entity.sprite.playingAnimation = false;
        entity.isDying = true; // Use instance variable
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
      width: 28 * kInvPixelScale,
      height: 32 * kInvPixelScale
    };
    this.behaviors.motionCapabilities.init(this);
    this.behaviors.physics.init(this);
    this.behaviors.physicsControl.init(this);
    this.behaviors.perception.init(this);
    this.behaviors.perception.direction.x = -1;
    this.behaviors.status.init(this);
    this.behaviors.outOfBounds.init(this);

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
          this.sprite.mesh.scale.x = -kInvPixelScale;
          this.behaviors.perception.direction.x = 1;
        } else if (dx < 0) {
          this.facingRight = false;
          this.sprite.mesh.scale.x = kInvPixelScale;
          this.behaviors.perception.direction.x = -1;
        }
      }
    );

    this.behaviors.perception.perceptionEvents.on(
      PerceptionEvents.PerceiveEntityStart,
      (entity) => {
        if (this.chasingEntity !== entity) {
          this.scheduler.cancel("waitForEndOfChase");
          this.chasingEntity = entity;
          this.actionStack.beginAction("chasePlayer", undefined, true, true);
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
      sourceJSON: wolfBanditJson,
      texture: getResource(WolfBandit, "WolfBanditTexture"),
      frameName: ({ layerName, frame }) => `(${layerName}) ${frame}`,
      offset: new Vector2(-5, -7)
    });
    this.sprite.mesh.scale.multiplyScalar(kInvPixelScale);
    this.sprite.addTagFrameTrigger("slash", 3, "slash attack");
    this.sprite.addTagFrameTrigger("slash", 0, "slashDone");
    this.object3D.add(this.sprite.mesh);

    this.behaviors.status.attachSprite(this.sprite);

    this.sprite.addEventListener("slash attack", () => {
      const slashBounds = this.sprite.getLayerBoundingBox("Main");
      if (!slashBounds) return;
      const slashBBox = layerBoundsToCenteredBBox(slashBounds);
      const slashHit = new HitArea({
        sourceEntity: this,
        shouldCheckLineOfSight: true,
        position: {
          x:
            this.position.x +
            (this.facingRight ? -1 : 1) * (slashBBox.x - 0.75),
          y: this.position.y + slashBBox.y,
          z: 0
        }
      })
        .setRect({
          x: slashBBox.width,
          y: slashBBox.height
        })
        .setImpulse(new Vector2(this.facingRight ? 10 : -10, 0.5))
        .setDamage(5);
      this.level?.addEntity(slashHit);
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

  destroy() {
    super.destroy();
    this.sprite.dispose();
  }

  step(ms: number) {
    super.step(ms);
    this.actionStack.step(ms);
    if (this.sprite.getCurrentTag() === "walk") {
      const xVel = this.behaviors.physics.body?.linvel().x ?? 0;
      this.sprite.animate(0.75 * ms * Math.abs(xVel));
    } else {
      this.sprite.animate(ms);
    }

    this.applyMotionToSprite();
  }

  hit(hit: EntityHitDetails) {
    super.hit(hit);
    if (hit.hitImpulse) {
      this.behaviors.physics.body?.applyImpulse(hit.hitImpulse, true);
    }
  }

  private applyMotionToSprite() {
    const { sprite } = this;
    if (!sprite) return;

    // Update the sprite based on the current jump state
    if (this.jumpState) {
      if (this.sprite.getCurrentTag() !== "jump") {
        this.sprite.gotoTag("jump");
        this.sprite.gotoTagFrame(0);
        this.sprite.playingAnimation = true;
      }
      switch (this.jumpState) {
        case JumpState.jumping:
          if ((this.sprite.getCurrentTagFrame() ?? 0) > 1)
            this.sprite.gotoTagFrame(1);
          break;
        case JumpState.goingUp:
          if ((this.sprite.getCurrentTagFrame() ?? -1) !== 2)
            this.sprite.gotoTagFrame(2);
          break;
        case JumpState.apex:
          if ((this.sprite.getCurrentTagFrame() ?? -1) !== 3)
            this.sprite.gotoTagFrame(3);
          break;
        case JumpState.goingDown:
          if ((this.sprite.getCurrentTagFrame() ?? -1) !== 4)
            this.sprite.gotoTagFrame(4);
          break;
        case JumpState.landing:
          if ((this.sprite.getCurrentTagFrame() ?? -1) !== 5)
            this.sprite.gotoTagFrame(5);
          break;
      }
      return;
    }

    // Handle other animations
    if (this.isSlashing) {
      if (this.sprite.getCurrentTag() !== "slash") {
        this.sprite.gotoTag("slash");
        this.sprite.playingAnimation = true;
      }
    } else if (this.isDying) {
      if (this.sprite.getCurrentTag() !== "die") {
        this.sprite.gotoTag("die");
        this.sprite.playingAnimation = true;
      }
    } else if (Math.abs(this.behaviors.physics.body?.linvel().x ?? 0) > 0) {
      if (this.sprite.getCurrentTag() !== "walk") {
        this.sprite.gotoTag("walk");
        this.sprite.playingAnimation = true;
      }
    } else if (this.sprite.getCurrentTag() !== "idle") {
      this.sprite.gotoTag("idle");
      this.sprite.playingAnimation = true;
    }
  }

  private onBodyAnimationDone() {
    switch (this.sprite.getCurrentTag()) {
      case "jump":
        if (this.jumpState) {
          this.jumpState = undefined; // Ensure the jump state is cleared when the jump animation is done
        }
        break;
      case "walk":
      case "idle":
        this.sprite.playingAnimation = true;
        break;
      default:
        break;
    }
  }
}
