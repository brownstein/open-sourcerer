import { ProtoSpriteSheetThree } from "protosprite-three";
import { Object3D, Vector2 } from "three";

import { AINodeData, AIResult } from "src/api/ai";
import { EntityAlignment, EntityProps } from "src/api/entity";
import { EnemyProps } from "src/api/enemy";
import {
  enemyCollisionGroup,
  inactiveEnemyCollisionGroup,
  terrainSensorCollisionGroup
} from "src/engine/constants/collisionGroups";
import { kInvPixelScale, kPixelScale } from "src/engine/constants/scaling";
import { AIBehaviorTree } from "src/engine/entity/AIBehaviorTree";
import {
  Do,
  Execute,
  Inverter,
  ParallelSelector,
  Repeater,
  Selector,
  Sequence,
  Setup,
  Verify,
  WaitUntilSuccess
} from "src/engine/entity/AICoreNodes";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import { addResourceLoader, getResource } from "src/engine/entity/decorators";
import { ProtoSpriteLoader } from "src/engine/loader/Loaders";
import { vector2To3, vector3To2 } from "src/engine/util/vecTypes";
import { CancelPathFollowing } from "src/entities/shared/aiNodes/consumerNodes/AICancelPathFollowingNode";
import { CreateEntity } from "src/entities/shared/aiNodes/consumerNodes/AICreateEntityNode";
import { DisableCharacterPhysics } from "src/entities/shared/aiNodes/consumerNodes/AIDisableCharacterPhysicsNode";
import { DisablePathFollowing } from "src/entities/shared/aiNodes/consumerNodes/AIDisablePathFollowingNode";
import { HasBeenHit } from "src/entities/shared/aiNodes/consumerNodes/AIHasBeenHitNode";
import { IsDead } from "src/entities/shared/aiNodes/consumerNodes/AIIsDeadNode";
import { RemoveFromLevel } from "src/entities/shared/aiNodes/consumerNodes/AIRemoveFromLevelNode";
import { SetCharacterCollisionGroup } from "src/entities/shared/aiNodes/consumerNodes/AISetCharacterCollisionGroupNode";
import { SetMotionCapabilities } from "src/entities/shared/aiNodes/consumerNodes/AISetMotionCapabilitiesNode";
import { SetPhysicsAnimations } from "src/entities/shared/aiNodes/consumerNodes/AISetPhysicsAnimationsNode";
import { WaitForAnimationLoop } from "src/entities/shared/aiNodes/consumerNodes/AIWaitForAnimationLoopNode";
import { WaitForCompositeAnimationFrame } from "src/entities/shared/aiNodes/consumerNodes/AIWaitForCompositeAnimationFrameNode";
import { ChasePlayer } from "src/entities/shared/aiNodes/consumerNodes/subtrees/AIChasePlayerNode";
import { GroundPatrol } from "src/entities/shared/aiNodes/consumerNodes/subtrees/AIGroundPatrolNode";
import { IsAggroedWithPlayer } from "src/entities/shared/aiNodes/consumerNodes/subtrees/AIIsAggroedWithPlayerNode";
import { ScopeWithAnimation } from "src/entities/shared/aiNodes/decoratorNodes/AIScopeWithAnimationNode";
import { ScopeWithCompositeAnimation } from "src/entities/shared/aiNodes/decoratorNodes/AIScopeWithCompositeAnimationNode";
import { AIBehavior } from "src/entities/shared/behaviors/AIBehavior";
import {
  APIAnimationData,
  APIPhysicsAnimationData,
  AnimationControlBehavior,
  AnimationPriority,
  SpriteFacingDirection
} from "src/entities/shared/behaviors/AnimationControlBehavior";
import { CentralDataStoreBehavior } from "src/entities/shared/behaviors/CentralDataStoreBehavior";
import { CharacterGroundPhysicsControlBehaviorStandard } from "src/entities/shared/behaviors/CharacterGroundPhysicsController";
import { CharacterPhysicsBehavior } from "src/entities/shared/behaviors/CharacterPhysics";
import { CollisionDamageBehavior } from "src/entities/shared/behaviors/CollisionDamageBehavior";
import { EnemyAggroBehavior } from "src/entities/shared/behaviors/EnemyAggroBehavior";
import { MotionCapabilitiesBehavior } from "src/entities/shared/behaviors/MotionCapabilities";
import { NavPathFollowingBehavior } from "src/entities/shared/behaviors/NavPathFollowingBehavior";
import { NavigationObstacleBehavior } from "src/entities/shared/behaviors/NavigationObstacle";
import { OutOfBoundsBehaviour } from "src/entities/shared/behaviors/OutOfBoundsBehaviour";
import { PerceptionBehavior } from "src/entities/shared/behaviors/Perception";
import { StatusBehavior } from "src/entities/shared/behaviors/StatusBehavior";
import { VelocityRotationBehavior } from "src/entities/shared/behaviors/VelocityRotationBehavior";
import { isLineOfSightClear } from "src/entities/shared/lineOfSight";
import { Fireball } from "src/entities/spells/projectiles/Fireball";

import {
  ForestBotAnimation,
  ForestBotLayer
} from "../sprites/forest-bot/forest-bot";
import forestBotPrs from "../sprites/forest-bot/forest-bot.prs";

export type ForestBotProps = EntityProps & EnemyProps;

const kGunOffset = new Vector2(40, -1).multiplyScalar(kInvPixelScale);

@addResourceLoader(new ProtoSpriteLoader("forestBotSheet", forestBotPrs))
export class ForestBot extends CoreEntity {
  static readonly type = "ForestBot";
  public readonly type = ForestBot.type;

  public readonly alignment = EntityAlignment.Enemy;
  public readonly size = {
    width: 0.969,
    height: 1.5
  };

  public object3D = new Object3D();
  public sprite = getResource<ProtoSpriteSheetThree>(
    ForestBot,
    "forestBotSheet"
  ).getSprite<ForestBotLayer, ForestBotAnimation>();

  /*
   * AI CONFIGURATION
   */

  private readonly patrolSpeed = 1;
  private readonly chaseSpeed = 4;
  private readonly projectileSpeed = 15;
  private readonly projectileDamage: number = 2;
  private readonly burstCount = 4;
  private readonly shootingRange = 8;
  private readonly shootingLosDelayMs = 1000;
  private readonly minPatrolDistance = 2;
  private readonly maxPatrolDistance = 4;

  private readonly walkAnimationData: APIPhysicsAnimationData<ForestBotAnimation> =
    {
      tagName: "walk",
      priorityLevel: AnimationPriority.PHYSICS
    };

  private readonly deathAnimationData: APIAnimationData<ForestBotAnimation> = {
    tagName: "death",
    isLooping: false,
    priorityLevel: AnimationPriority.CRITICAL
  };

  private readonly buriedAnimationData: APIAnimationData<ForestBotAnimation> = {
    tagName: "buried",
    startFrame: 0,
    endFrame: 0,
    isLooping: false,
    priorityLevel: AnimationPriority.ACTION
  };

  private readonly riseAnimationData: APIAnimationData<ForestBotAnimation> = {
    tagName: "buried",
    isLooping: false,
    priorityLevel: AnimationPriority.ACTION
  };

  private readonly readyshotInAnimationData: APIAnimationData<ForestBotAnimation> =
    {
      tagName: "readyshot",
      isLooping: false,
      priorityLevel: AnimationPriority.ACTION
    };

  private readonly readyshotOutAnimationData: APIAnimationData<ForestBotAnimation> =
    {
      tagName: "readyshot",
      isLooping: false,
      speedScaler: -1,
      priorityLevel: AnimationPriority.ACTION
    };

  private readonly frontArmShotAnimationData: APIAnimationData<ForestBotAnimation> =
    {
      tagName: "shot",
      priorityLevel: AnimationPriority.ACTION
    };

  private readonly backArmShotAnimationData: APIAnimationData<ForestBotAnimation> =
    {
      tagName: "shot",
      startingOffset: 2,
      priorityLevel: AnimationPriority.ACTION
    };

  private readonly bodyShotAnimationData: APIAnimationData<ForestBotAnimation> =
    {
      tagName: "shot",
      speedScaler: 2,
      priorityLevel: AnimationPriority.ACTION
    };

  private readonly bodyRecoilAnimationData: APIAnimationData<ForestBotAnimation> =
    {
      tagName: "shot",
      startFrame: 2,
      endFrame: 2,
      isLooping: false,
      priorityLevel: AnimationPriority.ACTION
    };

  public behaviors = {
    motionCapabilities: new MotionCapabilitiesBehavior()
      .setJump(true, null, 4.5)
      .setSpeedLimits(this.patrolSpeed),
    physics: new CharacterPhysicsBehavior().setGroup(
      inactiveEnemyCollisionGroup
    ),
    collision: new CollisionDamageBehavior(1, 6),
    physicsControl:
      new CharacterGroundPhysicsControlBehaviorStandard().setSensorCollisionGroup(
        terrainSensorCollisionGroup
      ),
    pathFollowing: new NavPathFollowingBehavior().setRetries(0),
    status: new StatusBehavior().setMaxHealth(25),
    navigationObstacle: new NavigationObstacleBehavior(),
    perception: new PerceptionBehavior({
      spreadAngle: Math.PI / 3,
      sightDistance: 8,
      nearbyDistance: 0,
      farDistance: 0,
      trackingTimeoutMs: 3000
    }),
    aggro: new EnemyAggroBehavior({
      aggroOnSight: true,
      loseAggroWithoutSight: true,
      aggroCooldown: 1000
    }),
    data: new CentralDataStoreBehavior(),
    animation: new AnimationControlBehavior<ForestBotAnimation>({
      idle: {
        tagName: "idle",
        priorityLevel: AnimationPriority.PHYSICS
      },
      walk: {
        ...this.walkAnimationData
      },
      preJump: {
        tagName: "jump",
        startFrame: 0,
        endFrame: 3,
        isLooping: false,
        priorityLevel: AnimationPriority.PHYSICS
      },
      jumpRising: {
        tagName: "jump",
        startFrame: 4,
        endFrame: 4,
        isLooping: false,
        priorityLevel: AnimationPriority.PHYSICS
      },
      jumpFalling: {
        tagName: "jump",
        startFrame: 5,
        endFrame: 7,
        isLooping: false,
        priorityLevel: AnimationPriority.PHYSICS
      },
      falling: {
        tagName: "jump",
        startFrame: 5,
        endFrame: 7,
        isLooping: false,
        priorityLevel: AnimationPriority.PHYSICS
      },
      postJump: {
        tagName: "jump",
        startFrame: 8,
        endFrame: 9,
        isLooping: false,
        priorityLevel: AnimationPriority.PHYSICS
      }
    }),
    ai: new AIBehavior(),
    velocityRotation: new VelocityRotationBehavior(),
    outOfBounds: new OutOfBoundsBehaviour()
  };

  private continuousLosMs = 0;

  // Arm composite sprite instances (cloned from main sprite)
  private frontArmSprite = this.sprite.clone();
  private backArmSprite = this.sprite.clone();

  // Body arm layer names that get hidden during attack
  private readonly bodyArmLayers: ForestBotLayer[] = [
    "front_arm_group",
    "back_arm",
    "back_gun"
  ];

  constructor(props: ForestBotProps) {
    super(props);
    this.projectileDamage = props.attack ? props.attack : this.projectileDamage;

    this.object3D.position
      .copy(this.position)
      .multiplyScalar(kPixelScale)
      .round()
      .multiplyScalar(kInvPixelScale);

    this.sprite.gotoAnimation("idle");
    this.sprite.center();
    this.sprite.gotoAnimation("buried");

    this.sprite.mesh.scale.multiplyScalar(kInvPixelScale);
    this.sprite.mesh.scale.y *= -1;

    // Configure arm sprites: hide all non-arm layers
    this.frontArmSprite.center();
    this.frontArmSprite.mesh.scale.multiplyScalar(kInvPixelScale);
    this.frontArmSprite.mesh.scale.y *= -1;
    this.frontArmSprite.hideLayers(
      "back_arm",
      "back_gun",
      "back_shoulder",
      "back_leg",
      "back_foot",
      "head",
      "pelvis",
      "front_leg",
      "body",
      "front_foot",
      "light_guns",
      "smear_under",
      "light",
      "gunshot_fx",
      "tracking_pixels",
      "tracking_back",
      "tracking_front"
    );
    this.frontArmSprite.mesh.position.z = 0.5;
    this.frontArmSprite.mesh.visible = false;

    this.backArmSprite.center();
    this.backArmSprite.mesh.scale.multiplyScalar(kInvPixelScale);
    this.backArmSprite.mesh.scale.y *= -1;
    this.backArmSprite.hideLayers(
      "front_arm_group",
      "front_arm",
      "front_shoulder",
      "front_gun",
      "head",
      "pelvis",
      "front_leg",
      "body",
      "front_foot",
      "back_leg",
      "back_foot",
      "light_guns",
      "smear_top",
      "light",
      "gunshot_fx",
      "tracking_pixels",
      "tracking_back",
      "tracking_front"
    );
    this.backArmSprite.mesh.position.z = -0.5;
    this.backArmSprite.mesh.visible = false;

    // Hide non-rendering layers on main sprite
    this.sprite.hideLayers(
      "tracking_pixels",
      "gunshot_fx",
      "light_guns",
      "smear_top",
      "smear_under"
    );

    this.object3D.add(this.sprite.mesh);
    this.object3D.add(this.frontArmSprite.mesh);
    this.object3D.add(this.backArmSprite.mesh);

    // Initialize behaviors
    this.behaviors.motionCapabilities.init(this);
    this.behaviors.physics.init(this);
    this.behaviors.collision.init(this);
    this.behaviors.physicsControl
      .init(this)
      .assignMotionCapabilities(this.behaviors.motionCapabilities.capabilities)
      .attachControlEvents(this.behaviors.pathFollowing.controlEvents);
    this.behaviors.status.setMaxHealth(props.health ?? 25);
    this.behaviors.status
      .init(this)
      .attachProtosSprite(this.sprite)
      .attachProtosSprite(this.frontArmSprite)
      .attachProtosSprite(this.backArmSprite);
    this.behaviors.perception
      .init(this)
      .setSourceBody(this.behaviors.physics.body);
    this.behaviors.aggro.init(this);
    this.behaviors.pathFollowing
      .init(this)
      .setMotionCapabilities(this.behaviors.motionCapabilities.capabilities)
      .setPhysicsControl(this.behaviors.physicsControl);
    this.behaviors.pathFollowing.jumpDelay = 200;
    this.behaviors.data.init(this);
    this.behaviors.velocityRotation.init(this);
    this.behaviors.animation.init(this).attachCompositeSprites({
      body: {
        sprite: this.sprite
      },
      frontArm: {
        sprite: this.frontArmSprite,
        alignmentLayer: "tracking_front",
        alignToPartName: "body"
      },
      backArm: {
        sprite: this.backArmSprite,
        alignmentLayer: "tracking_back",
        alignToPartName: "body"
      }
    });
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
    this.frontArmSprite.dispose();
    this.backArmSprite.dispose();
  }

  private _setupBehaviorTree(): void {
    const showArms = () => {
      this.frontArmSprite.mesh.visible = true;
      this.backArmSprite.mesh.visible = true;
      this.sprite.hideLayers(...this.bodyArmLayers);
    };

    const hideArms = () => {
      this.frontArmSprite.mesh.visible = false;
      this.backArmSprite.mesh.visible = false;
      this.behaviors.animation.setPartRotation("frontArm", 0);
      this.behaviors.animation.setPartRotation("backArm", 0);
      this.sprite.showLayers(...this.bodyArmLayers);
    };

    const computeArmAngle = (data: AINodeData): number => {
      if (!data.player) return 0;

      const dir = data.player.position.clone().sub(this.position);
      let angle = vector3To2(dir).angle();
      if (isFacingLeft()) angle += Math.PI;
      return angle;
    };

    const canShootPlayer = (data: AINodeData): boolean => {
      if (!data.player) return false;

      const dx = data.player.position.x - this.position.x;
      const dy = data.player.position.y - this.position.y;
      if (dx * dx + dy * dy > this.shootingRange * this.shootingRange)
        return false;
      return isLineOfSightClear(
        data.level,
        this.position.x,
        this.position.y,
        data.player.position.x,
        data.player.position.y,
        this.behaviors.physics.body
      );
    };

    /**
     * Updates the continuous LOS timer. Call once per tick while aggroed.
     * Increments while the player is in shooting range + LOS, resets otherwise.
     */
    const updateShootingLosTimer = (data: AINodeData): void => {
      if (canShootPlayer(data)) {
        this.continuousLosMs += data.deltaMs ?? 0;
      } else {
        this.continuousLosMs = 0;
      }
    };

    const resetShootingLosTimer = (): void => {
      this.continuousLosMs = 0;
    };

    /** Requires sustained LOS before allowing the bot to enter shooting state. */
    const canBeginShooting = (): boolean => {
      return this.continuousLosMs >= this.shootingLosDelayMs;
    };

    const isFacingLeft = () =>
      this.behaviors.animation.facingDirection === SpriteFacingDirection.LEFT;

    const spawnFireball = (armPartName: "frontArm" | "backArm") => {
      const trackingLayer =
        armPartName === "frontArm" ? "tracking_front" : "tracking_back";
      const facingLeft = isFacingLeft();

      const offset = kGunOffset.clone();
      if (facingLeft) offset.x *= -1;
      offset.y *= -1;

      const armRotation =
        this.behaviors.animation.getPartRotation(armPartName) ?? 0;
      offset.rotateAround(new Vector2(), armRotation);

      const trackingBounds = this.sprite.getLayerBounds(trackingLayer);
      const trackingPos = new Vector2();
      trackingBounds.getCenter(trackingPos);
      if (facingLeft) trackingPos.x *= -1;
      trackingPos.y *= -1;
      trackingPos.multiplyScalar(kInvPixelScale);
      offset.add(trackingPos);

      const vel = new Vector2(this.projectileSpeed, 0).rotateAround(
        new Vector2(),
        armRotation
      );
      if (facingLeft) vel.multiplyScalar(-1);

      const projectile = new Fireball({
        position: vector2To3(offset).add(this.position).setZ(2)
      });
      projectile.ignoreEntity(this.id);
      projectile.setVelocity(vel);
      projectile.setGravity(0);
      projectile.damage = this.projectileDamage;
      projectile.setSourceEntity(this);

      return projectile;
    };

    const applyBodyRecoil = () => {
      this.behaviors.animation.requestOverride(this.bodyRecoilAnimationData, {
        targetParts: ["body"]
      });
    };

    // prettier-ignore
    this.behaviors.ai
    .init(this)
    .behaviorTree = new AIBehaviorTree(
      Selector(
        // Priority 1: Handle death (custom — hides arms before dying)
        Sequence(
          IsDead(),
          Do(() => hideArms()),
          DisableCharacterPhysics(),
          DisablePathFollowing(),
          ScopeWithAnimation<ForestBotAnimation>(this.deathAnimationData,
            Sequence(
              WaitForAnimationLoop(),
              RemoveFromLevel()
            )
          )
        ),

        // Priority 2: One-time buried → rise sequence
        Inverter(
          Setup(
            Sequence(
              // Hold on buried frame until aggro'd or hit
              ScopeWithAnimation<ForestBotAnimation>(this.buriedAnimationData,
                WaitUntilSuccess(
                  Selector(
                    IsAggroedWithPlayer(),
                    HasBeenHit()
                  )
                )
              ),
              // Play rise animation
              ScopeWithAnimation<ForestBotAnimation>(this.riseAnimationData,
                WaitForAnimationLoop()
              ),
              // Activate collision
              SetCharacterCollisionGroup(enemyCollisionGroup)
            )
          )
        ),

        // Priority 3: Aggroed — shoot then chase
        Sequence(
          IsAggroedWithPlayer(),
          SetMotionCapabilities({ groundSpeed: this.chaseSpeed }),
          SetPhysicsAnimations({
            walk: {
              ...this.walkAnimationData,
              speedScaler: this.chaseSpeed / this.patrolSpeed
            }
          }),
          Selector(
            // Try to stand and shoot (only after sustained line-of-sight)
            Sequence(
              Do(updateShootingLosTimer),
              Verify(() => canBeginShooting()),
              CancelPathFollowing(),
              // Transition in: readyshot forward on all parts, show arm sprites
              Do(() => showArms()),
              ScopeWithCompositeAnimation<ForestBotAnimation>(
                this.readyshotInAnimationData,
                ["body", "frontArm", "backArm"],
                WaitForAnimationLoop(),
                { mirrorToIdleParts: false }
              ),
              // Shooting phase: arms fire in bursts
              ScopeWithCompositeAnimation<ForestBotAnimation>(
                this.bodyShotAnimationData,
                ["body"],
                ScopeWithCompositeAnimation<ForestBotAnimation>(
                  this.frontArmShotAnimationData,
                  ["frontArm"],
                  ScopeWithCompositeAnimation<ForestBotAnimation>(
                    this.backArmShotAnimationData,
                    ["backArm"],
                    Sequence(
                      Repeater(this.burstCount, AIResult.Failed,
                        Sequence(
                          Execute((data: AINodeData) => {
                              const isAbleToShootPlayer = canShootPlayer(data);
                              return isAbleToShootPlayer ? AIResult.Succeeded : AIResult.Failed;
                          }),
                          ParallelSelector(
                            // Continuously update arm rotation to track player
                            Execute((data: AINodeData) => {
                              const angle = computeArmAngle(data);
                              this.behaviors.animation.setPartRotation("frontArm", angle);
                              this.behaviors.animation.setPartRotation("backArm", angle);
                              return AIResult.Running;
                            }),
                            // Fire sequence: front arm fires at frame 2, then back arm fires at frame 2
                            Sequence(
                              WaitForCompositeAnimationFrame("frontArm", 2),
                              CreateEntity(() => spawnFireball("frontArm")),
                              Do(() => applyBodyRecoil()),
                              WaitForCompositeAnimationFrame("backArm", 2),
                              CreateEntity(() => spawnFireball("backArm")),
                              Do(() => applyBodyRecoil()),
                              WaitForAnimationLoop()
                            )
                          )
                        )
                      ),
                      // Restore body override reference so the parent scope's
                      // clearOverride matches (bodyRecoilAnimationData may have replaced it)
                      Do(() => {
                        this.behaviors.animation.requestOverride(
                          this.bodyShotAnimationData,
                          { targetParts: ["body"] }
                        );
                      })
                    )
                  )
                )
              ),
              // Transition out: readyshot backward on all parts, hide arm sprites
              ScopeWithCompositeAnimation<ForestBotAnimation>(
                this.readyshotOutAnimationData,
                ["body", "frontArm", "backArm"],
                WaitForAnimationLoop(),
                { mirrorToIdleParts: false }
              ),
              Do(() => hideArms())
            ),
            // Fallback: chase player (clean up any stale animation overrides
            // and arm state from an interrupted shooting sequence)
            Sequence(
              Do(() => {
                this.behaviors.animation.clearAllOverrides();
                hideArms();
              }),
              ChasePlayer()
            )
          )
        ),

        // Priority 4: Idle patrol
        Sequence(
          Do(() => resetShootingLosTimer()),
          SetMotionCapabilities({ groundSpeed: this.patrolSpeed }),
          SetPhysicsAnimations({
            walk: {
              ...this.walkAnimationData,
              speedScaler: 1.0
            }
          }),
          GroundPatrol(this.minPatrolDistance, this.maxPatrolDistance, 1500)
        )
      )
    );
  }
}
