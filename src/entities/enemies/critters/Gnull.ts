import { Object3D, Vector2 } from "three";

import {
  DamageType,
  EntityAlignment,
  EntityLifecycleEvents,
  EntityProps
} from "src/api/entity";
import { EnemyProps } from "src/api/enemy";
import { SoundType } from "src/api/sound";
import { enemyCollisionGroup } from "src/engine/constants/collisionGroups";
import { kInvPixelScale, kPixelScale } from "src/engine/constants/scaling";
import { AIBehaviorTree } from "src/engine/entity/AIBehaviorTree";
import {
  Debounce,
  RandomSequence,
  Selector,
  Sequence,
  Wait
} from "src/engine/entity/AICoreNodes";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import { getAsset, setAssetDependencies } from "src/engine/entity/decorators";
import { PositionalSound } from "src/engine/sound/Sound";
import {
  CallbackTrigger,
  CallbackTriggerManager
} from "src/engine/util/trigger";
import { HitAreaShape } from "src/entities/shared/HitArea";
import { CancelPathFollowing } from "src/entities/shared/aiNodes/consumerNodes/AICancelPathFollowingNode";
import { HasBeenHit } from "src/entities/shared/aiNodes/consumerNodes/AIHasBeenHitNode";
import { IsAggroed } from "src/entities/shared/aiNodes/consumerNodes/AIIsAggroedNode";
import { SpawnHitArea } from "src/entities/shared/aiNodes/consumerNodes/AISpawnHitAreaNode";
import { WaitForAnimationFrame } from "src/entities/shared/aiNodes/consumerNodes/AIWaitForAnimationFrameNode";
import { WaitForAnimationLoop } from "src/entities/shared/aiNodes/consumerNodes/AIWaitForAnimationLoopNode";
import { AttackChaseAggroedEntity } from "src/entities/shared/aiNodes/consumerNodes/subtrees/AIAttackChaseAggroedEntityNode";
import { ChaseAggroedEntity } from "src/entities/shared/aiNodes/consumerNodes/subtrees/AIChaseAggroedEntityNode";
import { GroundPatrol } from "src/entities/shared/aiNodes/consumerNodes/subtrees/AIGroundPatrolNode";
import { HandleDeath } from "src/entities/shared/aiNodes/consumerNodes/subtrees/AIHandleDeathNode";
import { ScopeWithAnimation } from "src/entities/shared/aiNodes/decoratorNodes/AIScopeWithAnimationNode";
import { AIBehavior } from "src/entities/shared/behaviors/AIBehavior";
import {
  AnimationControlBehavior,
  AnimationPriority
} from "src/entities/shared/behaviors/AnimationControlBehavior";
import { CallbackTriggerManagerBehavior } from "src/entities/shared/behaviors/CallbackTriggerManagerBehavior";
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

import { GnullAnimation, GnullLayer } from "../sprites/gnull/gnull";

export type GnullProps = EntityProps & EnemyProps & {
  shouldHomePatrol?: boolean;
};

@setAssetDependencies(() => [
  "gnullSprite",
  "hitEnemy1Sound",
  "hitEnemy2Sound",
  "hitEnemy3Sound",
  "hitEnemy4Sound"
])
export class Gnull extends CoreEntity {
  static readonly type = "Gnull";
  public readonly type = Gnull.type;

  public readonly alignment = EntityAlignment.Enemy;
  public readonly size = {
    width: 1.16,
    height: 1.75
  };

  public object3D = new Object3D();
  public sprite = getAsset("gnullSprite").getSprite<
    GnullLayer,
    GnullAnimation
  >();

  public behaviors = {
    motionCapabilities: new MotionCapabilitiesBehavior()
      .setJump(true, undefined, 4.5)
      .setSpeedLimits(5, 2)
      .setAttacks([
        {
          id: "melee",
          range: 1.5,
          verticalRange: 1.5
        }
      ]),
    physics: new CharacterPhysicsBehavior().setGroup(enemyCollisionGroup),
    collision: new CollisionDamageBehavior(2.5, 7, 10),
    physicsControl: new CharacterGroundPhysicsControlBehaviorStandard(),
    pathFollowing: new NavPathFollowingBehavior().setRetries(1),
    status: new StatusBehavior().setMaxHealth(25),
    perception: new PerceptionBehavior({
      spreadAngle: Math.PI / 4,
      sightDistance: 4,
      nearbyDistance: 0,
      farDistance: 0,
      trackingTimeoutMs: 1500
    }),
    aggro: new EnemyAggroBehavior({
      aggroOnSight: true,
      loseAggroWithoutSight: true,
      aggroCooldown: 1000
    }),
    data: new CentralDataStoreBehavior(),
    animation: new AnimationControlBehavior<GnullAnimation>({
      idle: {
        tagName: "Idle",
        speedScaler: 0.7,
        priorityLevel: AnimationPriority.PHYSICS
      },
      walk: {
        tagName: "Run_5_heavy",
        priorityLevel: AnimationPriority.PHYSICS
      },
      climbing: {
        tagName: "climb_2",
        priorityLevel: AnimationPriority.PHYSICS
      },
      preJump: {
        tagName: "jump",
        startFrame: 4,
        endFrame: 8,
        isLooping: false,
        priorityLevel: AnimationPriority.PHYSICS
      },
      jumpRising: {
        tagName: "jump",
        startFrame: 9,
        endFrame: 10,
        isLooping: false,
        priorityLevel: AnimationPriority.PHYSICS
      },
      jumpFalling: {
        tagName: "jump",
        startFrame: 11,
        endFrame: 16,
        isLooping: false,
        priorityLevel: AnimationPriority.PHYSICS
      },
      postJump: {
        tagName: "jump",
        startFrame: 17,
        isLooping: false,
        priorityLevel: AnimationPriority.PHYSICS
      }
    }),
    ai: new AIBehavior(),
    callbackTrigger: new CallbackTriggerManagerBehavior(),
    outOfBounds: new OutOfBoundsBehaviour()
  };

  attackDamage = 4;
  private readonly shouldHomePatrol: boolean;

  /*
   * SFX
   */

  private readonly hitSound = new PositionalSound(
    SoundType.SFX,
    this.object3D,
    getAsset("hitEnemy1Sound"),
    getAsset("hitEnemy2Sound"),
    getAsset("hitEnemy3Sound"),
    getAsset("hitEnemy4Sound")
  )
    .setPitchVariation(400)
    .setVolume(0.6);

  constructor(props: GnullProps) {
    super(props);

    this.object3D.scale.multiplyScalar(kInvPixelScale);
    this.object3D.position
      .copy(this.position)
      .multiplyScalar(kPixelScale)
      .round()
      .multiplyScalar(kInvPixelScale);

    this.sprite.center();
    this.sprite.mesh.scale.y *= -1;

    this.object3D.add(this.sprite.mesh);

    this.attackDamage = props.attack ? props.attack : this.attackDamage;
    this.shouldHomePatrol = props.shouldHomePatrol ?? false;

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
    this.behaviors.pathFollowing.jumpDelay = 400;
    this.behaviors.data.init(this);
    this.behaviors.animation.init(this).attachSprite(this.sprite);

    this.behaviors.callbackTrigger.init(this).attachPreset("hitSound", {
      hitSound: this.hitSound
    });
    this.behaviors.outOfBounds.init(this);

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
        HandleDeath<GnullAnimation>({
          tagName: "death_2",
          startFrame: 1,
          isLooping: false,
          priorityLevel: AnimationPriority.CRITICAL
        }),
        // Hit interrupt — preempts running children when hit
        Sequence(
          HasBeenHit(),
          CancelPathFollowing(),
          Wait(500)
        ),
        // Main aggro behavior
        Sequence(
          IsAggroed(),
          Selector(
            // Attack when cooldown ready
            Debounce(3500,
              Sequence(
                AttackChaseAggroedEntity(),
                Wait(300),
                CancelPathFollowing(),
                RandomSequence(
                  ScopeWithAnimation<GnullAnimation>({ tagName: "attack", startFrame: 1, endFrame: 7, isLooping: false, priorityLevel: AnimationPriority.ACTION },
                    Sequence(
                      WaitForAnimationFrame(4),
                      SpawnHitArea({
                        shape: {
                          type: HitAreaShape.Circle,
                          radius: 0.5
                        },
                        sourceEntity: this,
                        offset: new Vector2(1),
                        damage: this.attackDamage,
                        hitImpulse: new Vector2(0, 5),
                        damageType: DamageType.Slash,
                        shouldCheckLineOfSight: true
                      }),
                      WaitForAnimationLoop(),
                      Wait(200)
                    )
                  ),
                  ScopeWithAnimation<GnullAnimation>({ tagName: "attack", startFrame: 8, endFrame: 11, isLooping: false, priorityLevel: AnimationPriority.ACTION },
                    Sequence(
                      SpawnHitArea({
                        shape: {
                          type: HitAreaShape.Circle,
                          radius: 0.5
                        },
                        sourceEntity: this,
                        offset: new Vector2(1),
                        damage: this.attackDamage,
                        hitImpulse: new Vector2(0, 5),
                        damageType: DamageType.Slash,
                        shouldCheckLineOfSight: true
                      }),
                      WaitForAnimationLoop(),
                      Wait(200)
                    )
                  ),
                  ScopeWithAnimation<GnullAnimation>({ tagName: "bite", startFrame: 1, isLooping: false, priorityLevel: AnimationPriority.ACTION },
                    Sequence(
                      WaitForAnimationFrame(3),
                      SpawnHitArea({
                        shape: {
                          type: HitAreaShape.Circle,
                          radius: 0.5
                        },
                        sourceEntity: this,
                        offset: new Vector2(1),
                        damage: this.attackDamage,
                        hitImpulse: new Vector2(0, 5),
                        damageType: DamageType.Slash,
                        shouldCheckLineOfSight: true
                      }),
                      WaitForAnimationLoop(),
                      Wait(200)
                    )
                  )
                )
              )
            ),
            // Chase when attack on cooldown
            ChaseAggroedEntity(0.5)
          )
        ),
        GroundPatrol(0, 1.5, 2000, () => this.shouldHomePatrol)
      )
    );
  }

  destroy(): void {
    super.destroy();

    this.hitSound.dispose();
    this.sprite.dispose();
  }
}
