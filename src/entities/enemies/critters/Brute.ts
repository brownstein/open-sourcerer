import { ProtoSpriteSheetThree } from "protosprite-three";
import { Object3D, Vector2 } from "three";

import { AINodeData, AINodeOutput, AIResult } from "src/api/ai";
import { EnemyProps } from "src/api/enemy";
import { DamageType, EntityAlignment, EntityProps } from "src/api/entity";
import {
  enemyCollisionGroup,
  terrainSensorCollisionGroup
} from "src/engine/constants/collisionGroups";
import { kInvPixelScale, kPixelScale } from "src/engine/constants/scaling";
import { AIBehaviorTree, AINode } from "src/engine/entity/AIBehaviorTree";
import {
  Debounce,
  Execute,
  Inverter,
  MemoSelector,
  ParallelSequence,
  Selector,
  Sequence,
  Verify,
  Wait,
  WaitUntilSuccess
} from "src/engine/entity/AICoreNodes";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import { addResourceLoader, getResource } from "src/engine/entity/decorators";
import { ProtoSpriteLoader } from "src/engine/loader/Loaders";
import { HitAreaShape } from "src/entities/shared/HitArea";
import { CancelPathFollowing } from "src/entities/shared/aiNodes/consumerNodes/AICancelPathFollowingNode";
import { IsGroundedWithinMs } from "src/entities/shared/aiNodes/consumerNodes/AIIsGroundedWithinMsNode";
import { IsPlayerInRange } from "src/entities/shared/aiNodes/consumerNodes/AIIsPlayerInRangeNode";
import { SpawnHitArea } from "src/entities/shared/aiNodes/consumerNodes/AISpawnHitAreaNode";
import { WaitForAnimationFrame } from "src/entities/shared/aiNodes/consumerNodes/AIWaitForAnimationFrameNode";
import { WaitForAnimationLoop } from "src/entities/shared/aiNodes/consumerNodes/AIWaitForAnimationLoopNode";
import { ChasePlayer } from "src/entities/shared/aiNodes/consumerNodes/subtrees/AIChasePlayerNode";
import { GroundPatrol } from "src/entities/shared/aiNodes/consumerNodes/subtrees/AIGroundPatrolNode";
import { HandleDeath } from "src/entities/shared/aiNodes/consumerNodes/subtrees/AIHandleDeathNode";
import { IsAggroedWithPlayer } from "src/entities/shared/aiNodes/consumerNodes/subtrees/AIIsAggroedWithPlayerNode";
import { IsPlayerInFront } from "src/entities/shared/aiNodes/consumerNodes/subtrees/AIIsPlayerInFrontNode";
import { PerformJump } from "src/entities/shared/aiNodes/consumerNodes/subtrees/AIPerformJumpNode";
import { ScopeWithAnimation } from "src/entities/shared/aiNodes/decoratorNodes/AIScopeWithAnimationNode";
import { GetUnobstructedJumpVelocityToPosition } from "src/entities/shared/aiNodes/producerNodes/subtrees/AIGetUnobstructedJumpVelocityToPositionNode";
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
import { HitStunBehavior } from "src/entities/shared/behaviors/HitStunBehavior";
import { MotionCapabilitiesBehavior } from "src/entities/shared/behaviors/MotionCapabilities";
import { NavPathFollowingBehavior } from "src/entities/shared/behaviors/NavPathFollowingBehavior";
import { OutOfBoundsBehaviour } from "src/entities/shared/behaviors/OutOfBoundsBehaviour";
import { PerceptionBehavior } from "src/entities/shared/behaviors/Perception";
import { StatusBehavior } from "src/entities/shared/behaviors/StatusBehavior";
import { toRadians } from "src/util/mathUtils";

import { BruteAnimation, BruteLayer } from "../sprites/brute/brute";
import brutePrs from "../sprites/brute/brute.prs";

export type BruteProps = EntityProps & EnemyProps;

@addResourceLoader(new ProtoSpriteLoader("bruteSheet", brutePrs))
export class Brute extends CoreEntity {
  static readonly type = "Brute";
  public readonly type = Brute.type;

  public readonly alignment = EntityAlignment.Enemy;
  public readonly size = {
    width: 1.75,
    height: 2.81
  };

  public object3D = new Object3D();
  public sprite = getResource<ProtoSpriteSheetThree>(
    Brute,
    "bruteSheet"
  ).getSprite<BruteLayer, BruteAnimation>();

  public behaviors = {
    motionCapabilities: new MotionCapabilitiesBehavior()
      .setJump(false)
      .setSpeedLimits(1),
    physics: new CharacterPhysicsBehavior()
      .setGroup(enemyCollisionGroup)
      .setDensity(1),
    collision: new CollisionDamageBehavior(5, 10, 6),
    physicsControl:
      new CharacterGroundPhysicsControlBehaviorStandard().setSensorCollisionGroup(
        terrainSensorCollisionGroup
      ),
    pathFollowing: new NavPathFollowingBehavior().setRetries(1),
    status: new StatusBehavior(),
    perception: new PerceptionBehavior({
      spreadAngle: Math.PI / 2,
      sightDistance: 15,
      nearbyDistance: 0,
      farDistance: 0,
      trackingTimeoutMs: 5000
    }),
    aggro: new EnemyAggroBehavior({
      aggroOnSight: true,
      loseAggroWithoutSight: true,
      aggroCooldown: 5000
    }),
    data: new CentralDataStoreBehavior(),
    animation: new AnimationControlBehavior<BruteAnimation>({
      idle: {
        tagName: "loop",
        priorityLevel: AnimationPriority.PHYSICS
      },
      walk: {
        tagName: "walk",
        priorityLevel: AnimationPriority.PHYSICS
      }
    }),
    ai: new AIBehavior(),
    outOfBounds: new OutOfBoundsBehaviour(),
    hitStun: new HitStunBehavior<BruteAnimation>({
      stunTimeMs: 1000,
      dazeDamageThreshold: 0,
      dazeNumSuccessiveHitsThreshold: 5,
      dazeSuccessiveHitsIntervalMs: 2500,
      dazeTimeMs: 2000,
      dazeCooldownMs: 10000,
      stunAnimation: {
        tagName: "death",
        startFrame: 10,
        endFrame: 10
      },
      dazeAnimation: {
        tagName: "death",
        startFrame: 20,
        endFrame: 25
      }
    })
  };

  /*
   * AI CONFIGURATION BELOW
   */

  private readonly deathAnimationData: APIAnimationData<BruteAnimation> = {
    tagName: "death",
    startFrame: 1,
    isLooping: false,
    priorityLevel: AnimationPriority.CRITICAL
  };

  private readonly biteRange = 2.5;
  private readonly biteCooldown = 1000;
  private readonly biteDamage: number = 7.5;
  private readonly biteImpulse = new Vector2(2, 5);
  private readonly biteAnimationData: APIAnimationData<BruteAnimation> = {
    tagName: "bite",
    startFrame: 1,
    isLooping: false,
    priorityLevel: AnimationPriority.ACTION
  };

  private readonly slamMinimumRange = 7.5;
  private readonly slamMaximumRange = 15;
  private readonly slamCooldown = 3500;
  private readonly slamSelfStunTime = 1000;
  private readonly slamDamage: number = 20;
  private readonly slamImpulse = new Vector2(0, 8);
  private readonly slamAnticipationTimeMs = 500;
  private readonly slamTimeMsInActualAttackWindup = 160;
  private readonly slamVerticalOffsetFromPlayerToAimFor = new Vector2(0, 1);
  private readonly slamMinJumpAngle = toRadians(45);
  private readonly slamMaxJumpAngle = toRadians(80);
  private readonly slamShouldPreferHigherAngles = true;
  private readonly slamAnticipationAnimationData: APIAnimationData<BruteAnimation> =
    {
      tagName: "attack",
      startFrame: 1,
      endFrame: 1,
      isLooping: false,
      priorityLevel: AnimationPriority.ACTION
    };
  private readonly slamStartJumpAnimationData: APIAnimationData<BruteAnimation> =
    {
      tagName: "attack",
      startFrame: 1,
      endFrame: 1,
      isLooping: false,
      priorityLevel: AnimationPriority.ACTION
    };
  private readonly slamStartMidAirAnimationData: APIAnimationData<BruteAnimation> =
    {
      tagName: "attack",
      startFrame: 1,
      endFrame: 1,
      isLooping: false,
      priorityLevel: AnimationPriority.ACTION
    };
  private readonly slamMidAirLoopAnimationData: APIAnimationData<BruteAnimation> =
    {
      tagName: "attack",
      startFrame: 1,
      endFrame: 1,
      isLooping: true,
      priorityLevel: AnimationPriority.ACTION
    };
  private readonly slamActualAttackAnimationData: APIAnimationData<BruteAnimation> =
    {
      tagName: "attack",
      startFrame: 2,
      isLooping: false,
      priorityLevel: AnimationPriority.ACTION
    };

  constructor(props: BruteProps) {
    super(props);
    this.slamDamage = props.attack ? props.attack : this.slamDamage;
    this.biteDamage = this.slamDamage * 0.375;

    this.object3D.scale.multiplyScalar(kInvPixelScale);
    this.object3D.position
      .copy(this.position)
      .multiplyScalar(kPixelScale)
      .round()
      .multiplyScalar(kInvPixelScale);

    this.sprite.center();
    this.sprite.mesh.scale.y *= -1;

    this.object3D.add(this.sprite.mesh);

    this.behaviors.motionCapabilities.init(this);
    this.behaviors.physics.init(this);
    this.behaviors.collision.init(this);
    this.behaviors.physicsControl
      .init(this)
      .assignMotionCapabilities(this.behaviors.motionCapabilities.capabilities)
      .attachControlEvents(this.behaviors.pathFollowing.controlEvents);
    this.behaviors.status.setMaxHealth(props.health ?? 100);
    this.behaviors.status.init(this).attachProtosSprite(this.sprite);
    this.behaviors.perception
      .init(this)
      .setSourceBody(this.behaviors.physics.body);
    this.behaviors.aggro.init(this);
    this.behaviors.pathFollowing
      .init(this)
      .setMotionCapabilities(this.behaviors.motionCapabilities.capabilities)
      .setPhysicsControl(this.behaviors.physicsControl);
    this.behaviors.data.init(this);
    this.behaviors.animation.init(this).attachSprite(this.sprite);
    this.behaviors.outOfBounds.init(this);
    this.behaviors.hitStun.init(this);

    this._setupBehaviorTree();
  }

  step(deltaMs: number): void {
    super.step(deltaMs);

    this.behaviors.perception.direction.x =
      this.behaviors.animation.facingDirection;
  }

  destroy(): void {
    super.destroy();
    this.sprite.dispose();
  }

  private _setupBehaviorTree(): void {
    const slamUnobstructedJumpVelocity =
      AINode.CreateSharedVariable<Vector2 | null>();
    const playerPositionWithVerticalOffset = new Vector2();

    // prettier-ignore
    this.behaviors.ai
    .init(this)
    .behaviorTree = new AIBehaviorTree(
      Selector(
        HandleDeath<BruteAnimation>(this.deathAnimationData),
        Sequence(
          IsAggroedWithPlayer(),
          Selector(
            MemoSelector(
              Debounce(this.biteCooldown,
                Sequence(
                  IsPlayerInRange(this.biteRange),
                  IsPlayerInFront(Math.PI / 4),
                  CancelPathFollowing(),
                  ScopeWithAnimation<BruteAnimation>(this.biteAnimationData,
                    Sequence(
                      WaitForAnimationFrame(4),
                      SpawnHitArea({
                        shape: {
                          type: HitAreaShape.Circle,
                          radius: 1
                        },
                        sourceEntity: this,
                        offset: new Vector2(1, 0),
                        damage: this.biteDamage,
                        damageType: DamageType.Force,
                        hitImpulse: this.biteImpulse,
                        shouldCheckLineOfSight: true
                      }),
                      WaitForAnimationLoop()
                    )
                  )
                )
              ),
              Debounce(this.slamCooldown,
                Sequence(
                  Inverter(
                    IsPlayerInRange(this.slamMinimumRange)
                  ),
                  IsPlayerInRange(this.slamMaximumRange),
                  Sequence(
                    Execute((data: AINodeData) => {
                      if (!data.player) return AIResult.Failed;

                      playerPositionWithVerticalOffset
                        .set(data.player.position.x, data.player.position.y)
                        .add(this.slamVerticalOffsetFromPlayerToAimFor)

                      return AIResult.Succeeded;
                    }),
                    GetUnobstructedJumpVelocityToPosition(
                      slamUnobstructedJumpVelocity,
                      () => playerPositionWithVerticalOffset,
                      undefined,
                      this.slamMinJumpAngle,
                      this.slamMaxJumpAngle,
                      this.slamShouldPreferHigherAngles
                    ),
                    Verify(() => slamUnobstructedJumpVelocity.value !== null),
                    CancelPathFollowing(),
                    ScopeWithAnimation(this.slamAnticipationAnimationData,
                      Wait(this.slamAnticipationTimeMs)
                    ),
                    ScopeWithAnimation(this.slamStartJumpAnimationData,
                      WaitForAnimationLoop()
                    ),
                    ParallelSequence(
                      PerformJump(
                        slamUnobstructedJumpVelocity as AINodeOutput<Vector2>,
                        () => playerPositionWithVerticalOffset,
                        true
                      ),
                      Sequence(
                        ScopeWithAnimation(this.slamStartMidAirAnimationData,
                          WaitForAnimationLoop()
                        ),
                        ScopeWithAnimation(this.slamMidAirLoopAnimationData,
                          WaitUntilSuccess(
                            IsGroundedWithinMs(this.slamTimeMsInActualAttackWindup)
                          )
                        )
                      )
                    ),
                    ScopeWithAnimation(this.slamActualAttackAnimationData,
                      Sequence(
                        WaitForAnimationFrame(4),
                        SpawnHitArea({
                          shape: {
                            type: HitAreaShape.Rectangle,
                            size: { x: 5, y: 1 },
                          },
                          sourceEntity: this,
                          offset: new Vector2(0.5, -1),
                          damage: this.slamDamage,
                          damageType: DamageType.Force,
                          hitImpulse: this.slamImpulse,
                          shouldCheckLineOfSight: true
                        }),
                        WaitForAnimationLoop(),
                        Wait(this.slamSelfStunTime)
                      )
                    )
                  )
                )
              )
            ),
            ChasePlayer()
          )
        ),
        GroundPatrol(0, 2, 7500)
      )
    );
  }
}
