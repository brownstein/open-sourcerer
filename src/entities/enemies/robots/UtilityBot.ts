import { ProtoSpriteSheetThree } from "protosprite-three";
import { Object3D, Vector2 } from "three";

import { DamageType, EntityAlignment, EntityProps } from "src/api/entity";
import { EnemyProps } from "src/api/enemy";
import {
  enemyCollisionGroup,
  terrainSensorCollisionGroup
} from "src/engine/constants/collisionGroups";
import { kInvPixelScale, kPixelScale } from "src/engine/constants/scaling";
import { AIBehaviorTree } from "src/engine/entity/AIBehaviorTree";
import {
  Debounce,
  MemoSelector,
  Random,
  Selector,
  Sequence
} from "src/engine/entity/AICoreNodes";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import { addResourceLoader, getResource } from "src/engine/entity/decorators";
import { ProtoSpriteLoader } from "src/engine/loader/Loaders";
import { HitAreaShape } from "src/entities/shared/HitArea";
import { CancelPathFollowing } from "src/entities/shared/aiNodes/consumerNodes/AICancelPathFollowingNode";
import { IsPlayerInRange } from "src/entities/shared/aiNodes/consumerNodes/AIIsPlayerInRangeNode";
import { SetMotionCapabilities } from "src/entities/shared/aiNodes/consumerNodes/AISetMotionCapabilitiesNode";
import { SetPhysicsAnimations } from "src/entities/shared/aiNodes/consumerNodes/AISetPhysicsAnimationsNode";
import { SpawnHitArea } from "src/entities/shared/aiNodes/consumerNodes/AISpawnHitAreaNode";
import { WaitForAnimationFrame } from "src/entities/shared/aiNodes/consumerNodes/AIWaitForAnimationFrameNode";
import { WaitForAnimationLoop } from "src/entities/shared/aiNodes/consumerNodes/AIWaitForAnimationLoopNode";
import { ChasePlayer } from "src/entities/shared/aiNodes/consumerNodes/subtrees/AIChasePlayerNode";
import { GroundPatrol } from "src/entities/shared/aiNodes/consumerNodes/subtrees/AIGroundPatrolNode";
import { HandleDeath } from "src/entities/shared/aiNodes/consumerNodes/subtrees/AIHandleDeathNode";
import { IsAggroedWithPlayer } from "src/entities/shared/aiNodes/consumerNodes/subtrees/AIIsAggroedWithPlayerNode";
import { IsPlayerInFront } from "src/entities/shared/aiNodes/consumerNodes/subtrees/AIIsPlayerInFrontNode";
import { ScopeWithAnimation } from "src/entities/shared/aiNodes/decoratorNodes/AIScopeWithAnimationNode";
import { AIBehavior } from "src/entities/shared/behaviors/AIBehavior";
import {
  APIAnimationData,
  APIPhysicsAnimationData,
  AnimationControlBehavior,
  AnimationPriority
} from "src/entities/shared/behaviors/AnimationControlBehavior";
import { CentralDataStoreBehavior } from "src/entities/shared/behaviors/CentralDataStoreBehavior";
import { CharacterGroundPhysicsControlBehaviorStandard } from "src/entities/shared/behaviors/CharacterGroundPhysicsController";
import { CharacterPhysicsBehavior } from "src/entities/shared/behaviors/CharacterPhysics";
import { CollisionDamageBehavior } from "src/entities/shared/behaviors/CollisionDamageBehavior";
import { EnemyAggroBehavior } from "src/entities/shared/behaviors/EnemyAggroBehavior";
import { MotionCapabilitiesBehavior } from "src/entities/shared/behaviors/MotionCapabilities";
import { NavPathFollowingBehavior } from "src/entities/shared/behaviors/NavPathFollowingBehavior";
import { OutOfBoundsBehaviour } from "src/entities/shared/behaviors/OutOfBoundsBehaviour";
import { PerceptionBehavior } from "src/entities/shared/behaviors/Perception";
import { StatusBehavior } from "src/entities/shared/behaviors/StatusBehavior";

import {
  UtilityBotAnimation,
  UtilityBotLayer
} from "../sprites/utility-bot/utility-bot";
import utilityBotPrs from "../sprites/utility-bot/utility-bot.prs";

export type UtilityBotProps = EntityProps & EnemyProps;

@addResourceLoader(new ProtoSpriteLoader("utilityBotSheet", utilityBotPrs))
export class UtilityBot extends CoreEntity {
  static readonly type = "UtilityBot";
  public readonly type = UtilityBot.type;

  public readonly alignment = EntityAlignment.Enemy;
  public readonly size = {
    width: 0.89,
    height: 1.15
  };

  public object3D = new Object3D();
  public sprite = getResource<ProtoSpriteSheetThree>(
    UtilityBot,
    "utilityBotSheet"
  ).getSprite<UtilityBotLayer, UtilityBotAnimation>();

  /*
   * AI CONFIGURATION BELOW
   */

  private readonly startingGroundSpeed = 1.5;
  private readonly aggroGroundSpeedMultiplier = 1.67;
  private readonly walkAnimationData: APIPhysicsAnimationData<UtilityBotAnimation> =
    {
      tagName: "walk",
      flipFacing: true,
      priorityLevel: AnimationPriority.PHYSICS
    };

  private readonly deathAnimationData: APIAnimationData<UtilityBotAnimation> = {
    tagName: "death",
    flipFacing: true,
    isLooping: false,
    priorityLevel: AnimationPriority.CRITICAL
  };

  private readonly punchRange = 1.35;
  private readonly punchCooldown = 100;
  private readonly punchDamage: number = 5;
  private readonly punchImpulse = new Vector2(10, 0.5);
  private readonly attack1AnimationData: APIAnimationData<UtilityBotAnimation> =
    {
      tagName: "attack 1",
      flipFacing: true,
      isLooping: false,
      priorityLevel: AnimationPriority.ACTION
    };
  private readonly attack2AnimationData: APIAnimationData<UtilityBotAnimation> =
    {
      tagName: "attack 2",
      flipFacing: true,
      isLooping: false,
      priorityLevel: AnimationPriority.ACTION
    };

  public behaviors = {
    motionCapabilities: new MotionCapabilitiesBehavior()
      .setJump(false)
      .setSpeedLimits(this.startingGroundSpeed),
    physics: new CharacterPhysicsBehavior().setGroup(enemyCollisionGroup),
    collision: new CollisionDamageBehavior(1, 6),
    physicsControl:
      new CharacterGroundPhysicsControlBehaviorStandard().setSensorCollisionGroup(
        terrainSensorCollisionGroup
      ),
    pathFollowing: new NavPathFollowingBehavior().setRetries(1),
    status: new StatusBehavior(),
    perception: new PerceptionBehavior({
      spreadAngle: Math.PI / 4,
      sightDistance: 8,
      nearbyDistance: 0,
      farDistance: 0,
      trackingTimeoutMs: 3000
    }),
    aggro: new EnemyAggroBehavior({
      aggroOnSight: true,
      loseAggroWithoutSight: true,
      aggroCooldown: 2000
    }),
    data: new CentralDataStoreBehavior(),
    animation: new AnimationControlBehavior<UtilityBotAnimation>({
      idle: {
        tagName: "idle",
        speedScaler: 0.6,
        flipFacing: true,
        priorityLevel: AnimationPriority.PHYSICS
      },
      walk: {
        ...this.walkAnimationData
      }
    }),
    ai: new AIBehavior(),
    outOfBounds: new OutOfBoundsBehaviour()
  };

  constructor(props: UtilityBotProps) {
    super(props);
    this.punchDamage = props.attack ? props.attack : this.punchDamage;

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
    this.behaviors.status.setMaxHealth(props.health ?? 25);
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
    // prettier-ignore
    this.behaviors.ai
    .init(this)
    .behaviorTree = new AIBehaviorTree(
      Selector(
        HandleDeath<UtilityBotAnimation>(this.deathAnimationData),
        Sequence(
          IsAggroedWithPlayer(),
          SetMotionCapabilities({ groundSpeed: this.startingGroundSpeed * this.aggroGroundSpeedMultiplier }),
          SetPhysicsAnimations({
            walk: {
              ...this.walkAnimationData,
              speedScaler: this.aggroGroundSpeedMultiplier
            }
          }),
          Selector(
            Debounce(this.punchCooldown,
              Sequence(
                IsPlayerInRange(this.punchRange),
                IsPlayerInFront(Math.PI / 4),
                CancelPathFollowing(),
                MemoSelector(
                  Sequence(
                    Random(0.5),
                    ScopeWithAnimation<UtilityBotAnimation>(this.attack1AnimationData,
                      Sequence(
                        WaitForAnimationFrame(2),
                        SpawnHitArea({
                          shape: {
                            type: HitAreaShape.Circle,
                            radius: 0.3
                          },
                          sourceEntity: this,
                          offset: new Vector2(1, 0.25),
                          damage: this.punchDamage,
                          damageType: DamageType.Force,
                          hitImpulse: this.punchImpulse,
                          shouldCheckLineOfSight: true
                        }),
                        WaitForAnimationLoop()
                      )
                    )
                  ),
                  ScopeWithAnimation<UtilityBotAnimation>(this.attack2AnimationData,
                    Sequence(
                      WaitForAnimationFrame(3),
                      SpawnHitArea({
                        shape: {
                          type: HitAreaShape.Circle,
                          radius: 0.3
                        },
                        sourceEntity: this,
                        offset: new Vector2(1, 0.25),
                        damage: this.punchDamage,
                        damageType: DamageType.Force,
                        hitImpulse: this.punchImpulse,
                        shouldCheckLineOfSight: true
                      }),
                      WaitForAnimationLoop()
                    )
                  )
                )
              )
            ),
            ChasePlayer()
          )
        ),
        Sequence(
          SetMotionCapabilities({ groundSpeed: this.startingGroundSpeed }),
          SetPhysicsAnimations({
            walk: {
              ...this.walkAnimationData,
              speedScaler: 1.0
            }
          }),
          GroundPatrol(1, 5, 3000)
        )
      )
    );
  }
}
