import { Color, Object3D, Vector3 } from "three";

import { EnemyProps } from "src/api/enemy";
import { DamageType, ElementalType, EntityAlignment, EntityProps } from "src/api/entity";
import { NavAction } from "src/api/navigation";
import {
  enemyCollisionGroup,
  terrainSensorCollisionGroup
} from "src/engine/constants/collisionGroups";
import { kInvPixelScale, kPixelScale } from "src/engine/constants/scaling";
import { AIBehaviorTree } from "src/engine/entity/AIBehaviorTree";
import {
  Debounce,
  Do,
  Selector,
  Sequence
} from "src/engine/entity/AICoreNodes";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import { getAsset, setAssetDependencies } from "src/engine/entity/decorators";
import { vector3To2 } from "src/engine/util/vecTypes";
import * as SBTypes from "src/entities/enemies/sprites/bee-mage/spelling_bee";
import { CancelMotionPathFollowing } from "src/entities/shared/aiNodes/consumerNodes/AICancelMotionPathFollowingNode";
import { CancelPathFollowing } from "src/entities/shared/aiNodes/consumerNodes/AICancelPathFollowingNode";
import { IsAggroed } from "src/entities/shared/aiNodes/consumerNodes/AIIsAggroedNode";
import { SetMotionCapabilities } from "src/entities/shared/aiNodes/consumerNodes/AISetMotionCapabilitiesNode";
import { StartMotionPathFollowing } from "src/entities/shared/aiNodes/consumerNodes/AIStartMotionPathFollowingNode";
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
import { StatusBehavior } from "src/entities/shared/behaviors/StatusBehavior";
import { getEntityPalette } from "src/entities/shared/util/palette";
import { GenericProjectile, GenericProjectileProps } from "src/entities/spells/projectiles/GenericProjectile";

import { BeeDirectives, PerformBeeDirectiveBehaviors } from "./bee-directives";

export type SpellingBeeProps = EntityProps & EnemyProps & {};

@setAssetDependencies(() => ["spellingBeeSprite"])
export class SpellingBee extends CoreEntity {
  static readonly type = "SpellingBee";
  public readonly type = SpellingBee.type;

  public alignment = EntityAlignment.Enemy;
  public elementalType?: ElementalType;
  public readonly size = {
    width: 0.75,
    height: 0.94
  };

  public object3D = new Object3D();
  public sprite = getAsset("spellingBeeSprite").getSprite<
    SBTypes.sprite_layers,
    SBTypes.sprite_animations
  >();

  public dead = false;
  public behaviors = {
    motionCapabilities: new MotionCapabilitiesBehavior()
      .setJump(false)
      .setFly(true),
    physics: new CharacterPhysicsBehavior()
      .setGroup(enemyCollisionGroup)
      .setDensity(1)
      .setGravityScale(0.5),
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
    animation: new AnimationControlBehavior<SBTypes.sprite_animations>({
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
    outOfBounds: new OutOfBoundsBehaviour()
  };

  private readonly deathAnimationData: APIAnimationData<SBTypes.sprite_animations> =
    {
      tagName: "death",
      isLooping: false,
      priorityLevel: AnimationPriority.ACTION
    };

  private readonly spellAnimationData: APIAnimationData<SBTypes.sprite_animations> =
    {
      tagName: "spell",
      isLooping: false,
      priorityLevel: AnimationPriority.ACTION
    };

  private readonly stickAnimationData: APIAnimationData<SBTypes.sprite_animations> =
    {
      tagName: "attack",
      isLooping: false,
      priorityLevel: AnimationPriority.ACTION
    };

  private readonly spellDamage: number = 15;
  private readonly spellCooldown = 2000;
  private readonly spellRange = 8;
  private readonly swarmRadius: number = 10;
  private readonly baseSpeed = 1.5;

  constructor(props: SpellingBeeProps) {
    super(props);

    this.elementalType = props.element;

    this.sprite.mesh.scale.multiplyScalar(kInvPixelScale);
    this.sprite.mesh.scale.y *= -1;
    this.sprite.mesh.position.y += 0.25;
    this.sprite.gotoAnimation("idle");
    this.sprite.center();
    this.object3D.add(this.sprite.mesh);
    this.object3D.position
      .copy(this.position)
      .multiplyScalar(kPixelScale)
      .round()
      .multiplyScalar(kInvPixelScale);

    // Apply elemental color palette.
    if (this.elementalType) {
      const palette = getEntityPalette(this.elementalType, 2);
      this.sprite.multiplyLayers(new Color(palette[0]), 0.5, ["hat", "weapon"]);
      this.sprite.fadeLayers(new Color(palette[1]), 0.25, ["hat", "weapon"]);
    }

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

    this._setupBehaviorTree();
  }
  destroy(): void {
    super.destroy();
    this.sprite.dispose();
  }
  step(ms: number) {
    super.step(ms);
    this.behaviors.perception.direction.x =
      this.behaviors.animation.facingDirection;
  }
  private _setupBehaviorTree() {
    this.behaviors.ai.init(this);
    this.behaviors.ai.behaviorTree = new AIBehaviorTree(
      Selector(
        HandleDeath<SBTypes.sprite_animations>(this.deathAnimationData, true),
        PerformBeeDirectiveBehaviors(this.swarmRadius),
        Sequence(
          IsAggroed(),
          CancelMotionPathFollowing(),
          SetMotionCapabilities({
            groundSpeed: this.baseSpeed * 2,
            flightSpeed: this.baseSpeed * 2
          }),
          Selector(
            Debounce(
              this.spellCooldown,
              Sequence(
                IsAggroedEntityInFront(Math.PI / 4, this.spellRange),
                CancelPathFollowing(),
                ScopeWithAnimation<SBTypes.sprite_animations>(
                  this.spellAnimationData,
                  Sequence(
                    WaitForAnimationFrame(13),
                    Do(() => {
                      this._doCast();
                    }),
                    WaitForAnimationLoop()
                  )
                )
              )
            ),
            ChaseAggroedEntity(4)
          )
        ),
        Sequence(
          VerifyMotionPathProvider(),
          StartMotionPathFollowing(),
          SetMotionCapabilities({
            groundSpeed: this.baseSpeed,
            flightSpeed: this.baseSpeed
          })
        ),
        Sequence(GroundPatrol(0, 2, 7500))
      )
    );
  }
  private _doCast() {
    const aggroTarget = this.behaviors.aggro.resolveCurrentTarget();
    if (!aggroTarget) return;

    const castOrigin = this.position.clone();
    const castOffset = new Vector3(1.25, -0.15, 0);
    if (this.behaviors.physicsControl.facingRight === false) castOffset.x *= -1;
    castOrigin.add(castOffset);

    const castVelocity = aggroTarget.position.clone().sub(castOrigin);
    castVelocity.normalize();
    castVelocity.multiplyScalar(10);

    const styleProps: Partial<GenericProjectileProps> = {};
    if (!this.elementalType) {
      styleProps.colorInner = new Color(1, 1, 0.5);
      styleProps.colorOuter = new Color(0.8, 0.6, 0.25);
      styleProps.colorTrail = new Color(1, 1, 0.5);
    }

    const projectile = new GenericProjectile({
      position: castOrigin,
      elementalType: this.elementalType,
      damage: 10,
      gravity: 0,
      radius: 0.125,
      ...styleProps
    });
    projectile.setVelocity(vector3To2(castVelocity));
    projectile.setSourceEntity(this);
    this.level?.addEntity(projectile);
  }
}
