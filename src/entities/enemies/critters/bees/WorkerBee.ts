import { Object3D, Vector2 } from "three";

import { EnemyProps } from "src/api/enemy";
import { DamageType, EntityAlignment, EntityProps } from "src/api/entity";
import { NavAction } from "src/api/navigation";
import {
  enemyCollisionGroup,
  terrainSensorCollisionGroup
} from "src/engine/constants/collisionGroups";
import { kInvPixelScale, kPixelScale } from "src/engine/constants/scaling";
import { AIBehaviorTree } from "src/engine/entity/AIBehaviorTree";
import { Debounce, Selector, Sequence } from "src/engine/entity/AICoreNodes";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import { getAsset, setAssetDependencies } from "src/engine/entity/decorators";
import { HitAreaShape } from "src/entities/shared/HitArea";
import { CancelMotionPathFollowing } from "src/entities/shared/aiNodes/consumerNodes/AICancelMotionPathFollowingNode";
import { CancelPathFollowing } from "src/entities/shared/aiNodes/consumerNodes/AICancelPathFollowingNode";
import { IsAggroed } from "src/entities/shared/aiNodes/consumerNodes/AIIsAggroedNode";
import { SetMotionCapabilities } from "src/entities/shared/aiNodes/consumerNodes/AISetMotionCapabilitiesNode";
import { SpawnHitArea } from "src/entities/shared/aiNodes/consumerNodes/AISpawnHitAreaNode";
import { StartMotionPathFollowing } from "src/entities/shared/aiNodes/consumerNodes/AIStartMotionPathFollowingNode";
import { VerifyControlMode } from "src/entities/shared/aiNodes/consumerNodes/AIVerifyControlModeNode";
import { VerifyMotionPathProvider } from "src/entities/shared/aiNodes/consumerNodes/AIVerifyMotionPathProviderNode";
import { WaitForAnimationFrame } from "src/entities/shared/aiNodes/consumerNodes/AIWaitForAnimationFrameNode";
import { WaitForAnimationLoop } from "src/entities/shared/aiNodes/consumerNodes/AIWaitForAnimationLoopNode";
import { ChaseAggroedEntity } from "src/entities/shared/aiNodes/consumerNodes/subtrees/AIChaseAggroedEntityNode";
import { GroundPatrol } from "src/entities/shared/aiNodes/consumerNodes/subtrees/AIGroundPatrolNode";
import { HandleDeath } from "src/entities/shared/aiNodes/consumerNodes/subtrees/AIHandleDeathNode";
import { IsAggroedEntityInFront } from "src/entities/shared/aiNodes/consumerNodes/subtrees/AIIsAggroedEntityInFrontNode";
import { ScopeWithAnimation } from "src/entities/shared/aiNodes/decoratorNodes/AIScopeWithAnimationNode";
import { AIBehavior } from "src/entities/shared/behaviors/AIBehavior";
import {
  APIAnimationData,
  AnimationControlBehavior,
  AnimationPriority
} from "src/entities/shared/behaviors/AnimationControlBehavior";
import { CentralDataStoreBehavior } from "src/entities/shared/behaviors/CentralDataStoreBehavior";
import { CharacterGroundPhysicsControlBehaviorStandard } from "src/entities/shared/behaviors/CharacterGroundPhysicsController";
import { CharacterPhysicsBehavior } from "src/entities/shared/behaviors/CharacterPhysics";
import { CollisionDamageBehavior } from "src/entities/shared/behaviors/CollisionDamageBehavior";
import { EnemyAggroBehavior } from "src/entities/shared/behaviors/EnemyAggroBehavior";
import { MotionCapabilitiesBehavior } from "src/entities/shared/behaviors/MotionCapabilities";
import {
  MotionPathFollowingBehavior,
  MotionPathFollowingEvents
} from "src/entities/shared/behaviors/MotionPath";
import { NavPathFollowingBehavior } from "src/entities/shared/behaviors/NavPathFollowingBehavior";
import { OutOfBoundsBehaviour } from "src/entities/shared/behaviors/OutOfBoundsBehaviour";
import { PerceptionBehavior } from "src/entities/shared/behaviors/Perception";
import {
  ControlProfile,
  ScriptedControlBehavior
} from "src/entities/shared/behaviors/ScriptedControlBehavior";
import { StatusBehavior } from "src/entities/shared/behaviors/StatusBehavior";

import {
  WorkerBeeAnimation,
  WorkerBeeLayer
} from "../../sprites/bee-worker/worker-bee";
import { BeeDirectives, PerformBeeDirectiveBehaviors } from "./bee-directives";

export type WorkerBeeProps = EntityProps &
  EnemyProps & {
    swarmRadius?: number;
  };

/**
 * "default" lets the normal aggro/patrol behavior tree drive the bee; "path"
 * hands control to scripted motion-path following (used by cutscenes).
 */
type WorkerBeeControlMode = "default" | "path";

@setAssetDependencies(() => ["workerBeeSprite"])
export class WorkerBee extends CoreEntity {
  static readonly type = "WorkerBee";
  public readonly type = WorkerBee.type;

  public alignment = EntityAlignment.Enemy;
  public readonly size = {
    width: 0.75,
    height: 0.94
  };

  public object3D = new Object3D();
  public sprite = getAsset("workerBeeSprite").getSprite<
    WorkerBeeLayer,
    WorkerBeeAnimation
  >();

  public dead = false;
  public facingRight = false;
  public behaviors = {
    motionCapabilities: new MotionCapabilitiesBehavior()
      .setJump(false)
      .setFly(true),
    physics: new CharacterPhysicsBehavior()
      .setGroup(enemyCollisionGroup)
      .setDensity(1)
      .setGravityScale(0.1),
    collision: new CollisionDamageBehavior(5, 5, 6),
    physicsControl:
      new CharacterGroundPhysicsControlBehaviorStandard().setSensorCollisionGroup(
        terrainSensorCollisionGroup
      ),
    pathFollowing: new NavPathFollowingBehavior().setRetries(1),
    motionPathFollowing: new MotionPathFollowingBehavior(),
    status: new StatusBehavior(),
    perception: new PerceptionBehavior({
      spreadAngle: Math.PI * 0.8,
      sightDistance: 5,
      nearbyDistance: 2,
      farDistance: 6,
      trackingTimeoutMs: 1000
    }),
    aggro: new EnemyAggroBehavior({
      aggroOnSight: false,
      loseAggroWithoutSight: true,
      aggroCooldown: 10000
    }),
    data: new CentralDataStoreBehavior(),
    animation: new AnimationControlBehavior<WorkerBeeAnimation>({
      idle: {
        tagName: "idle",
        priorityLevel: AnimationPriority.PHYSICS
      },
      walk: {
        tagName: "walk",
        priorityLevel: AnimationPriority.PHYSICS
      },
      flying: {
        tagName: "fly",
        priorityLevel: AnimationPriority.PHYSICS
      }
    }),
    ai: new AIBehavior<BeeDirectives>(),
    outOfBounds: new OutOfBoundsBehaviour(),
    scriptedControl: new ScriptedControlBehavior<WorkerBeeControlMode>()
  };

  /**********************
   *
   * AI Configuration
   *
   ***********************/

  private readonly deathAnimationData: APIAnimationData<WorkerBeeAnimation> = {
    tagName: "death",
    startFrame: 1,
    isLooping: false,
    priorityLevel: AnimationPriority.CRITICAL
  };

  private readonly stickDamage: number = 12;
  private readonly stickImpulse = new Vector2(12, 3);
  private readonly stickCooldown = 500;
  private readonly stickRange = 2;
  private readonly speed: number = 1;
  private readonly swarmRadius: number = 10;

  private readonly stickAttackAnimationData: APIAnimationData<WorkerBeeAnimation> =
    {
      tagName: "attack",
      startFrame: 1,
      isLooping: false,
      priorityLevel: AnimationPriority.ACTION
    };

  /**********************
   *
   * Constructor
   *
   ***********************/

  constructor(props: WorkerBeeProps) {
    super(props);

    this.stickDamage = !!props.attack ? props.attack : this.stickDamage;
    this.speed = !!props.speed ? props.speed : this.speed;
    this.swarmRadius = props.swarmRadius ? props.swarmRadius : this.swarmRadius;

    this.object3D.scale.multiplyScalar(kInvPixelScale);
    this.object3D.position
      .copy(this.position)
      .multiplyScalar(kPixelScale)
      .round()
      .multiplyScalar(kInvPixelScale);

    this.sprite.gotoAnimation("center");
    this.sprite.center();
    this.sprite.gotoAnimation("idle");
    this.sprite.mesh.scale.y *= -1;

    this.object3D.add(this.sprite.mesh);

    this.behaviors.motionCapabilities.init(this);
    this.behaviors.physics.init(this);
    this.behaviors.collision.init(this);
    this.behaviors.physicsControl
      .init(this)
      .assignMotionCapabilities(this.behaviors.motionCapabilities.capabilities)
      .attachControlEvents(this.behaviors.pathFollowing.controlEvents);
    this.behaviors.status.setMaxHealth(props.health ? props.health : 20);
    this.behaviors.status.init(this).attachProtosSprite(this.sprite);
    this.behaviors.perception
      .init(this)
      .setSourceBody(this.behaviors.physics.body);
    this.behaviors.aggro.init(this);

    this.behaviors.motionPathFollowing
      .init(this)
      .setTraversalSpeed(1)
      .setTraversalDuration(Number(props.traversalDuration ?? 0));
    this.behaviors.motionPathFollowing.events.on(
      MotionPathFollowingEvents.PositionUpdate,
      ([posUpdate]) => {
        this.behaviors.pathFollowing.setPathPlan({
          steps: [
            { x: this.position.x, y: this.position.y, action: NavAction.Fly },
            { x: posUpdate.x, y: posUpdate.y, action: NavAction.Fly }
          ]
        });
        this.behaviors.pathFollowing.pathPlanInProgress = true;
      }
    );
    this.behaviors.pathFollowing
      .init(this)
      .setMotionCapabilities(this.behaviors.motionCapabilities.capabilities)
      .setPhysicsControl(this.behaviors.physicsControl);
    this.behaviors.data.init(this);
    this.behaviors.animation.init(this).attachSprite(this.sprite);
    this.behaviors.outOfBounds.init(this);

    // Only motion-path following is toggled by scripted control here; the bee's
    // physics/nav control stay always-on (its default patrol drives them via
    // the behavior tree), so the "path" branch simply takes priority over
    // aggro/patrol when a cutscene sets it.
    this.behaviors.scriptedControl
      .init(this)
      .attachMotionPathFollowing(this.behaviors.motionPathFollowing)
      .registerMode("default", ControlProfile.SelfDriven, true)
      .registerMode("path", ControlProfile.MotionPath);

    this._setupBehaviorTree();
  }

  step(deltaMs: number): void {
    super.step(deltaMs);

    this.behaviors.perception.direction.x =
      this.behaviors.animation.facingDirection;
  }

  private _setupBehaviorTree(): void {
    // prettier-ignore
    this.behaviors.ai
    .init(this)
    .behaviorTree = new AIBehaviorTree(
      Selector(
        HandleDeath<WorkerBeeAnimation>(this.deathAnimationData, true),
        Sequence(
          VerifyControlMode("path"),
          StartMotionPathFollowing()
        ),
        PerformBeeDirectiveBehaviors(this.swarmRadius),
        Sequence(
          IsAggroed(),
          CancelMotionPathFollowing(),
          SetMotionCapabilities({ groundSpeed: 2 * this.speed, flightSpeed: 2 * this.speed * 0.75 }),
          Selector(
            Debounce(this.stickCooldown,
              Sequence(
                IsAggroedEntityInFront(Math.PI / 4, this.stickRange),
                CancelPathFollowing(),
                ScopeWithAnimation<WorkerBeeAnimation>(this.stickAttackAnimationData,
                  Sequence(
                    WaitForAnimationFrame(5),
                    SpawnHitArea({
                      shape: {
                        type: HitAreaShape.Circle,
                        radius: 0.8
                      },
                      sourceEntity: this,
                      offset: new Vector2(1, 0),
                      damage: this.stickDamage,
                      damageType: DamageType.Blunt,
                      hitImpulse: this.stickImpulse,
                      shouldCheckLineOfSight: true
                    }),
                    WaitForAnimationLoop()
                  )
                )
              )
            ),
            ChaseAggroedEntity()
          )
        ),
        Sequence(
          VerifyMotionPathProvider(),
          StartMotionPathFollowing(),
          SetMotionCapabilities({ groundSpeed: this.speed, flightSpeed: this.speed * 0.75 }),
        ),
        Sequence(
          GroundPatrol(0, 2, 7500)
        )
      )
    );
  }
}
