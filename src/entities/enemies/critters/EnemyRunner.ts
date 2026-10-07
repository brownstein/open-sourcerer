import { Object3D, Vector2 } from "three";
import { ThreeAseprite } from "three-aseprite";

import { ControlEvents } from "src/api/controls";
import {
  BaseEntityType,
  EntityAlignment,
  EntityHitDetails,
  EntityLifecycleEvents,
  EntityProps
} from "src/api/entity";
import { EnemyProps } from "src/api/enemy";
import {
  enemyCollisionGroup,
  inactiveCollisionGroup
} from "src/engine/constants/collisionGroups";
import { kInvPixelScale } from "src/engine/constants/scaling";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import { addResourceLoader, getResource } from "src/engine/entity/decorators";
import { TextureResourceLoader } from "src/engine/loader/Loaders";
import { vector3To2 } from "src/engine/util/vecTypes";
import { ActionStack } from "src/entities/shared/ActionStack";
import { CharacterGroundPhysicsControlBehaviorStandard } from "src/entities/shared/behaviors/CharacterGroundPhysicsController";
import {
  CharacterPhysicsBehavior,
  CharacterPhysicsEvents
} from "src/entities/shared/behaviors/CharacterPhysics";
import { MotionCapabilitiesBehavior } from "src/entities/shared/behaviors/MotionCapabilities";
import {
  NavPathFollowingBehavior,
  PathFollowingBehaviorEvents
} from "src/entities/shared/behaviors/NavPathFollowingBehavior";
import { OutOfBoundsBehaviour } from "src/entities/shared/behaviors/OutOfBoundsBehaviour";
import {
  PerceptionBehavior,
  PerceptionEvents
} from "src/entities/shared/behaviors/Perception";
import { StatusBehavior } from "src/entities/shared/behaviors/StatusBehavior";

import runnerJson from "../sprites/enemy-runner/runner_enemy.json";
import runnerPng from "../sprites/enemy-runner/runner_enemy.png";

export enum RunnerState {
  Idle = "Idle",
  Walk = "Walk",
  Anticipation = "Anticipation",
  Run = "Run",
  Death = "death"
}

@addResourceLoader(new TextureResourceLoader("EnemyRunnerTexture", runnerPng))
export class EnemyRunner extends CoreEntity {
  static type = "EnemyRunner";
  public type = "EnemyRunner";
  public alignment = EntityAlignment.Enemy;
  public object3D = new Object3D();
  public sprite: ThreeAseprite;

  public behaviors = {
    motionCapabilities: new MotionCapabilitiesBehavior().setSpeedLimits(4.0),
    physics: new CharacterPhysicsBehavior().setGroup(enemyCollisionGroup),
    physicsControl: new CharacterGroundPhysicsControlBehaviorStandard(),
    pathFollowing: new NavPathFollowingBehavior(),
    perception: new PerceptionBehavior(),
    status: new StatusBehavior().setMaxHealth(15),
    outOfBounds: new OutOfBoundsBehaviour()
  };

  public facingRight = true;
  public patrolDistance = 3;

  private chasingEntity?: BaseEntityType;

  private nearbyPlayers: Set<BaseEntityType> = new Set();

  private actionStack = new ActionStack(this, {
    idlePatrol: {
      default: true,
      resume: (entity) => {
        entity.behaviors.motionCapabilities.setSpeedLimits(1.1);
        entity.behaviors.pathFollowing.cancelPath();
      },
      run: function* (entity) {
        let counter = 0;

        while (true) {
          entity.facingRight = !entity.facingRight;

          // Base the target on current position
          const goal = vector3To2(entity.position);
          goal.x += entity.facingRight
            ? entity.patrolDistance
            : -entity.patrolDistance;

          entity.sprite.gotoTag("Walk");

          // Initiate path
          entity.behaviors.pathFollowing.planAndFollowPathToPosition(goal, 0.5);

          counter = 0;
          // Wait for 3 seconds (or until interrupted)
          while (counter < 3000) {
            counter += yield;
            for (const other of entity.nearbyPlayers) {
              if (
                entity.behaviors.perception.currentEntityIdsInSight.has(
                  other.id
                )
              ) {
                entity.chasingEntity = other;
                yield "anticipation";
                break;
              }
            }
          }

          entity.sprite.gotoTag("Idle");

          // Brief idle pause
          let idle = 0;
          while (idle < 500) {
            idle += yield;
            for (const other of entity.nearbyPlayers) {
              if (
                entity.behaviors.perception.currentEntityIdsInSight.has(
                  other.id
                )
              ) {
                entity.chasingEntity = other;
                yield "anticipation";
                break;
              }
            }
          }
        }
      }
    },
    anticipation: {
      run: function* (entity) {
        // Start anticipation animation
        entity.behaviors.pathFollowing.cancelPath();
        entity.behaviors.pathFollowing.controlEvents.emit(
          ControlEvents.MoveHorizontally,
          0
        );
        entity.sprite.gotoTag("Anticipation");
        entity.sprite.playingAnimation = true;

        let animationComplete = false;

        const onAnimationComplete = () => {
          animationComplete = true;
          entity.sprite.removeEventListener(
            "animationComplete",
            onAnimationComplete
          );
        };

        entity.sprite.addEventListener(
          "animationComplete",
          onAnimationComplete
        );

        const onChargeComplete = () => {
          entity.scheduler.add({
            duration: 500,
            invokeFunction: (t) => {
              entity.behaviors.pathFollowing.controlEvents.emit(
                ControlEvents.MoveHorizontally,
                entity.facingRight ? t : -t
              );
            }
          });
          entity.sprite.removeEventListener("startCharging", onChargeComplete);
        };
        entity.sprite.addEventListener("startCharging", onChargeComplete);

        while (!animationComplete) yield;

        // Transition to chase or return to patrol
        if (entity.chasingEntity) {
          entity.sprite.gotoTag(RunnerState.Run);
          entity.actionStack.beginAction("chasePlayer");
        }
      }
    },
    chasePlayer: {
      resume: (entity) => {
        entity.behaviors.motionCapabilities.setSpeedLimits(3.7);
        entity.behaviors.pathFollowing.cancelPath();
      },
      run: function* (entity) {
        while (entity.chasingEntity) {
          const playerId = entity.chasingEntity.id;
          const target = entity.level?.getEntity(playerId);

          // Stop chasing if player is no longer valid
          if (!target) {
            entity.chasingEntity = undefined;
            break;
          }

          const from = vector3To2(entity.position);
          const to = vector3To2(target.position);

          // Dynamically update facing direction based on player position
          const direction = Math.sign(to.x - from.x);
          entity.facingRight = direction >= 0;
          entity.sprite.gotoTag("Run");

          // Plan and follow path to target
          let pathComplete = false;
          const onPathComplete = () => {
            pathComplete = true;
            entity.behaviors.pathFollowing.pathEvents.off(
              PathFollowingBehaviorEvents.PathComplete,
              onPathComplete
            );
          };
          entity.behaviors.pathFollowing.pathEvents.on(
            PathFollowingBehaviorEvents.PathComplete,
            onPathComplete
          );
          entity.behaviors.pathFollowing.planAndFollowPathToPosition(to);

          while (!pathComplete) {
            // Update facing during chase
            const updatedFrom = vector3To2(entity.position);
            const updatedTo = vector3To2(target.position);
            const newDirection = Math.sign(updatedTo.x - updatedFrom.x);
            if (newDirection !== 0) {
              entity.facingRight = newDirection > 0;
            }

            entity.sprite.mesh.scale.x = entity.facingRight
              ? kInvPixelScale
              : -kInvPixelScale;

            // Break early if player leaves perception
            if (
              !entity.behaviors.perception.currentEntityIdsInSight.has(playerId)
            ) {
              console.log(
                "[CHASE END] Lost sight mid-path. Returning to idle."
              );
              entity.chasingEntity = undefined;
              break;
            }

            yield;
          }

          // Stop chasing if the entity is lost
          if (!entity.chasingEntity) break;

          yield;
        }

        // Always return to idle patrol after chase ends
        yield "idlePatrol";
      }
    },
    death: {
      run: function* (entity) {
        entity.sprite.gotoTag(RunnerState.Death);
        entity.sprite.playingAnimation = true;
        let completed = false;
        entity.sprite.addEventListener("animationComplete", () => {
          completed = true;
        });
        while (!completed) {
          yield;
        }
        entity.level?.removeEntity(entity.id);
      }
    }
  });

  private perceptionHandler: (entity: BaseEntityType) => void;

  attackDamage = 4;
  private hasRecentlyHitPlayer = false;

  private handleCollision = ([entity, normal]: [BaseEntityType, Vector2]) => {
    if (
      this.hasRecentlyHitPlayer ||
      entity.alignment !== EntityAlignment.Player
    )
      return;

    // Knockback to player
    const hitImpulse = normal.clone().multiplyScalar(20);
    entity.hit?.({
      hittingEntity: this,
      sourceEntity: this,
      damage: this.attackDamage,
      hitImpulse
    });

    // Optional recoil
    this.behaviors.physics.body?.applyImpulse(
      hitImpulse.clone().multiplyScalar(-0.35),
      true
    );
  };

  constructor(props: EntityProps & EnemyProps) {
    super(props);

    this.size = {
      width: 28 * kInvPixelScale,
      height: 32 * kInvPixelScale
    };

    this.attackDamage = props.attack ? props.attack : this.attackDamage;
    this.behaviors.motionCapabilities.init(this);
    this.behaviors.physics.init(this);

    this.behaviors.physics.events.on(
      CharacterPhysicsEvents.CollideWithEntity,
      this.handleCollision
    );

    this.behaviors.physicsControl.init(this);
    this.behaviors.pathFollowing
      .init(this)
      .setMotionCapabilities(this.behaviors.motionCapabilities.capabilities)
      .setPhysicsControl(this.behaviors.physicsControl);
    this.behaviors.physicsControl.attachControlEvents(
      this.behaviors.pathFollowing.controlEvents
    );

    this.behaviors.pathFollowing.controlEvents.on(
      ControlEvents.MoveHorizontally,
      (dx) => {
        if (Math.abs(dx) > 0.01) {
          this.facingRight = dx > 0;
          this.behaviors.perception.direction.x = dx > 0 ? 1 : -1;
        }
      }
    );

    // Player Detection Handler
    this.perceptionHandler = (entity: BaseEntityType) => {
      if (entity.alignment !== EntityAlignment.Player) return;

      // Just track the player as someone within perception range
      this.nearbyPlayers.add(entity);
    };

    // Initialize the perception system
    this.behaviors.perception.init(this);

    // Subscribe to perception start
    this.behaviors.perception.perceptionEvents.on(
      PerceptionEvents.EntityTrackingStart,
      this.perceptionHandler
    );

    // Handle loss of perception
    this.behaviors.perception.perceptionEvents.on(
      PerceptionEvents.EntityTrackingEnd,
      (entityId) => {
        const entity = this.level?.getEntity(entityId);
        if (entity?.alignment === EntityAlignment.Player) {
          this.nearbyPlayers.delete(entity);
          this.chasingEntity = undefined;
        }
      }
    );

    this.events.on(EntityLifecycleEvents.Die, () => {
      this.behaviors.pathFollowing.disableMotion();
      this.behaviors.pathFollowing.cancelPath();
      this.behaviors.pathFollowing.controlEvents.emit(
        ControlEvents.MoveHorizontally,
        0
      );
      this.behaviors.physics.setGroup(inactiveCollisionGroup);
      this.actionStack.beginAction("death", undefined, true, true);
    });

    // Initialize status and default action
    this.behaviors.status.setMaxHealth(props.health ?? 15);
    this.behaviors.status.init(this);
    this.behaviors.outOfBounds.init(this);
    this.actionStack.beginDefaultAction();

    // Load and display idle sprite
    this.sprite = new ThreeAseprite({
      sourceJSON: runnerJson,
      texture: getResource(EnemyRunner, "EnemyRunnerTexture"),
      frameName: ({ layerName, frame }) => `(${layerName}) ${frame}`
    });

    this.sprite.addTagFrameTrigger("Anticipation", 4, "startCharging");

    this.sprite.mesh.scale.multiplyScalar(kInvPixelScale);

    const halfHeight = this.size.height / 2;
    const pixelShiftX = 31;
    const worldShiftX = pixelShiftX * kInvPixelScale;

    this.sprite.mesh.position.set(-worldShiftX, halfHeight, 0);

    this.object3D.add(this.sprite.mesh);
    this.behaviors.status.attachSprite(this.sprite);

    this.sprite.gotoTag(RunnerState.Idle);
    this.sprite.playingAnimation = true;
  }

  public override step(ms: number) {
    super.step(ms);
    this.behaviors.pathFollowing.step(ms);
    this.actionStack.step(ms);

    const currentAction = this.actionStack.currentAction();
    const isChasing = currentAction === "chasePlayer";

    // If currently chasing, update facing toward the player
    if (this.chasingEntity && isChasing) {
      const from = vector3To2(this.position);
      const to = vector3To2(this.chasingEntity.position);
      const direction = Math.sign(to.x - from.x);
      if (direction !== 0) {
        this.facingRight = direction > 0;
      }
    }

    // Update sprite direction and position offset
    const scaleX = this.facingRight ? -kInvPixelScale : kInvPixelScale;
    const offsetX = this.facingRight
      ? 31 * kInvPixelScale
      : -31 * kInvPixelScale;

    this.sprite.mesh.scale.x = scaleX;
    this.sprite.mesh.position.x = offsetX;
    this.sprite.animate(ms);
  }

  public override hit(hit: EntityHitDetails) {
    super.hit(hit);
    if (hit.hitImpulse) {
      this.behaviors.physics.body?.applyImpulse(hit.hitImpulse, true);
    }
  }

  public override destroy() {
    super.destroy();
    this.sprite.dispose();
  }
}
