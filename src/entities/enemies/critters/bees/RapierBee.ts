import { Object3D, Vector2 } from "three";

import { AIResult } from "src/api/ai";
import { CameraRequestPriority } from "src/api/camera";
import { ControlEvents } from "src/api/controls";
import { EnemyProps } from "src/api/enemy";
import { DamageType, EntityAlignment, EntityProps } from "src/api/entity";
import { NavAction } from "src/api/navigation";
import {
  enemyCollisionGroup,
  inactiveEnemyCollisionGroup,
  terrainSensorCollisionGroup
} from "src/engine/constants/collisionGroups";
import { kInvPixelScale, kPixelScale } from "src/engine/constants/scaling";
import { AIBehaviorTree, AINode } from "src/engine/entity/AIBehaviorTree";
import {
  Debounce,
  Do,
  Execute,
  Failure,
  Inverter,
  Log,
  MemoSelector,
  ParallelSelector,
  ParallelSequence,
  Random,
  Selector,
  Sequence,
  Succeeder,
  Wait,
  WaitUntilSuccess
} from "src/engine/entity/AICoreNodes";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import { getAsset, setAssetDependencies } from "src/engine/entity/decorators";
import { vector3To2 } from "src/engine/util/vecTypes";
import { HitAreaShape } from "src/entities/shared/HitArea";
import { CancelMotionPathFollowing } from "src/entities/shared/aiNodes/consumerNodes/AICancelMotionPathFollowingNode";
import { CancelPathFollowing } from "src/entities/shared/aiNodes/consumerNodes/AICancelPathFollowingNode";
import { IsAggroed } from "src/entities/shared/aiNodes/consumerNodes/AIIsAggroedNode";
import { IsGrounded } from "src/entities/shared/aiNodes/consumerNodes/AIIsGroundedNode";
import { MoveToPosition } from "src/entities/shared/aiNodes/consumerNodes/AIMoveToPositionNode";
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
import { IsAggroedEntityInVisionCone } from "src/entities/shared/aiNodes/consumerNodes/subtrees/AIIsAggroedEntityInVisionConeNode";
import { ScopeWithAnimation } from "src/entities/shared/aiNodes/decoratorNodes/AIScopeWithAnimationNode";
import { GetAggroedEntityPosition } from "src/entities/shared/aiNodes/producerNodes/AIGetAggroedEntityPositionNode";
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
import { CollisionDamageBehavior } from "src/entities/shared/behaviors/CollisionDamageBehavior";
import { EnemyAggroBehavior } from "src/entities/shared/behaviors/EnemyAggroBehavior";
import { HitStunBehavior } from "src/entities/shared/behaviors/HitStunBehavior";
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
import { toDegrees } from "src/util/mathUtils";

import {
  RapierBeeAnimation,
  RapierBeeLayer
} from "../../sprites/rapier-bee/rapier-bee";
import { PerformBeeDirectiveBehaviors } from "./bee-directives";

export type RapierBeeProps = EntityProps &
  EnemyProps & {
    swarmRadius?: number;
  };

type RapierBeeControlMode = "default" | "path";

@setAssetDependencies(() => ["rapierBeeSprite"])
export class RapierBee extends CoreEntity {
  static readonly type = "RapierBee";
  public readonly type = RapierBee.type;

  public alignment = EntityAlignment.Enemy;
  public readonly size = {
    width: 0.6,
    height: 2.08
  };

  public object3D = new Object3D();
  public sprite = getAsset("rapierBeeSprite").getSprite<
    RapierBeeLayer,
    RapierBeeAnimation
  >();

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
      sightDistance: 8,
      nearbyDistance: 2,
      farDistance: 6,
      trackingTimeoutMs: 5000
    }),
    aggro: new EnemyAggroBehavior({
      aggroOnSight: true,
      loseAggroWithoutSight: true,
      aggroCooldown: 10000
    }),
    data: new CentralDataStoreBehavior(),
    animation: new AnimationControlBehavior<RapierBeeAnimation>({
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
    hitStun: new HitStunBehavior<RapierBeeAnimation>({
      dazeDamageThreshold: 20,
      dazeTimeMs: 1000,
      dazeCooldownMs: 2000,
      stunAnimation: {
        tagName: "hit_frame"
      },
      dazeAnimation: {
        tagName: "dizzie"
      }
    }),
    ai: new AIBehavior(),
    outOfBounds: new OutOfBoundsBehaviour(),
    scriptedControl: new ScriptedControlBehavior<RapierBeeControlMode>()
  };

  /**********************
   *
   * AI Configuration
   *
   ***********************/

  private readonly deathAnimationData: APIAnimationData<RapierBeeAnimation> = {
    tagName: "death",
    startFrame: 1,
    isLooping: false,
    priorityLevel: AnimationPriority.CRITICAL
  };

  private readonly swipeAttackAnimationData: APIAnimationData<RapierBeeAnimation> =
    {
      tagName: "attack_1",
      startFrame: 1,
      isLooping: false,
      priorityLevel: AnimationPriority.ACTION
    };

  private readonly comboAttackAnimationData: APIAnimationData<RapierBeeAnimation> =
    {
      tagName: "attack_2",
      startFrame: 1,
      isLooping: false,
      priorityLevel: AnimationPriority.ACTION
    };

  private readonly airAttackStartAnimationData: APIAnimationData<RapierBeeAnimation> =
    {
      tagName: "air_attack_side",
      startFrame: 0,
      endFrame: 2,
      speedScaler: 0.25,
      isLooping: false,
      priorityLevel: AnimationPriority.ACTION
    };

  private readonly airAttackLoopAnimationData: APIAnimationData<RapierBeeAnimation> =
    {
      tagName: "air_attack_side",
      isLooping: true,
      startFrame: 3,
      endFrame: 6,
      priorityLevel: AnimationPriority.ACTION
    };

  private swipeDamage = 8;
  private readonly swipeRange = 1.5;
  private readonly swipeImpulse = new Vector2(12, 3);

  private comboDamage = 2.5;
  private readonly comboRange = 2.15;
  private readonly comboImpulse = new Vector2(1.4, 2.25);
  private readonly finalComboImpulse = new Vector2(12, 5);

  private airDamage = 5;
  private readonly minAirRange = 4.5;
  private readonly airRange = 10;

  private readonly attackCooldown = 800;
  private readonly airAttackCooldown = 3000;

  private speed = 2.5;

  private swarmRadius = 10;

  constructor(props: RapierBeeProps) {
    super(props);

    const attackMultiplier = props.attack ?? 1;
    this.swipeDamage *= attackMultiplier;
    this.comboDamage *= attackMultiplier;
    this.airDamage *= attackMultiplier;

    this.speed = !!props.speed ? props.speed : this.speed;

    this.swarmRadius = props.swarmRadius ? props.swarmRadius : this.swarmRadius;

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
    this.behaviors.status.setMaxHealth(props.health ? props.health : 50);
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
    this.behaviors.hitStun.init(this);
    this.behaviors.outOfBounds.init(this);

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
    const aggroedEntityPositionStore = AINode.CreateSharedVariable(
      new Vector2()
    );
    const aboveAggroedEntityPosition = new Vector2();
    const aggroedEntityPositionDelta = new Vector2();
    const airAttackMovementUnits = new Vector2();

    const zeroVector = new Vector2();
    const chargeHitAreaOffset = new Vector2();
    const chargeImpulse = new Vector2();

    let chargeHitEntitySwitch = false;

    // prettier-ignore
    this.behaviors.ai
    .init(this)
    .behaviorTree = new AIBehaviorTree(
      Selector(
        HandleDeath<RapierBeeAnimation>(this.deathAnimationData, true),
        Sequence(
          VerifyControlMode("path"),
          StartMotionPathFollowing()
        ),
        PerformBeeDirectiveBehaviors(this.swarmRadius),
        Sequence(
          IsAggroed(),
          CancelMotionPathFollowing(),
          SetMotionCapabilities({ groundSpeed: 2 * this.speed * 0.75, flightSpeed: 2 * this.speed }),
          Selector(
            Debounce(this.attackCooldown,
              MemoSelector(
                Sequence(
                  IsAggroedEntityInFront(Math.PI / 2, this.swipeRange),
                  CancelPathFollowing(),
                  ScopeWithAnimation<RapierBeeAnimation>(this.swipeAttackAnimationData,
                    Sequence(
                      WaitForAnimationFrame(4),
                      SpawnHitArea({
                        shape: {
                          type: HitAreaShape.Circle,
                          radius: 0.8
                        },
                        sourceEntity: this,
                        offset: new Vector2(1, 0),
                        damage: this.swipeDamage,
                        damageType: DamageType.Pierce,
                        hitImpulse: this.swipeImpulse,
                        shouldCheckLineOfSight: true,
                        hitStopMs: 100,
                        screenShake: 1
                      }),
                      WaitForAnimationLoop()
                    )
                  )
                ),
                Sequence(
                  IsAggroedEntityInFront(Math.PI / 2, this.comboRange),
                  CancelPathFollowing(),
                  ScopeWithAnimation<RapierBeeAnimation>(this.comboAttackAnimationData,
                    Sequence(
                      WaitForAnimationFrame(3),
                      SpawnHitArea({
                        shape: {
                          type: HitAreaShape.Circle,
                          radius: 0.75
                        },
                        sourceEntity: this,
                        offset: new Vector2(1.2, 0),
                        damage: this.comboDamage,
                        damageType: DamageType.Pierce,
                        hitImpulse: this.comboImpulse,
                        shouldCheckLineOfSight: true,
                        hitStopMs: 50
                      }),
                      WaitForAnimationFrame(5),
                      SpawnHitArea({
                        shape: {
                          type: HitAreaShape.Circle,
                          radius: 0.75
                        },
                        sourceEntity: this,
                        offset: new Vector2(1.2, 0),
                        damage: this.comboDamage,
                        damageType: DamageType.Pierce,
                        hitImpulse: this.comboImpulse,
                        shouldCheckLineOfSight: true,
                        hitStopMs: 50
                      }),
                      WaitForAnimationFrame(7),
                      SpawnHitArea({
                        shape: {
                          type: HitAreaShape.Circle,
                          radius: 0.75
                        },
                        sourceEntity: this,
                        offset: new Vector2(1.2, 0),
                        damage: this.comboDamage,
                        damageType: DamageType.Pierce,
                        hitImpulse: this.comboImpulse,
                        shouldCheckLineOfSight: true,
                        hitStopMs: 50
                      }),
                      WaitForAnimationFrame(9),
                      SpawnHitArea({
                        shape: {
                          type: HitAreaShape.Circle,
                          radius: 0.75
                        },
                        sourceEntity: this,
                        offset: new Vector2(1.2, 0),
                        damage: this.comboDamage,
                        damageType: DamageType.Pierce,
                        hitImpulse: this.finalComboImpulse,
                        shouldCheckLineOfSight: true,
                        hitStopMs: 300,
                        screenShake: 2
                      }),
                      WaitForAnimationLoop()
                    ),
                  )
                ),
                Debounce(this.airAttackCooldown, 
                  Sequence(
                    Inverter(
                      IsGrounded(),
                    ),
                    Inverter(
                      IsAggroedEntityInFront(Math.PI, this.minAirRange),
                    ),
                    IsAggroedEntityInFront(Math.PI, this.airRange),
                    CancelPathFollowing(),
                    SetMotionCapabilities({ groundSpeed: 10 * this.speed * 0.75, flightSpeed: 10 * this.speed }),
                    Do(() => this.behaviors.physics.setGroup(inactiveEnemyCollisionGroup)),
                    Do(() => 
                      this.level?.cameraDirector.sendLookAtEntityRequest(
                        this,
                        {
                          influence: 0.35,
                          size: new Vector2(13, 13),
                          priority: CameraRequestPriority.ADJUSTMENT
                        },
                        1500
                      )
                    ),
                    ScopeWithAnimation<RapierBeeAnimation>(this.airAttackStartAnimationData,
                      Sequence(
                        WaitForAnimationLoop(),
                        Wait(500)
                      )
                    ),
                    GetAggroedEntityPosition(aggroedEntityPositionStore),
                    Do(() => {
                      const entityNowToRight = aggroedEntityPositionStore.value.x > this.position.x;
                      const entityNowToLeft = aggroedEntityPositionStore.value.x < this.position.x

                      if (entityNowToRight) this.behaviors.animation.facingDirection = SpriteFacingDirection.RIGHT;
                      else if (entityNowToLeft) this.behaviors.animation.facingDirection = SpriteFacingDirection.LEFT;
                    }),
                    Do(() => {
                      chargeHitEntitySwitch = false;

                      const thisPosition = vector3To2(this.position);

                      aggroedEntityPositionDelta
                        .copy(aggroedEntityPositionStore.value)
                        .sub(thisPosition);

                      airAttackMovementUnits
                        .copy(aggroedEntityPositionDelta)
                        .normalize();

                      const controlEvents = this.behaviors.pathFollowing.controlEvents;

                      controlEvents.emit(
                        ControlEvents.MoveHorizontally,
                        airAttackMovementUnits.x
                      );
                      controlEvents.emit(
                        ControlEvents.MoveVertically,
                        airAttackMovementUnits.y
                      );

                      const chargeAngle = Math.atan2(
                        airAttackMovementUnits.y,
                        airAttackMovementUnits.x
                      );
                      const isFacingLeft =
                        this.behaviors.animation.facingDirection ===
                        SpriteFacingDirection.LEFT;

                      this.behaviors.physics.setRotation(
                        isFacingLeft ? chargeAngle + Math.PI : chargeAngle
                      );

                      chargeHitAreaOffset
                        .set(1, 0)
                        .rotateAround(zeroVector, chargeAngle)
                        .multiplyScalar(1.2);
                      chargeImpulse
                        .set(1, 0)
                        .rotateAround(zeroVector, chargeAngle)
                        .multiplyScalar(8)
                    }),
                    ScopeWithAnimation<RapierBeeAnimation>(this.airAttackLoopAnimationData, 
                      ParallelSelector(
                        WaitUntilSuccess(
                          Failure(
                            Debounce(50, 
                              SpawnHitArea({
                                shape: {
                                  type: HitAreaShape.Circle,
                                  radius: 0.3
                                },
                                sourceEntity: this,
                                offset: chargeHitAreaOffset,
                                damage: this.airDamage,
                                damageType: DamageType.Pierce,
                                hitImpulse: chargeImpulse,
                                shouldCheckLineOfSight: true,
                                hitStopMs: 100,
                                screenShake: 1,
                                hitEntityHitDetailsHook: (_, originalHitDetails) => {
                                  chargeHitEntitySwitch = true;
                                  return originalHitDetails;
                                }
                              }, false)
                            )
                          ),
                        ),
                        WaitUntilSuccess(
                          Execute(() => {
                            return chargeHitEntitySwitch ? AIResult.Succeeded : AIResult.Failed;
                          })
                        ),
                        Wait(500)
                      ),
                    ),
                    SetMotionCapabilities({ groundSpeed: 2 * this.speed * 0.75, flightSpeed: 2 * this.speed }),
                    Do(() => 
                      this.level?.cameraDirector.removeLookAtEntityRequest(this)
                    ),
                    Do(() => {
                      const controlEvents = this.behaviors.pathFollowing.controlEvents;

                      controlEvents.emit(
                        ControlEvents.MoveHorizontally,
                        0
                      );
                      controlEvents.emit(
                        ControlEvents.MoveVertically,
                        0
                      );

                      this.behaviors.physics.setRotation(0);
                    }),
                    Wait(750),
                    Do(() => this.behaviors.physics.setGroup(enemyCollisionGroup))
                  ),
                )
              )
            ),
            MemoSelector(
              Sequence(
                Random(0.50),
                ParallelSelector(
                  WaitUntilSuccess(
                    Failure(
                      Sequence(
                        GetAggroedEntityPosition(aggroedEntityPositionStore),
                        Do(() => {
                          aboveAggroedEntityPosition
                            .copy(aggroedEntityPositionStore.value)
                            .add({x: 0, y: this.minAirRange});
                        }),
                        Succeeder(
                          Debounce(500,
                            MoveToPosition(aboveAggroedEntityPosition, 0, false)
                          )
                        )
                      )
                    ),
                  ),
                  Wait(500)
                )
              ),
              ParallelSelector(
                WaitUntilSuccess(
                  Failure(
                    ChaseAggroedEntity(this.comboRange * 1.1)
                  )
                ),
                Wait(1000)
              )
            )
          )
        ),
        Sequence(
          VerifyMotionPathProvider(),
          StartMotionPathFollowing(),
          SetMotionCapabilities({ groundSpeed: this.speed * 0.75, flightSpeed: this.speed }),
        ),
        Sequence(
          GroundPatrol(0, 2, 7500)
        )
      )
    );
  }
}
