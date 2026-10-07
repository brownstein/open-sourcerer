import { Object3D, Vector2 } from "three";

import { AIResult } from "src/api/ai";
import { EnemyProps } from "src/api/enemy";
import {
  BaseEntityType,
  DamageType,
  EntityAlignment,
  EntityHitDetails,
  EntityProps
} from "src/api/entity";
import { isSolidTerrainLike } from "src/api/entityInteractions";
import { OverlayAPI, OverlayPosition } from "src/api/overlay";
import { createTypedEventEmitter } from "src/api/util";
import {
  BossHealthBar,
  BossHealthBarEvents,
  BossHealthBarOverlayProps
} from "src/components/ui/overlays/overlays/BossHealthBar";
import {
  CBM,
  enemyCollisionGroup,
  getGroup,
  terrainSensorCollisionGroup
} from "src/engine/constants/collisionGroups";
import { kInvPixelScale, kPixelScale } from "src/engine/constants/scaling";
import { AIBehaviorTree } from "src/engine/entity/AIBehaviorTree";
import {
  Debounce,
  Do,
  Execute,
  Inverter,
  MemoSelector,
  ParallelSelector,
  Selector,
  Sequence,
  Timeout,
  Wait
} from "src/engine/entity/AICoreNodes";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import { getAsset, setAssetDependencies } from "src/engine/entity/decorators";
import { kWorldGravity } from "src/engine/level/Level";
import { HitAreaShape } from "src/entities/shared/HitArea";
import { CancelPathFollowing } from "src/entities/shared/aiNodes/consumerNodes/AICancelPathFollowingNode";
import { IsAggroed } from "src/entities/shared/aiNodes/consumerNodes/AIIsAggroedNode";
import { SetMotionCapabilities } from "src/entities/shared/aiNodes/consumerNodes/AISetMotionCapabilitiesNode";
import { SpawnHitArea } from "src/entities/shared/aiNodes/consumerNodes/AISpawnHitAreaNode";
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
  AnimationPriority,
  SpriteFacingDirection
} from "src/entities/shared/behaviors/AnimationControlBehavior";
import { CentralDataStoreBehavior } from "src/entities/shared/behaviors/CentralDataStoreBehavior";
import {
  CharacterGroundPhysicsControlBehaviorEvents,
  CharacterGroundPhysicsControlBehaviorStandard
} from "src/entities/shared/behaviors/CharacterGroundPhysicsController";
import {
  CharacterPhysicsBehavior,
  CharacterPhysicsEvents
} from "src/entities/shared/behaviors/CharacterPhysics";
import { CollisionDamageBehavior } from "src/entities/shared/behaviors/CollisionDamageBehavior";
import {
  EnemyAggroBehavior,
  EnemyAggroEvents
} from "src/entities/shared/behaviors/EnemyAggroBehavior";
import { HitStunBehavior } from "src/entities/shared/behaviors/HitStunBehavior";
import { MotionCapabilitiesBehavior } from "src/entities/shared/behaviors/MotionCapabilities";
import { NavPathFollowingBehavior } from "src/entities/shared/behaviors/NavPathFollowingBehavior";
import { OutOfBoundsBehaviour } from "src/entities/shared/behaviors/OutOfBoundsBehaviour";
import { PerceptionBehavior } from "src/entities/shared/behaviors/Perception";
import { StatusBehavior } from "src/entities/shared/behaviors/StatusBehavior";
import { EarthBlock } from "src/entities/spells/earth/EarthBlockEntity";
import { isAnyTerrain } from "src/entities/terrain/allTerrain";

import {
  sprite_animations as BeeQueenAnimation,
  sprite_layers as BeeQueenLayer
} from "../../sprites/bee-queen/bee-queen";
import {
  IsAggroedEntityAttacking,
  IsPhase1,
  IsPhase2,
  ProximityHitOnce,
  WaitWhileAggroedEntityAttacking
} from "./AIBeeQueenPhaseNodes";
import { BeeDirectives } from "./bee-directives";

export type BeeQueenProps = EntityProps & EnemyProps;

const beeAnim = (
  tagName: BeeQueenAnimation,
  isLooping: boolean,
  priorityLevel: AnimationPriority = AnimationPriority.ACTION
): APIAnimationData<BeeQueenAnimation> => ({
  tagName,
  startFrame: 1,
  isLooping,
  priorityLevel
});

@setAssetDependencies(() => ["beeQueenSprite"])
export class BeeQueen extends CoreEntity {
  static readonly type = "BeeQueen";
  public readonly type = BeeQueen.type;
  public alignment = EntityAlignment.Enemy;
  public readonly size = { width: 1.5, height: 2.5 };

  public object3D = new Object3D();
  public sprite = getAsset("beeQueenSprite").getSprite<
    BeeQueenLayer,
    BeeQueenAnimation
  >();

  public dead = false;
  public facingRight = false;
  private isBlocking = false;
  private isCharging = false;

  /* ── Tuning ─────────────────────────────────────────────── */

  private readonly speed: number = 1.5;
  private readonly pauseTime = 3000;

  private readonly swordDamage: number = 2;
  private readonly swordImpulse = new Vector2(8, 4);
  private readonly swordCooldown = 800;
  private readonly swordRange = 2.5;

  private readonly earthWallDamage = 30;

  private readonly blockCooldown = 2000;
  private readonly blockRange = 2.5;

  private readonly shieldBlockJiggleDurationMs = 250;
  private readonly shieldBlockJiggleAmplitude = 4;
  private shieldBlockJiggleMs = 0;
  private shieldBlockJiggleDir = 1;

  private readonly shieldChargeDamage: number = 3;
  private readonly shieldChargeImpulse = new Vector2(12, 4);
  private readonly shieldLungeDelayMs = 1500;

  private readonly chargeRange = 9;
  private readonly chargeChance = 0.5;
  private readonly chargeRollIntervalMs = 1500;
  private readonly chargeCooldownMs = 4500;
  private _nextChargeRollMs = 0;

  private readonly dazeJumpLandingDistance = 3;

  private _dazeJumpTeardown: (() => void) | null = null;

  private _collisionSuppressedWithId: string | null = null;

  private readonly chargeCollisionGroup = getGroup(
    CBM.Enemies,
    CBM.Default | CBM.Terrain | CBM.Damage | CBM.Projectiles | CBM.Sensor
  );

  /* ── Animation data ─────────────────────────────────────── */

  private readonly swordAttackAnim = beeAnim("attack_new", false);
  private readonly blockAnim = beeAnim("Shield_new", false);
  private readonly chargeLoopAnim = beeAnim("charge", true);
  private readonly chargeWindupAnim: APIAnimationData<BeeQueenAnimation> = {
    tagName: "Shield_charge",
    startFrame: 1,
    endFrame: 10,
    isLooping: false,
    priorityLevel: AnimationPriority.ACTION
  };
  private readonly jumpAnim = beeAnim("jump", true);
  private readonly deathAnim = beeAnim(
    "attack_new",
    false,
    AnimationPriority.CRITICAL
  );

  /* ── Boss health bar ────────────────────────────────────── */

  private healthEvents = createTypedEventEmitter<BossHealthBarEvents>();
  private overlay?: OverlayAPI<BossHealthBarOverlayProps>;

  /* ── Behaviors ──────────────────────────────────────────── */

  public behaviors = {
    motionCapabilities: new MotionCapabilitiesBehavior()
      .setJump(true)
      .setSpeedLimits(1.5),
    physics: new CharacterPhysicsBehavior()
      .setGroup(enemyCollisionGroup)
      .setDensity(1)
      .setShouldPushAwayOtherCharacterPhysics(false),
    collision: new CollisionDamageBehavior(5, 10, 6),
    physicsControl:
      new CharacterGroundPhysicsControlBehaviorStandard().setSensorCollisionGroup(
        terrainSensorCollisionGroup
      ),
    pathFollowing: new NavPathFollowingBehavior().setRetries(1),
    status: new StatusBehavior(),
    perception: new PerceptionBehavior({
      spreadAngle: Math.PI / 2,
      sightDistance: 12,
      nearbyDistance: 2,
      farDistance: 8,
      trackingTimeoutMs: 5000
    }),
    aggro: new EnemyAggroBehavior({
      aggroOnSight: true,
      loseAggroWithoutSight: true,
      aggroCooldown: 5000
    }),
    data: new CentralDataStoreBehavior(),
    animation: new AnimationControlBehavior<BeeQueenAnimation>({
      idle: {
        tagName: "idle_3",
        priorityLevel: AnimationPriority.PHYSICS
      },
      walk: {
        tagName: "new_walk",
        priorityLevel: AnimationPriority.PHYSICS
      }
    }),
    ai: new AIBehavior<BeeDirectives>(),
    outOfBounds: new OutOfBoundsBehaviour(),
    hitStun: new HitStunBehavior<BeeQueenAnimation>({
      stunTimeMs: 500,
      dazeDamageThreshold: 0,
      dazeNumSuccessiveHitsThreshold: 6,
      dazeSuccessiveHitsIntervalMs: 3000,
      dazeTimeMs: 1500,
      dazeCooldownMs: 10000,
      stunAnimation: [
        { tagName: "hurt_1", startFrame: 1, isLooping: false },
        { tagName: "hurt_2", startFrame: 1, isLooping: false }
      ],
      dazeAnimation: {
        tagName: "dazed",
        startFrame: 1
      }
    })
  };

  /* ── Constructor ────────────────────────────────────────── */

  constructor(props: BeeQueenProps) {
    super(props);

    this.swordDamage = props.attack ?? this.swordDamage;
    this.speed = props.speed ?? this.speed;

    this.object3D.scale.multiplyScalar(kInvPixelScale);
    this.object3D.position
      .copy(this.position)
      .multiplyScalar(kPixelScale)
      .round()
      .multiplyScalar(kInvPixelScale);

    this.sprite.hideLayers("reference");
    this.sprite.gotoAnimation("idle_3");
    this.sprite.center();
    this.sprite.mesh.position.y += 16;
    this.sprite.mesh.scale.y *= -1;
    this.object3D.add(this.sprite.mesh);

    this._initBehaviors(props);
    this._setupEndDazeOverride();
    this._setupChargeWallCollision();
    this._setupBehaviorTree();
  }

  /* ── Lifecycle ──────────────────────────────────────────── */

  hit(hitDetails: EntityHitDetails): void {
    if (this.isBlocking) {
      const hitFromRight = hitDetails.sourceEntity.position.x > this.position.x;
      const facingRight = this.behaviors.animation.facingDirection > 0;
      if (hitFromRight === facingRight) {
        this.shieldBlockJiggleMs = this.shieldBlockJiggleDurationMs;
        this.shieldBlockJiggleDir = hitFromRight ? -1 : 1; // shoved away from the blow
        return;
      }
    }
    super.hit(hitDetails);

    if (hitDetails.sourceEntity.alignment === EntityAlignment.Player) {
      this.behaviors.aggro.setAggro(hitDetails.sourceEntity);
    }

    if (!this.overlay && this.level) {
      this.overlay = this.level.ctx?.overlayProvider?.addOverlay({
        component: BossHealthBar,
        position: OverlayPosition.ViewportBottom,
        overlayProps: {
          bossName: "Bee Queen",
          maxHealth: this.behaviors.status.maxHealth,
          healthEvents: this.healthEvents
        }
      });
    }

    this.healthEvents.emit("healthUpdated", this.behaviors.status.health);
    if (this.behaviors.status.dead) {
      this.healthEvents.emit("dead");
    }
  }

  destroy(): void {
    this._dazeJumpTeardown?.();
    super.destroy();
    this.overlay?.remove();
    this.overlay = undefined;
  }

  step(deltaMs: number): void {
    super.step(deltaMs);
    this.behaviors.perception.direction.x =
      this.behaviors.animation.facingDirection;
    this._stepShieldJiggle(deltaMs);
  }

  private _stepShieldJiggle(deltaMs: number): void {
    if (this.shieldBlockJiggleMs <= 0) return;
    this.shieldBlockJiggleMs = Math.max(0, this.shieldBlockJiggleMs - deltaMs);
    const progress =
      1 - this.shieldBlockJiggleMs / this.shieldBlockJiggleDurationMs; // 0 → 1
    const envelope = 1 - progress; // linear decay, max at impact
    const offsetX =
      this.shieldBlockJiggleDir *
      this.shieldBlockJiggleAmplitude *
      envelope *
      Math.cos(progress * Math.PI * 6);
    this.sprite.offsetLayers(offsetX, 0, "Shield");
  }

  /* ── Setup helpers ──────────────────────────────────────── */

  private _initBehaviors(props: BeeQueenProps): void {
    this.behaviors.motionCapabilities.init(this);
    this.behaviors.physics.init(this);
    this.behaviors.collision.init(this);
    this.behaviors.physicsControl
      .init(this)
      .assignMotionCapabilities(this.behaviors.motionCapabilities.capabilities)
      .attachControlEvents(this.behaviors.pathFollowing.controlEvents);
    this.behaviors.status.setMaxHealth(props.health ?? 400);
    this.behaviors.status.init(this).attachProtosSprite(this.sprite);
    this.behaviors.status.healthBar.setOpacity(0);
    this.behaviors.perception
      .init(this)
      .setSourceBody(this.behaviors.physics.body);
    this.behaviors.aggro.init(this);
    this.behaviors.aggro.events.on(EnemyAggroEvents.BeginAggro, () => {
      if (!this.isCharging) this._faceAggroTarget();
    });
    this.behaviors.pathFollowing
      .init(this)
      .setMotionCapabilities(this.behaviors.motionCapabilities.capabilities)
      .setPhysicsControl(this.behaviors.physicsControl);
    this.behaviors.data.init(this);
    this.behaviors.animation.init(this).attachSprite(this.sprite);
    this.behaviors.outOfBounds.init(this);
    this.behaviors.hitStun.init(this);
  }

  private _setupEndDazeOverride(): void {
    const originalEndDaze = this.behaviors.hitStun.endDaze.bind(
      this.behaviors.hitStun
    );
    this.behaviors.hitStun.endDaze = () => {
      originalEndDaze();
      this._leapOverTarget();
    };
  }

  private _leapOverTarget(): void {
    const aggroTarget = this.behaviors.aggro.resolveCurrentTarget();
    if (!aggroTarget || !this.behaviors.physics.body) {
      this._setPlayerCollision(true);
      return;
    }

    this._dazeJumpTeardown?.();
    this._setPlayerCollision(false);

    if (!this._launchLeap(aggroTarget.position.x)) {
      this._setPlayerCollision(true);
      return;
    }
    this._dazeJumpTeardown = this._playLeapAnimation();
  }

  private _launchLeap(targetX: number): boolean {
    const body = this.behaviors.physics.body;
    if (!body) return false;

    const pastDir = targetX > this.position.x ? 1 : -1;
    const landingX = targetX + pastDir * this.dazeJumpLandingDistance;
    const horizontalDistance = landingX - this.position.x;

    this.behaviors.physicsControl.jump();

    const vy = body.linvel().y;
    if (vy <= 0) return false;

    const flightTime = (2 * vy) / Math.abs(kWorldGravity.y);
    body.setLinvel({ x: horizontalDistance / flightTime, y: vy }, true);

    this.behaviors.physicsControl.disable();
    return true;
  }

  private _playLeapAnimation(): () => void {
    const events = this.behaviors.physicsControl.events;

    const teardown = () => {
      events.off(CharacterGroundPhysicsControlBehaviorEvents.Land, teardown);
      this.behaviors.physicsControl.enable();
      this.behaviors.animation.clearOverride(this.jumpAnim);
      this._setPlayerCollision(true);
      this._dazeJumpTeardown = null;
    };

    this.behaviors.animation.requestOverride(this.jumpAnim);
    events.on(CharacterGroundPhysicsControlBehaviorEvents.Land, teardown);

    return teardown;
  }

  private _setupChargeWallCollision(): void {
    this.behaviors.physics.events.on(
      CharacterPhysicsEvents.CollideWithEntity,
      ([entity, normal]) => {
        if (!this.isCharging) return;
        if (
          !isAnyTerrain(entity) &&
          !isSolidTerrainLike(entity) &&
          entity.alignment !== EntityAlignment.TemporaryTerrain
        )
          return;
        if (Math.abs(normal.x) < 0.5) return;

        this._smashEarthWall(entity);

        this.isCharging = false;
        this.behaviors.physicsControl.lastSetHSpeedRatio = 0;
        this.behaviors.hitStun.startDaze();
      }
    );
  }

  private _beginCharge(): void {
    this.behaviors.physicsControl.lastSetHSpeedRatio =
      this.behaviors.animation.facingDirection;
    this.isCharging = true;
    this._setPlayerCollision(false);
  }

  private _endCharge(): void {
    this.isCharging = false;
    this.behaviors.physicsControl.lastSetHSpeedRatio = 0;
    this._setPlayerCollision(true);
  }

  private _restoreSuppressedCollision(): void {
    if (!this._collisionSuppressedWithId) return;
    this.level?.enableActiveCollisionsBetween(
      this.id,
      this._collisionSuppressedWithId
    );
    this._collisionSuppressedWithId = null;
  }

  private _setPlayerCollision(enabled: boolean): void {
    if (!this.level) return;
    if (enabled) {
      this.behaviors.physics.setGroup(enemyCollisionGroup);
      this._restoreSuppressedCollision();
      return;
    }
    const target = this.behaviors.aggro.resolveCurrentTarget();
    if (!target) return;
    if (this._collisionSuppressedWithId !== target.id)
      this._restoreSuppressedCollision();
    this.behaviors.physics.setGroup(this.chargeCollisionGroup);
    this.level.disableActiveCollisionsBetween(this.id, target.id);
    this._collisionSuppressedWithId = target.id;
  }

  /* ── Earth wall destruction ─────────────────────────────── */

  private _smashEarthWall(entity: BaseEntityType): void {
    if (!(entity instanceof EarthBlock)) return;
    const wall = entity;
    const dir = this.behaviors.animation.facingDirection;
    this.scheduler.add({
      startIn: 1,
      invokeFunctionAtComplete: () => {
        wall.hit({
          hittingEntity: this,
          sourceEntity: this,
          damage: this.earthWallDamage,
          damageType: DamageType.Blunt,
          hitImpulse: new Vector2(2 * dir, 0)
        });
      }
    });
  }

  /* ── Behavior tree ──────────────────────────────────────── */

  private _setupBehaviorTree(): void {
    const idlePatrol = GroundPatrol(0, 2, 7500);

    this.behaviors.ai.init(this).behaviorTree = new AIBehaviorTree(
      Selector(
        HandleDeath<BeeQueenAnimation>(this.deathAnim),
        Sequence(IsPhase1(), Selector(this._phase1Aggro(), idlePatrol)),
        Sequence(
          IsPhase2(),
          Selector(Sequence(IsAggroed(), ChaseAggroedEntity()), idlePatrol)
        ),
        idlePatrol
      )
    );
  }

  private _phase1Aggro() {
    const pauseAfterAction = Debounce(
      this.pauseTime,
      Sequence(CancelPathFollowing(), Wait(1500))
    );

    return Sequence(
      IsAggroed(),
      SetMotionCapabilities({ groundSpeed: 1.2 * this.speed }),
      Selector(
        Debounce(
          this.blockCooldown,
          Sequence(
            IsAggroedEntityInFront(Math.PI / 4, this.blockRange),
            IsAggroedEntityAttacking(),
            CancelPathFollowing(),
            Do(() => {
              this.isBlocking = true;
            }),
            this._blockAndCharge(),
            pauseAfterAction
          )
        ),
        this._randomCharge(),
        MemoSelector(this._swordAttack(), pauseAfterAction),
        ChaseAggroedEntity()
      )
    );
  }

  private _swordAttack() {
    return Debounce(
      this.swordCooldown,
      Sequence(
        IsAggroedEntityInFront(Math.PI / 4, this.swordRange),
        CancelPathFollowing(),
        ScopeWithAnimation<BeeQueenAnimation>(
          this.swordAttackAnim,
          Sequence(
            WaitForAnimationFrame(5),
            SpawnHitArea({
              shape: { type: HitAreaShape.Circle, radius: 1.2 },
              sourceEntity: this,
              offset: new Vector2(1.5, 0),
              damage: this.swordDamage,
              damageType: DamageType.Blunt,
              hitImpulse: this.swordImpulse,
              shouldCheckLineOfSight: true
            }),
            SpawnHitArea({
              shape: { type: HitAreaShape.Circle, radius: 1.2 },
              sourceEntity: this,
              offset: new Vector2(1.5, 0),
              targetAlignment: EntityAlignment.TemporaryTerrain,
              damage: this.earthWallDamage,
              damageType: DamageType.Blunt,
              hitImpulse: new Vector2(2, 0)
            }),
            WaitForAnimationLoop()
          )
        )
      )
    );
  }

  private _chargeRush() {
    return Sequence(
      ScopeWithAnimation<BeeQueenAnimation>(
        this.chargeWindupAnim,
        WaitForAnimationLoop()
      ),
      SetMotionCapabilities({ groundSpeed: 4 * this.speed }),
      Do(() => this._beginCharge()),
      ScopeWithAnimation<BeeQueenAnimation>(
        this.chargeLoopAnim,
        ParallelSelector(
          ProximityHitOnce({
            damage: this.shieldChargeDamage,
            damageType: DamageType.Blunt,
            impulse: this.shieldChargeImpulse,
            range: 2.5
          }),
          Wait(1500)
        )
      ),
      Do(() => this._endCharge())
    );
  }

  private _blockAndCharge() {
    const node = ScopeWithAnimation<BeeQueenAnimation>(
      this.blockAnim,
      Sequence(
        WaitForAnimationLoop(),
        Selector(
          // Shield charge if player keeps attacking
          Sequence(
            Inverter(
              Timeout(
                this.shieldLungeDelayMs,
                WaitWhileAggroedEntityAttacking(500)
              )
            ),
            Do(() => {
              this.isBlocking = false;
            }),
            this._chargeRush()
          ),
          // End block when player stops attacking
          Do(() => {})
        )
      )
    );

    const originalReset = node.reset.bind(node);
    node.reset = () => {
      originalReset();
      this.isBlocking = false;
      if (this.isCharging) this._endCharge();
    };
    return node;
  }

  private _randomCharge() {
    const node = Sequence(
      IsAggroedEntityInFront(Math.PI / 4, this.chargeRange),
      Inverter(IsAggroedEntityInFront(Math.PI / 2, this.swordRange)),
      Execute((data) =>
        this._shouldStartCharge(data.totalMs)
          ? AIResult.Succeeded
          : AIResult.Failed
      ),
      CancelPathFollowing(),
      Do(() => this._faceAggroTarget()),
      this._chargeRush(),
      Do((data) => {
        this._nextChargeRollMs = data.totalMs + this.chargeCooldownMs;
      })
    );

    const originalReset = node.reset.bind(node);
    node.reset = () => {
      originalReset();
      if (this.isCharging) this._endCharge();
    };
    return node;
  }

  private _shouldStartCharge(totalMs: number): boolean {
    if (totalMs < this._nextChargeRollMs) return false;
    this._nextChargeRollMs = totalMs + this.chargeRollIntervalMs;
    return Math.random() < this.chargeChance;
  }

  private _faceAggroTarget(): void {
    const target = this.behaviors.aggro.resolveCurrentTarget();
    if (!target) return;
    this.behaviors.animation.facingDirection =
      target.position.x > this.position.x
        ? SpriteFacingDirection.RIGHT
        : SpriteFacingDirection.LEFT;
  }
}
