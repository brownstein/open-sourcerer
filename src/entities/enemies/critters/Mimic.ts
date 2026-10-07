import { ProtoSpriteSheetThree } from "protosprite-three";
import { Color, Object3D, Vector2 } from "three";

import { DamageType, EntityAlignment, EntityProps } from "src/api/entity";
import { EnemyProps } from "src/api/enemy";
import {
  enemyCollisionGroup,
  inactiveEnemyCollisionGroup,
  terrainSensorCollisionGroup
} from "src/engine/constants/collisionGroups";
import { kInvPixelScale, kPixelScale } from "src/engine/constants/scaling";
import { AIBehaviorTree } from "src/engine/entity/AIBehaviorTree";
import {
  Debounce,
  Inverter,
  ParallelSelector,
  Selector,
  Sequence,
  Succeeder,
  Wait,
  WaitUntilSuccess
} from "src/engine/entity/AICoreNodes";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import { addResourceLoader, getResource } from "src/engine/entity/decorators";
import { ProtoSpriteLoader } from "src/engine/loader/Loaders";
import {
  InteractionBehavior,
  InteractionProviderEvents
} from "src/entities/environment/behaviors/InteractionBehavior";
import { HitAreaShape } from "src/entities/shared/HitArea";
import { CancelPathFollowing } from "src/entities/shared/aiNodes/consumerNodes/AICancelPathFollowingNode";
import { DisableInteractions } from "src/entities/shared/aiNodes/consumerNodes/AIDisableInteractionsNode";
import { EnableInteractions } from "src/entities/shared/aiNodes/consumerNodes/AIEnableInteractionsNode";
import { HasBeenHit } from "src/entities/shared/aiNodes/consumerNodes/AIHasBeenHitNode";
import { HasBeenInteractedWith } from "src/entities/shared/aiNodes/consumerNodes/AIHasBeenInteractedWithNode";
import { IsPlayerInRange } from "src/entities/shared/aiNodes/consumerNodes/AIIsPlayerInRangeNode";
import { SetCharacterCollisionGroup } from "src/entities/shared/aiNodes/consumerNodes/AISetCharacterCollisionGroupNode";
import { SetMotionCapabilities } from "src/entities/shared/aiNodes/consumerNodes/AISetMotionCapabilitiesNode";
import { SetPhysicsAnimations } from "src/entities/shared/aiNodes/consumerNodes/AISetPhysicsAnimationsNode";
import { SpawnHitArea } from "src/entities/shared/aiNodes/consumerNodes/AISpawnHitAreaNode";
import { SwapAIBehavior } from "src/entities/shared/aiNodes/consumerNodes/AISwapAIBehaviorNode";
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

import { MimicAnimation, MimicLayer } from "../sprites/mimic/mimic";
import mimicPrs from "../sprites/mimic/mimic.prs";

export type MimicProps = EntityProps & EnemyProps;

@addResourceLoader(new ProtoSpriteLoader("mimicSheet", mimicPrs))
export class Mimic extends CoreEntity {
  static readonly type = "Mimic";
  public readonly type = Mimic.type;

  public readonly alignment = EntityAlignment.Enemy;
  public readonly size = {
    width: 1.3,
    height: 0.72
  };

  public object3D = new Object3D();
  public sprite = getResource<ProtoSpriteSheetThree>(
    Mimic,
    "mimicSheet"
  ).getSprite<MimicLayer, MimicAnimation>();

  public behaviors = {
    interaction: new InteractionBehavior(),
    motionCapabilities: new MotionCapabilitiesBehavior()
      .setJump(false)
      .setSpeedLimits(0, 0),
    physics: new CharacterPhysicsBehavior().setGroup(
      inactiveEnemyCollisionGroup
    ),
    collision: new CollisionDamageBehavior(5, 5, 5),
    physicsControl:
      new CharacterGroundPhysicsControlBehaviorStandard().setSensorCollisionGroup(
        terrainSensorCollisionGroup
      ),
    pathFollowing: new NavPathFollowingBehavior().setRetries(1),
    status: new StatusBehavior().setMaxHealth(50),
    perception: new PerceptionBehavior({
      spreadAngle: Math.PI / 4,
      sightDistance: 8,
      nearbyDistance: 0,
      farDistance: 0,
      trackingTimeoutMs: 5000
    }),
    aggro: new EnemyAggroBehavior({
      aggroOnSight: true,
      loseAggroWithoutSight: true,
      aggroCooldown: 2000
    }),
    data: new CentralDataStoreBehavior(),
    animation: new AnimationControlBehavior<MimicAnimation>({
      idle: {
        tagName: "idle",
        flipFacing: true,
        priorityLevel: AnimationPriority.PHYSICS
      }
    }),
    ai: new AIBehavior(),
    outOfBounds: new OutOfBoundsBehaviour()
  };

  /*
   * AI CONFIGURATION BELOW
   */

  private readonly deathAnimationData: APIAnimationData<MimicAnimation> = {
    tagName: "attack",
    isLooping: false,
    priorityLevel: AnimationPriority.CRITICAL
  };

  private readonly attackRange = 1.5;
  private readonly attackCooldown = 1000;
  private attackDamage = 10;
  private readonly attackImpulse = new Vector2(2, 5);

  private readonly transformedWalkingSpeed = 3;
  private readonly transformedRunningSpeed = 6.5;

  private readonly untransformTimerMs = 10000;

  private readonly attackAnimationData: APIAnimationData<MimicAnimation> = {
    tagName: "attack",
    isLooping: false,
    flipFacing: true,
    priorityLevel: AnimationPriority.ACTION
  };

  private readonly staticChestAnimationData: APIAnimationData<MimicAnimation> =
    {
      tagName: "transfromation_to_mimic",
      startFrame: 0,
      endFrame: 0,
      isLooping: false,
      flipFacing: true,
      priorityLevel: AnimationPriority.ACTION
    };

  private readonly transformAnimationData: APIAnimationData<MimicAnimation> = {
    tagName: "transfromation_to_mimic",
    startFrame: 1,
    isLooping: false,
    flipFacing: true,
    priorityLevel: AnimationPriority.REACTION
  };

  private readonly untransformAnimationData: APIAnimationData<MimicAnimation> =
    {
      tagName: "transfromation_to_chess",
      isLooping: false,
      flipFacing: true,
      priorityLevel: AnimationPriority.ACTION
    };

  private readonly walkAnimationData: APIPhysicsAnimationData<MimicAnimation> =
    {
      tagName: "walk",
      flipFacing: true,
      priorityLevel: AnimationPriority.PHYSICS
    };

  private readonly runAnimationData: APIPhysicsAnimationData<MimicAnimation> = {
    tagName: "Run",
    flipFacing: true,
    priorityLevel: AnimationPriority.PHYSICS
  };

  constructor(props: MimicProps) {
    super(props);
    this.attackDamage = props.attack ?? this.attackDamage;

    this.object3D.scale.multiplyScalar(kInvPixelScale);
    this.object3D.position
      .copy(this.position)
      .multiplyScalar(kPixelScale)
      .round()
      .multiplyScalar(kInvPixelScale);

    this.sprite.center();
    this.sprite.mesh.scale.y *= -1;

    this.object3D.add(this.sprite.mesh);

    this.behaviors.interaction.init(this);
    this.behaviors.motionCapabilities.init(this);
    this.behaviors.physics.init(this);
    this.behaviors.collision.init(this);
    this.behaviors.physicsControl
      .init(this)
      .assignMotionCapabilities(this.behaviors.motionCapabilities.capabilities)
      .attachControlEvents(this.behaviors.pathFollowing.controlEvents);
    this.behaviors.status.setMaxHealth(props.health ?? 50);
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

    this.behaviors.interaction.events.on(
      InteractionProviderEvents.SetFocused,
      (focused) => {
        focused
          ? this.sprite.outlineAllLayers(1, new Color(0x44aaff), 1)
          : this.sprite.outlineAllLayers(0, new Color(0xffffff), 0);
      }
    );

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
    let transformedBehavior!: AIBehaviorTree;

    // prettier-ignore
    const untransformedBehavior = new AIBehaviorTree(
      Sequence(
        ScopeWithAnimation(this.staticChestAnimationData,
          WaitUntilSuccess(
            Selector(
              HasBeenInteractedWith(),
              HasBeenHit()
            )
          )
        ),
        Sequence(
          ScopeWithAnimation(this.transformAnimationData,
            WaitForAnimationLoop()
          ),
          SetCharacterCollisionGroup(enemyCollisionGroup),
          DisableInteractions(),
          SwapAIBehavior(() => transformedBehavior)
        )
      )
    );

    // prettier-ignore
    transformedBehavior = new AIBehaviorTree(
      Selector(
        Sequence(
          HandleDeath(this.deathAnimationData)
        ),
        Sequence(
          IsAggroedWithPlayer(),
          SetMotionCapabilities({
            groundSpeed: this.transformedRunningSpeed
          }),
          SetPhysicsAnimations({
            walk: this.runAnimationData
          }),
          Selector(
            Debounce(this.attackCooldown,
              Sequence(
                IsPlayerInRange(this.attackRange),
                IsPlayerInFront(Math.PI / 4),
                CancelPathFollowing(),
                ScopeWithAnimation(this.attackAnimationData,
                  Sequence(
                    WaitForAnimationFrame(5),
                    SpawnHitArea({
                      shape: {
                        type: HitAreaShape.Circle,
                        radius: 0.5
                      },
                      sourceEntity: this,
                      offset: new Vector2(1, 0),
                      damage: this.attackDamage,
                      damageType: DamageType.Force,
                      hitImpulse: this.attackImpulse,
                      shouldCheckLineOfSight: true
                    }),
                    WaitForAnimationLoop()
                  )
                )
              )
            ),
            ChasePlayer()
          )
        ),
        Sequence(
          SetMotionCapabilities({
            groundSpeed: this.transformedWalkingSpeed
          }),
          SetPhysicsAnimations({
            walk: this.walkAnimationData
          }),
          ParallelSelector(
            WaitUntilSuccess(
              Inverter(
                Succeeder(
                  GroundPatrol(1, 4, 2000)
                )
              )
            ),
            Wait(this.untransformTimerMs)
          ),
          Sequence(
            ScopeWithAnimation(this.untransformAnimationData,
              WaitForAnimationLoop()
            ),
            SetCharacterCollisionGroup(inactiveEnemyCollisionGroup),
            EnableInteractions(),
            SwapAIBehavior(() => untransformedBehavior)
          )
        )
      )
    );

    this.behaviors.ai.init(this).behaviorTree = untransformedBehavior;
  }
}
