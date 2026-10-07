import { Object3D, Vector2, Vector3 } from "three";

import { BaseEntityType, EntityAlignment, EntityProps } from "src/api/entity";
import { createTypedEventEmitter } from "src/api/util";
import { playerCollisionGroup } from "src/engine/constants/collisionGroups";
import { kInvPixelScale, kPixelScale } from "src/engine/constants/scaling";
import { AIBehaviorTree } from "src/engine/entity/AIBehaviorTree";
import {
  Do,
  Inverter,
  Selector,
  Sequence,
  Succeeder,
  Wait
} from "src/engine/entity/AICoreNodes";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import { getAsset, setAssetDependencies } from "src/engine/entity/decorators";
import { vector3To2 } from "src/engine/util/vecTypes";
import { MoveToPosition } from "src/entities/shared/aiNodes/consumerNodes/AIMoveToPositionNode";
import { VerifyControlMode } from "src/entities/shared/aiNodes/consumerNodes/AIVerifyControlModeNode";
import { WaitForAnimationLoop } from "src/entities/shared/aiNodes/consumerNodes/AIWaitForAnimationLoopNode";
import { ChasePlayer } from "src/entities/shared/aiNodes/consumerNodes/subtrees/AIChasePlayerNode";
import { SetLinvel } from "src/entities/shared/aiNodes/consumerNodes/subtrees/AISetLinvelNode";
import { ScopeWithAnimation } from "src/entities/shared/aiNodes/decoratorNodes/AIScopeWithAnimationNode";
import { AIBehavior } from "src/entities/shared/behaviors/AIBehavior";
import {
  APIAnimationData,
  AnimationControlBehavior,
  AnimationPriority,
  SpriteFacingDirection
} from "src/entities/shared/behaviors/AnimationControlBehavior";
import { CentralDataStoreBehavior } from "src/entities/shared/behaviors/CentralDataStoreBehavior";
import { CharacterGroundPhysicsControlBehaviorStandard } from "src/entities/shared/behaviors/CharacterGroundPhysicsController";
import { CharacterPhysicsBehavior } from "src/entities/shared/behaviors/CharacterPhysics";
import { MotionCapabilitiesBehavior } from "src/entities/shared/behaviors/MotionCapabilities";
import {
  MotionPathFollowingBehavior,
  MotionPathFollowingEvents
} from "src/entities/shared/behaviors/MotionPath";
import { NavPathFollowingBehavior } from "src/entities/shared/behaviors/NavPathFollowingBehavior";
import { OutOfBoundsBehaviour } from "src/entities/shared/behaviors/OutOfBoundsBehaviour";
import {
  ControlProfile,
  ScriptedControlBehavior
} from "src/entities/shared/behaviors/ScriptedControlBehavior";
import { StatusBehavior } from "src/entities/shared/behaviors/StatusBehavior";

import { BeanBotAnimation, BeanBotLayer } from "./sprites/bean-bot-2";

type BeanBotState =
  | "physicsFollowPlayer"
  | "path"
  | "physics"
  | "dock"
  | "none";

export enum BeanBotEvents {
  Docked = "Docked",
  UnDocked = "UnDocked"
}

type BeanBotEventTypes = {
  [BeanBotEvents.Docked]: void;
  [BeanBotEvents.UnDocked]: void;
};

export type BeanBotProps = EntityProps & {
  hotSpawnedAtSave?: boolean;
};

@setAssetDependencies(() => ["beanBotSprite"])
export class BeanBot extends CoreEntity implements BaseEntityType {
  static readonly type = "BeanBot";
  public readonly type = BeanBot.type;

  public beanBotEvents = createTypedEventEmitter<BeanBotEventTypes>();

  public readonly alignment = EntityAlignment.NPC;
  public dead = false;
  public persist = false;

  public readonly size = {
    width: 0.5,
    height: 0.5
  };

  public object3D = new Object3D();
  private readonly sprite = getAsset("beanBotSprite").getSprite<
    BeanBotLayer,
    BeanBotAnimation
  >();

  private readonly dockStartAnimation: APIAnimationData<BeanBotAnimation> = {
    tagName: "dock_start",
    priorityLevel: AnimationPriority.ACTION
  };

  private readonly dockLoopAnimation: APIAnimationData<BeanBotAnimation> = {
    tagName: "dock_loop",
    isLooping: true,
    priorityLevel: AnimationPriority.ACTION
  };

  public behaviors = {
    motionCapabilities: new MotionCapabilitiesBehavior()
      .setJump(false)
      .setFly(true)
      .setSpeedLimits(3),
    physics: new CharacterPhysicsBehavior()
      .setDensity(1)
      .setGroup(playerCollisionGroup)
      .setGravityScale(0)
      .setDamping(0.5),
    physicsControl: new CharacterGroundPhysicsControlBehaviorStandard(),
    pathFollowing: new NavPathFollowingBehavior().setRetries(5),
    status: new StatusBehavior(),
    motionPathFollowing: new MotionPathFollowingBehavior().setTraversalSpeed(3),
    data: new CentralDataStoreBehavior(),
    animation: new AnimationControlBehavior<BeanBotAnimation>({
      idle: {
        tagName: "idle",
        priorityLevel: AnimationPriority.PHYSICS
      },
      turn: {
        tagName: "turn",
        speedScaler: 2,
        priorityLevel: AnimationPriority.PHYSICS
      }
    }),
    ai: new AIBehavior(),
    outOfBounds: new OutOfBoundsBehaviour(),
    scriptedControl: new ScriptedControlBehavior<BeanBotState>()
  };

  private readonly targetPosition = new Vector2();
  private readonly startingDockPosition = new Vector2();
  private currentCarryingItem?: BaseEntityType;

  private opacity = 1;

  private readonly finalDockingPositionDeltaA: Vector2;
  private readonly finalDockingPositionDeltaB: Vector2;
  private shouldFaceRightWhenDocking = false;

  constructor(props: BeanBotProps) {
    super(props);

    this.object3D.position
      .copy(this.position)
      .multiplyScalar(kPixelScale)
      .round()
      .multiplyScalar(kInvPixelScale);

    this.sprite.hideLayers("Tracking_pixel_eye_");
    this.sprite.mesh.scale.multiplyScalar(kInvPixelScale);
    this.sprite.mesh.scale.y *= -1;

    this.object3D.add(this.sprite.mesh);

    this.targetPosition.x = this.position.x;
    this.targetPosition.y = this.position.y;

    this.behaviors.motionCapabilities.init(this);
    this.behaviors.physics.init(this);
    this.behaviors.physicsControl
      .init(this)
      .assignMotionCapabilities(this.behaviors.motionCapabilities.capabilities)
      .attachPhysicsBehavior(this.behaviors.physics)
      .attachControlEvents(this.behaviors.pathFollowing.controlEvents);
    this.behaviors.status.init(this).disableHealth();
    this.behaviors.motionPathFollowing
      .init(this)
      .setTraversalDuration(Number(props.traversalDuration ?? 0));
    this.behaviors.pathFollowing
      .init(this)
      .setMotionCapabilities(this.behaviors.motionCapabilities.capabilities)
      .setPhysicsControl(this.behaviors.physicsControl)
      .setSourceRigidBody(this.behaviors.physics.body);
    this.behaviors.data.init(this);
    this.behaviors.animation
      .init(this)
      .attachSprite(this.sprite)
      .shouldFaceTowardsHorizontalVelocity(true);
    this.behaviors.outOfBounds.init(this);
    this.behaviors.scriptedControl
      .init(this)
      .attachPhysicsControl(this.behaviors.physicsControl)
      .attachNavPathFollowing(this.behaviors.pathFollowing)
      .attachMotionPathFollowing(this.behaviors.motionPathFollowing)
      .registerMode("none", ControlProfile.Frozen, true)
      .registerMode("path", ControlProfile.MotionPath)
      .registerMode("physics", ControlProfile.SelfDriven)
      .registerMode("physicsFollowPlayer", ControlProfile.SelfDriven)
      .registerMode("dock", ControlProfile.SelfDriven);

    this.sprite.center();
    const originalCenter = this.sprite.centerOffset.clone();

    this.sprite.gotoAnimation("docked");
    this.sprite.center();

    const finalDockingCenter = this.sprite.centerOffset.clone();

    this.finalDockingPositionDeltaA = new Vector2()
      .subVectors(finalDockingCenter, originalCenter)
      .multiplyScalar(kInvPixelScale);

    this.finalDockingPositionDeltaB = this.finalDockingPositionDeltaA.clone();
    this.finalDockingPositionDeltaB.x *= -1;

    this.sprite.gotoAnimation("idle");
    this.sprite.center();

    this.behaviors.scriptedControl.setMode("none");

    if (props.hotSpawnedAtSave) this.swapControlMethod("physicsFollowPlayer");

    this.behaviors.motionPathFollowing.events.on(
      MotionPathFollowingEvents.PathEndpointReached,
      () => this.swapControlMethod("none")
    );

    this._setupBehaviorTree();
  }

  private _setupBehaviorTree(): void {
    // prettier-ignore
    this.behaviors.ai
      .init(this)
      .behaviorTree = new AIBehaviorTree(
        Selector(
          VerifyControlMode("none"),
          Inverter(
            Succeeder(
              Do(this._updateIfCarryingItem)
            )
          ),
          VerifyControlMode("physics"),
          Sequence(
            VerifyControlMode("physicsFollowPlayer"),
            ChasePlayer(3)
          ),
          Sequence(
            VerifyControlMode("path"),
            Do(() => {
              this.targetPosition.copy(
                this.behaviors.motionPathFollowing.desiredPosition
              )

              const posCurrent = vector3To2(this.position);
              const currentLinVel =
                this.behaviors.physics.body?.linvel() ?? new Vector2();
              const time = 0.5;
              const posNext = posCurrent
                .clone()
                .add(
                  new Vector2(currentLinVel.x, currentLinVel.y).multiplyScalar(time)
                );
              const delta = this.targetPosition.clone().sub(posNext).divideScalar(time);
              const impulse = delta
                .clone()
                .multiplyScalar(this.behaviors.physics.body?.mass() ?? 1);
              this.behaviors.physics.body?.applyImpulse(impulse, true);
            })
          ),
          Sequence(
            VerifyControlMode("dock"),
            MoveToPosition(() => this.startingDockPosition, 0, true),
            SetLinvel(new Vector2(0, 0)),
            Do(() => this.teleport(new Vector3(
              this.startingDockPosition.x,
              this.startingDockPosition.y,
              this.position.z
            ))),
            Do(() =>
              this.shouldFaceRightWhenDocking
                ? this.faceRight()
                : this.faceLeft()
            ),
            ScopeWithAnimation(this.dockStartAnimation, 
              WaitForAnimationLoop()
            ),
            ScopeWithAnimation(this.dockLoopAnimation,
              Sequence(
                WaitForAnimationLoop(),
                Do(() => this.beanBotEvents.emit(BeanBotEvents.Docked)),
                Wait(Infinity)
              )
            )
          )
        )
      )
  }

  destroy(): void {
    super.destroy();
    this.sprite.dispose();
  }

  beginCarryingItem(item: BaseEntityType) {
    this.currentCarryingItem = item;
  }

  stopCarryingItem() {
    this.currentCarryingItem = undefined;
  }

  getCarryingItem() {
    return this.currentCarryingItem;
  }

  swapControlMethod(
    method: Extract<BeanBotState, "dock">,
    finalDockedPosition: Vector2
  ): void;
  swapControlMethod(method: Exclude<BeanBotState, "dock">): void;
  swapControlMethod(method: BeanBotState, finalDockedPosition?: Vector2): void {
    // Docking is BeanBot-specific: it needs to pick a docking approach position
    // and stop carrying any item. Everything else is generic control-mode
    // plumbing handled by ScriptedControlBehavior.
    if (finalDockedPosition) {
      const startingDockPositionA = new Vector2()
        .copy(finalDockedPosition)
        .sub(this.finalDockingPositionDeltaA);

      const startingDockPositionB = new Vector2()
        .copy(finalDockedPosition)
        .sub(this.finalDockingPositionDeltaB);

      const position2D = vector3To2(this.position);

      const distanceToDockPositionA = position2D.distanceTo(
        startingDockPositionA
      );
      const distanceToDockPositionB = position2D.distanceTo(
        startingDockPositionB
      );

      const closestDockPosition =
        distanceToDockPositionA < distanceToDockPositionB
          ? startingDockPositionA
          : startingDockPositionB;

      this.shouldFaceRightWhenDocking =
        distanceToDockPositionA >= distanceToDockPositionB;

      this.startingDockPosition.copy(closestDockPosition);
    }

    if (method === "dock") this.stopCarryingItem();

    this.behaviors.scriptedControl.setMode(method);
  }

  setOpacity(opacity: number, ms: number = 500) {
    if (ms === 0) {
      this.opacity = opacity;
      this.sprite.setOpacity(this.opacity);
      return;
    }
    const initialOpacity = this.opacity;
    this.scheduler.cancel("fadeOpacity");
    this.scheduler.add({
      id: "fadeOpacity",
      duration: ms,
      invokeFunction: (t) => {
        this.opacity = initialOpacity * (1 - t) + opacity * t;
        this.sprite.setOpacity(this.opacity);
      },
      invokeFunctionAtComplete: () => {
        this.opacity = opacity;
        this.sprite.setOpacity(this.opacity);
      }
    });
  }

  faceLeft(): void {
    this.behaviors.animation.facingDirection = SpriteFacingDirection.LEFT;
  }
  faceRight(): void {
    this.behaviors.animation.facingDirection = SpriteFacingDirection.RIGHT;
  }

  private _updateIfCarryingItem(): void {
    this.currentCarryingItem?.teleport?.(
      this.position.clone().add({
        x: this.behaviors.animation.facingDirection * -0.1,
        y: -0.5,
        z: -0.15
      })
    );
  }

  // NOTE: temp
  undock(): void {
    // TODO: more animated undock state
    this.swapControlMethod("physicsFollowPlayer");

    this.beanBotEvents.emit(BeanBotEvents.UnDocked);
  }
}

export function isBeanBot(entity: BaseEntityType): entity is BeanBot {
  return entity.type === BeanBot.type;
}
