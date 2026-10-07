import { RigidBody } from "@dimforge/rapier2d-compat";
import { Box2, Vector2 } from "three";

import {
  ControlEventEmitter,
  ControlEventTypes,
  ControlEvents
} from "src/api/controls";
import {
  BaseEntityType,
  EntityBehavior,
  EntityLifecycleEvents,
  LevelAPI
} from "src/api/entity";
import {
  MotionCapabilities,
  NavAction,
  NavAttackInfo,
  NavJumpInfo,
  PathPlan,
  PathPlanRequest
} from "src/api/navigation";
import { createTypedEventEmitter } from "src/api/util";
import { kWorldGravity } from "src/engine/level/Level";
import { CenteredBBox } from "src/engine/navigation/CenteredBBox";
import { Scheduler } from "src/engine/scheduling/Scheduler";
import { vector3To2 } from "src/engine/util/vecTypes";
import { isLineOfSightClear } from "src/entities/shared/lineOfSight";

import { CharacterGroundPhysicsControlBehavior } from "./CharacterGroundPhysicsController";

export enum PathFollowingBehaviorEvents {
  PathPlanned = "PathPlanned",
  PathPlanningFailed = "PathPlanningFailed",
  PathComplete = "PathComplete",
  PathDeviated = "PathDeviated",
  AttackReady = "AttackReady"
}

export type PathFollowingBehaviorEventTypes = {
  [PathFollowingBehaviorEvents.PathPlanned]: PathPlan;
  [PathFollowingBehaviorEvents.PathPlanningFailed]: void;
  [PathFollowingBehaviorEvents.PathComplete]: void;
  [PathFollowingBehaviorEvents.PathDeviated]: void;
  [PathFollowingBehaviorEvents.AttackReady]: NavAttackInfo;
};

export enum PathFailureBehaviors {
  Retry = "Retry",
  Bail = "Bail"
}

type NavStepApproachPlan = {
  jump?: NavJumpInfo;
  fall?: boolean;
  targetBBox?: CenteredBBox;
  approachVector?: Vector2;
  targetVelocityX?: number;
};

export class NavPathFollowingBehavior implements EntityBehavior {
  public type = "NavPathFollowing";
  public readonly controlEvents: ControlEventEmitter =
    createTypedEventEmitter<ControlEventTypes>();
  public readonly pathEvents =
    createTypedEventEmitter<PathFollowingBehaviorEventTypes>();

  // These are public and safe to modify.
  public goalPosition?: Vector2;
  public failureBehavior = PathFailureBehaviors.Retry;
  public maxRetries: number = 5;
  public retryCount: number = 5;
  public retryDelay = 500;
  public jumpDelay = 0;
  public inJumpDelay = false;
  public pathReq?: PathPlanRequest;

  // These are public so the dev behavior can render these attributes.
  public pathPlanInProgress = false;
  public pathPlan?: PathPlan;
  public pathPlanStep: number = 0;
  public pathPlanJumpTime: number = 0;

  private level?: LevelAPI;
  private approachPlan?: NavStepApproachPlan;
  private validationBBox = new CenteredBBox(0, 0, 1.25, 1.25);
  private entity?: BaseEntityType;
  private motionCapabilities?: MotionCapabilities;
  private physicsControl?: CharacterGroundPhysicsControlBehavior;
  private justJumped: boolean = false;
  private justFell: boolean = false;
  private scheduler = new Scheduler();
  private motionEnabled = true;
  private flyLookAheadTargetStep?: number;
  private sourceRigidBody?: RigidBody;
  constructor() {
    this.step = this.step.bind(this);
  }
  init(entity: BaseEntityType) {
    this.entity = entity;
    this.entity.events.on(EntityLifecycleEvents.Step, this.step);
    // this.validationBBox.width = this.entity.size.width;
    this.validationBBox.height = this.entity.size.height;
    if (this.validationBBox.height < 1.5) this.validationBBox.height = 1.5;
    return this;
  }
  attachToLevel(level: LevelAPI) {
    this.level = level;
  }
  setMotionCapabilities(motionCapabilities: MotionCapabilities) {
    this.motionCapabilities = motionCapabilities;
    return this;
  }
  setSourceRigidBody(body: RigidBody | undefined) {
    this.sourceRigidBody = body;
    return this;
  }
  setPhysicsControl(physicsControl: CharacterGroundPhysicsControlBehavior) {
    this.physicsControl = physicsControl;
    return this;
  }
  setRetries(retryCount: number) {
    this.retryCount = retryCount;
    this.maxRetries = retryCount;
    return this;
  }
  enableMotion() {
    this.motionEnabled = true;
  }
  disableMotion() {
    this.motionEnabled = false;
  }
  async planAndFollowPathToPosition(goal: Vector2, stopDistanceAway?: number) {
    const { entity, motionCapabilities } = this;
    if (!entity || !motionCapabilities) return false;
    this.goalPosition = goal;
    this.retryCount = this.maxRetries;
    this.pathReq = {
      fromPosition: entity.position,
      toPosition: goal,
      toPositionGroundingDistance: entity.size.height,
      toPositionSpread: stopDistanceAway
        ? {
            x: stopDistanceAway,
            y: entity.size.height
          }
        : undefined,
      bestEffort: true,
      distanceLimit: 32,
      motionCapabilities: { ...motionCapabilities },
      ignoreObstacleId: entity.id
    };
    this.pathPlanInProgress = true;
    const pathPlan = await this.level?.navigation?.planPath(this.pathReq);
    this.pathPlanInProgress = false;
    if (pathPlan) {
      this.pathEvents.emit(PathFollowingBehaviorEvents.PathPlanned, pathPlan);
      this.setPathPlan(pathPlan);
      return true;
    } else {
      this.pathEvents.emit(PathFollowingBehaviorEvents.PathPlanningFailed);
      this.retryCount--;
      this.scheduler.add({
        duration: this.retryDelay,
        invokeFunctionAtComplete: () => {
          if (this.retryCount > 0) {
            this.redoPath();
          }
        }
      });
      return this.retryCount > 0;
    }
  }
  async planAndFollowAttackPathToPosition(target: Vector2) {
    const { entity, motionCapabilities } = this;
    if (!entity || !motionCapabilities) return false;
    this.goalPosition = target;
    this.retryCount = this.maxRetries;
    this.pathReq = {
      fromPosition: entity.position,
      toPosition: target,
      toPositionGroundingDistance: entity.size.height,
      attackTarget: target,
      bestEffort: true,
      distanceLimit: 32,
      motionCapabilities: { ...motionCapabilities },
      ignoreObstacleId: entity.id
    };
    this.pathPlanInProgress = true;
    const pathPlan = await this.level?.navigation?.planPath(this.pathReq);
    this.pathPlanInProgress = false;
    if (pathPlan) {
      this.pathEvents.emit(PathFollowingBehaviorEvents.PathPlanned, pathPlan);
      this.setPathPlan(pathPlan);
      return true;
    } else {
      this.pathEvents.emit(PathFollowingBehaviorEvents.PathPlanningFailed);
      this.retryCount--;
      this.scheduler.add({
        duration: this.retryDelay,
        invokeFunctionAtComplete: () => {
          if (this.retryCount > 0) {
            this.redoPath();
          }
        }
      });
      return this.retryCount > 0;
    }
  }
  setPathPlan(plan: PathPlan | null) {
    this.pathPlan = plan ?? undefined;
    this.pathPlanStep = -1;
    this.pathPlanJumpTime = 0;
    this.flyLookAheadTargetStep = undefined;
    this.advancePlanStep();
    return this;
  }
  step(ms: number) {
    if (!this.motionEnabled) return;
    this.scheduler.step(ms);
    this.followPathPlan(Math.min(100, ms));
  }
  private followPathPlan(ms: number) {
    const { entity, pathPlan, pathPlanStep } = this;
    if (!entity || !pathPlan) return true;
    const planStep = pathPlan.steps[pathPlanStep];
    if (planStep === undefined) {
      this.pathEvents.emit(PathFollowingBehaviorEvents.PathComplete);
      this.controlEvents.emit(ControlEvents.MoveHorizontally, 0);
      this.controlEvents.emit(ControlEvents.MoveVertically, 0);
      this.pathPlan = undefined;
      return true;
    }
    if (planStep.action === NavAction.Attack) {
      this.controlEvents.emit(ControlEvents.MoveHorizontally, 0);
      this.controlEvents.emit(ControlEvents.MoveVertically, 0);
      this.pathEvents.emit(
        PathFollowingBehaviorEvents.AttackReady,
        planStep.attack
      );
      this.pathEvents.emit(PathFollowingBehaviorEvents.PathComplete);
      this.pathPlan = undefined;
      return true;
    }
    if (!this.validateCurrentProgress(this.pathPlanStep === 0 ? 0.5 : 0.25)) {
      this.pathPlanDeviated();
      return false;
    }
    if (this.performApproachPlanAndCheckComplete(ms)) {
      if (this.flyLookAheadTargetStep !== undefined) {
        this.pathPlanStep = this.flyLookAheadTargetStep;
        this.flyLookAheadTargetStep = undefined;
      }
      this.advancePlanStep();
    }
    return false;
  }
  private followJumpPlan(jump: NavJumpInfo, ms: number) {
    if (!this.entity || !this.motionCapabilities || !this.physicsControl)
      return true;
    if (this.pathPlanJumpTime === 0 && !this.justJumped) {
      if (this.physicsControl.isGrounded()) {
        if (this.scheduler.hasEvent("doJump")) return false;
        const doJump = () => {
          this.inJumpDelay = false;
          const hSpeedFrac =
            jump.initialVelocityX /
            (this.motionCapabilities?.maxGroundSpeedX ?? 1);
          this.controlEvents.emit(ControlEvents.MoveVertically, 0);
          this.controlEvents.emit(ControlEvents.MoveHorizontally, hSpeedFrac);
          this.controlEvents.emit(ControlEvents.JumpStart);
          this.pathPlanJumpTime += ms;
          this.justJumped = true;
          this.scheduler.add({
            duration: 100,
            invokeFunctionAtComplete: () => {
              // WARN: commented out because this messed with variable jump height (isJumpingCurrentlyInptted property in CharacterGroundPhysics)
              // this.controlEvents.emit(ControlEvents.JumpRelease);
              this.justJumped = false;
            }
          });
        };
        if (!this.jumpDelay) {
          doJump();
        } else {
          this.inJumpDelay = true;
          this.controlEvents.emit(ControlEvents.PreJump);
          this.controlEvents.emit(ControlEvents.MoveHorizontally, 0);
          this.scheduler.add({
            id: "doJump",
            startIn: this.jumpDelay,
            invokeFunctionAtComplete: doJump
          });
        }
        return false;
      }
      const hSpeedFrac =
        jump.initialVelocityX / (this.motionCapabilities.maxGroundAccelX ?? 1);
      this.controlEvents.emit(ControlEvents.MoveHorizontally, hSpeedFrac);
      return false;
    }
    this.pathPlanJumpTime += ms;
    const tSec = this.pathPlanJumpTime * 0.001;
    if (tSec >= jump.airTime) {
      this.pathPlanJumpTime = 0;
      return true;
    }
    const x =
      jump.initialX + ((jump.finalX - jump.initialX) * tSec) / jump.airTime;
    const dx = x - this.entity.position.x;
    const xVel = jump.initialVelocityX + jump.accelerationX * tSec + dx / 50;
    const hSpeedFrac =
      xVel /
      (this.motionCapabilities.maxAirSpeedX ??
        this.motionCapabilities.maxGroundSpeedX ??
        1);
    this.controlEvents.emit(ControlEvents.MoveHorizontally, hSpeedFrac);
    return false;
  }
  private advancePlanStep() {
    if (!this.pathPlan || !this.entity || !this.motionCapabilities)
      return false;
    const mc = this.motionCapabilities;
    const lastStep = this.pathPlan.steps[this.pathPlanStep];
    const planStep = this.pathPlan.steps[++this.pathPlanStep];
    if (planStep) {
      switch (planStep.action) {
        case NavAction.Walk: {
          const nextStep = this.pathPlan.steps[this.pathPlanStep];
          const nextStepAfterNext = this.pathPlan.steps[this.pathPlanStep + 1];
          let targetVelocityX: number | undefined;
          if (nextStep) {
            switch (nextStep.action) {
              case NavAction.Fall:
                if (nextStepAfterNext?.action === NavAction.Walk) {
                  targetVelocityX = Math.max(
                    -(mc.maxGroundSpeedX ?? 1),
                    Math.min(
                      mc.maxGroundSpeedX ?? 1,
                      nextStepAfterNext.x - planStep.x
                    )
                  );
                } else if (nextStep?.action === NavAction.Fall) {
                  targetVelocityX = 0;
                }
                break;
              case NavAction.Jump:
                targetVelocityX = nextStep.jump.initialVelocityX;
                break;
              default:
                break;
            }
          }
          this.approachPlan = {
            targetBBox: new CenteredBBox(
              planStep.x,
              planStep.y,
              1,
              Math.max(1, this.entity.size.height)
            ),
            approachVector: lastStep
              ? new Vector2(planStep.x - lastStep.x, planStep.y - lastStep.y)
              : undefined,
            targetVelocityX
          };
          break;
        }
        case NavAction.Fly: {
          const flyBBoxSize = Math.max(
            this.entity.size.width,
            this.entity.size.height
          );
          this.approachPlan = {
            targetBBox: new CenteredBBox(
              planStep.x,
              planStep.y,
              1,
              flyBBoxSize
            ),
            approachVector: lastStep
              ? new Vector2(planStep.x - lastStep.x, planStep.y - lastStep.y)
              : undefined
          };
          const lookAheadStep = this.computeFlyLookAhead();
          if (lookAheadStep !== undefined && this.pathPlan) {
            const targetStep = this.pathPlan.steps[lookAheadStep];
            this.flyLookAheadTargetStep = lookAheadStep;
            this.approachPlan.targetBBox = new CenteredBBox(
              targetStep.x,
              targetStep.y,
              1,
              flyBBoxSize
            );
            this.approachPlan.approachVector = new Vector2(
              targetStep.x - this.entity.position.x,
              targetStep.y - this.entity.position.y
            );
          } else {
            this.flyLookAheadTargetStep = undefined;
          }
          break;
        }
        case NavAction.Fall:
          this.approachPlan = {
            targetBBox: new CenteredBBox(
              planStep.x,
              planStep.y,
              1,
              Math.max(1, this.entity.size.height)
            )
          };
          break;
        case NavAction.FallThrough:
          this.approachPlan = {
            targetBBox: new CenteredBBox(
              planStep.x,
              planStep.y,
              1,
              Math.max(1, this.entity.size.height)
            ),
            approachVector: lastStep
              ? new Vector2(planStep.x - lastStep.x, planStep.y - lastStep.y)
              : undefined,
            fall: true
          };
          break;
        case NavAction.Jump:
          this.approachPlan = {
            targetBBox: new CenteredBBox(
              planStep.x,
              planStep.y,
              1,
              Math.max(1, this.entity.size.height)
            ),
            jump: planStep.jump
          };
          break;
        case NavAction.Start:
        default:
          this.approachPlan = {
            fall: planStep.y < this.entity.position.y - 0.5,
            targetBBox:
              planStep.y < this.entity.position.y - 0.5
                ? new CenteredBBox(
                    planStep.x,
                    planStep.y,
                    1,
                    Math.max(1, this.entity.size.height)
                  )
                : undefined,
            approachVector:
              planStep.y < this.entity.position.y - 0.5
                ? new Vector2(
                    planStep.x - this.entity.position.x,
                    planStep.y - this.entity.position.y
                  )
                : undefined
          };
          break;
      }
    } else {
      this.approachPlan = undefined;
    }
  }
  private performApproachPlanAndCheckComplete(ms: number) {
    const { entity, approachPlan, motionCapabilities: mc } = this;
    if (!entity || !approachPlan || !mc) return false;
    let approachDone = true;
    let delta: Vector2 | undefined;
    if (approachPlan.targetBBox) {
      delta = new Vector2(
        approachPlan.targetBBox.x - entity.position.x,
        approachPlan.targetBBox.y - entity.position.y
      );
    }
    if (!approachPlan.approachVector && approachPlan.targetBBox) {
      approachDone &&= approachPlan.targetBBox.contains(
        entity.position.x,
        entity.position.y
      );
    }
    if (approachPlan.approachVector && delta) {
      approachDone &&= approachPlan.approachVector.dot(delta) <= 0;
    }
    if (!approachDone && approachPlan.fall) {
      if (!this.justFell) {
        this.controlEvents.emit(ControlEvents.FallThrough);
        this.justFell = true;
        this.scheduler.add({
          duration: 100,
          invokeFunctionAtComplete: () => {
            this.controlEvents.emit(ControlEvents.FallThroughEnd);
            this.justFell = false;
          }
        });
      }
    }
    if (approachPlan.jump) {
      const jumpDone = this.followJumpPlan(approachPlan.jump, ms);
      approachDone = jumpDone;
    } else if (!approachDone) {
      if (mc.canFly) {
        if (delta !== undefined) {
          const maxSpeed = mc.maxFlySpeed ?? mc.maxGroundAccelX ?? 1;
          const flyDelt = delta.clone().normalize().multiplyScalar(maxSpeed);
          this.controlEvents.emit(
            ControlEvents.MoveHorizontally,
            flyDelt.x / maxSpeed
          );
          this.controlEvents.emit(
            ControlEvents.MoveVertically,
            flyDelt.y / maxSpeed
          );
        }
      } else {
        const moveDelta = approachPlan.approachVector ?? delta;
        if (!moveDelta) return approachDone;
        const maxSpeedX = mc.maxGroundSpeedX ?? 1;
        let moveSpeedX =
          moveDelta.x === 0 ? 0 : moveDelta.x > 0 ? maxSpeedX : -maxSpeedX;
        const targetMoveSpeedX = approachPlan.targetVelocityX;
        if (targetMoveSpeedX !== undefined) {
          const approachTime =
            moveDelta.x / (0.5 + (targetMoveSpeedX + moveSpeedX));
          if (approachTime > 0 && approachTime < 1) {
            moveSpeedX =
              moveSpeedX * approachTime + targetMoveSpeedX * (1 - approachTime);
          }
        }
        const moveFracX = moveSpeedX / maxSpeedX;
        this.controlEvents.emit(ControlEvents.MoveHorizontally, moveFracX);
      }
    }
    return approachDone;
  }
  private validateCurrentProgress(extraRadius?: number) {
    const oldValidBBox = this.validationBBox.clone();
    if (extraRadius) {
      this.validationBBox.width += extraRadius * 2;
      this.validationBBox.height += extraRadius * 2;
    }
    const result = this.validateCurrentProgressExt();
    this.validationBBox = oldValidBBox;
    return result;
  }
  private validateCurrentProgressExt() {
    const { entity, pathPlan, pathPlanStep } = this;
    if (!entity || !pathPlan || pathPlanStep === undefined) return true;
    const prevStep = pathPlan.steps[pathPlanStep - 1];
    const currentStep = pathPlan.steps[pathPlanStep];
    switch (currentStep.action) {
      case NavAction.Jump: {
        const jump = currentStep.jump;
        this.validationBBox.x = entity.position.x;
        this.validationBBox.y = entity.position.y;
        const tSec = this.pathPlanJumpTime * 0.001;
        const x =
          jump.initialX +
          jump.initialVelocityX * tSec +
          0.5 * jump.accelerationX * tSec * tSec;
        const y =
          jump.initialY +
          jump.initialVelocityY * tSec +
          0.5 * kWorldGravity.y * tSec * tSec;
        return this.validationBBox.contains(x, y);
      }
      default: {
        this.validationBBox.x = entity.position.x;
        this.validationBBox.y = entity.position.y;
        if (this.validationBBox.contains(currentStep.x, currentStep.y))
          return true;
        if (prevStep && this.validationBBox.contains(prevStep.x, prevStep.y))
          return true;
        if (this.flyLookAheadTargetStep !== undefined) {
          const lookAheadTarget = pathPlan.steps[this.flyLookAheadTargetStep];
          if (lookAheadTarget) {
            const laBbox = new Box2();
            laBbox.expandByPoint(new Vector2(currentStep.x, currentStep.y));
            laBbox.expandByPoint(
              new Vector2(lookAheadTarget.x, lookAheadTarget.y)
            );
            const laR =
              0.5 *
              Math.max(this.validationBBox.width, this.validationBBox.height);
            if (laBbox.distanceToPoint(vector3To2(entity.position)) <= laR)
              return true;
          }
        }
        // TODO: actual distance from line segment.
        if (!prevStep || !currentStep) return false;
        const r =
          0.5 * Math.max(this.validationBBox.width, this.validationBBox.height);
        const bbox = new Box2();
        bbox.expandByPoint(new Vector2(prevStep.x, prevStep.y));
        bbox.expandByPoint(new Vector2(currentStep.x, currentStep.y));
        if (bbox.distanceToPoint(vector3To2(entity.position)) <= r) return true;
        return false;
      }
    }
  }
  private pathPlanDeviated() {
    this.pathEvents.emit(PathFollowingBehaviorEvents.PathDeviated);
    this.controlEvents.emit(ControlEvents.MoveHorizontally, 0);
    this.controlEvents.emit(ControlEvents.MoveVertically, 0);
    this.pathPlan = undefined;
    this.pathPlanStep = 0;
    this.flyLookAheadTargetStep = undefined;
    this.pathPlanJumpTime = 0;
    switch (this.failureBehavior) {
      case PathFailureBehaviors.Bail:
        return;
      case PathFailureBehaviors.Retry:
        this.retryCount--;
        this.scheduler.add({
          duration: this.retryDelay,
          invokeFunctionAtComplete: () => {
            if (this.retryCount > 0) {
              this.redoPath();
            }
          }
        });
        return;
    }
  }
  private async redoPath() {
    const { level, entity, pathReq } = this;
    if (!level || !entity || !pathReq) return;
    if (!this.physicsControl?.isGrounded()) {
      this.pathPlanDeviated();
      return;
    }
    pathReq.fromPosition = entity.position;
    const newPathPlan = await level.navigation?.planPath(pathReq);
    if (newPathPlan) {
      this.pathEvents.emit(
        PathFollowingBehaviorEvents.PathPlanned,
        newPathPlan
      );
      this.setPathPlan(newPathPlan);
    } else {
      this.pathEvents.emit(PathFollowingBehaviorEvents.PathPlanningFailed);
      this.pathPlanDeviated();
    }
  }
  private computeFlyLookAhead(): number | undefined {
    const { entity, pathPlan, pathPlanStep, level } = this;
    if (!entity || !pathPlan || !level) return undefined;

    const MAX_LOOK_AHEAD = 5;
    const entityX = entity.position.x;
    const entityY = entity.position.y;

    let lastFlyStepIndex = pathPlanStep;
    for (
      let i = pathPlanStep + 1;
      i < pathPlan.steps.length && i <= pathPlanStep + MAX_LOOK_AHEAD;
      i++
    ) {
      if (pathPlan.steps[i].action !== NavAction.Fly) break;
      lastFlyStepIndex = i;
    }

    if (lastFlyStepIndex <= pathPlanStep) return undefined;

    for (let i = lastFlyStepIndex; i > pathPlanStep; i--) {
      const candidateStep = pathPlan.steps[i];
      if (
        isLineOfSightClear(
          level,
          entityX,
          entityY,
          candidateStep.x,
          candidateStep.y,
          this.sourceRigidBody
        )
      ) {
        return i;
      }
    }

    return undefined;
  }
  public hasPlan() {
    return !!this.pathPlan;
  }
  public planning() {
    return this.pathPlanInProgress;
  }
  public isPathFollowing() {
    return this.hasPlan() || this.planning();
  }
  cancelPath() {
    this.scheduler.cancel("doJump");
    if (this.pathPlan) {
      this.pathPlan = undefined;
      this.pathPlanStep = 0;
      this.pathPlanJumpTime = 0;
      this.flyLookAheadTargetStep = undefined;
      this.controlEvents.emit(ControlEvents.MoveHorizontally, 0);
      this.controlEvents.emit(ControlEvents.MoveVertically, 0);
    }
  }
}
