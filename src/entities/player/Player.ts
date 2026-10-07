import { Color, Object3D, Vector2, Vector3 } from "three";

import { AIResult } from "src/api/ai";
import {
  CharacterCustomization,
  PlayerRenderMode
} from "src/api/characterCustomization";
import { ControlEvents } from "src/api/controls";
import {
  BaseEntityType,
  ElementalType,
  EntityAlignment,
  EntityHitDetails,
  EntityLevelAPI,
  EntityLifecycleEventTypes,
  EntityProps
} from "src/api/entity";
import { BouncableEntityAPI } from "src/api/entityInteractions";
import {
  CasterEntityCastProps,
  DoCastDeferredEmitter,
  createCastDeferredEmitter
} from "src/api/entitySpellCasting";
import { SoundAPI, SoundType } from "src/api/sound";
import { SpellCtx, SpellCtxConsoleLogLine, SpellsAPI } from "src/api/spells";
import { createTypedEventEmitter } from "src/api/util";
import {
  noClipCollisionGroup,
  playerCollisionGroup,
  terrainSensorCollisionGroup
} from "src/engine/constants/collisionGroups";
import { kInvPixelScale, kPixelScale } from "src/engine/constants/scaling";
import { AIBehaviorTree } from "src/engine/entity/AIBehaviorTree";
import {
  Do,
  Execute,
  MemoSelector,
  Selector,
  Sequence,
  Succeeder,
  Timeout,
  Verify,
  Wait,
  WaitUntilSuccess
} from "src/engine/entity/AICoreNodes";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import {
  getAsset,
  setAssetDependencies,
  setConsumerDependencies
} from "src/engine/entity/decorators";
import { kWorldGravity } from "src/engine/level/Level";
import { PositionalSound } from "src/engine/sound/Sound";
import { DeferredEmitter } from "src/engine/util/deferredEmitter";
import { selectNoClipEnabled } from "src/redux/dev/selectors";
import {
  selectEquippedWeapon,
  selectHasSword
} from "src/redux/inventory/selectors";
import { EquippedWeaponTypes } from "src/redux/inventory/slice";
import {
  selectCharacterCustomization,
  selectCutsceneLocked,
  selectHealth,
  selectIsDead,
  selectMana,
  selectManaRechargeRatePerSecond,
  selectMaxHealth,
  selectMaxMana,
  selectPlayerRenderMode
} from "src/redux/status/selectors";
import {
  incrementHealth,
  incrementMana,
  setCutsceneLocked,
  setLastElementalHitType
} from "src/redux/status/slice";
import { store } from "src/redux/store";
import type { EntityNetSummary } from "src/multiplayer/api";

import { TextPixelated } from "../environment/TextPixelated";
import { AnimatedHitRegion } from "../shared/AnimatedHitRegion";
import { HitArea, HitAreaShape } from "../shared/HitArea";
import { ConsumeControlInput } from "../shared/aiNodes/consumerNodes/AIConsumeControlInputNode";
import { DisableCharacterPhysics } from "../shared/aiNodes/consumerNodes/AIDisableCharacterPhysicsNode";
import { SetPhysicsAnimations } from "../shared/aiNodes/consumerNodes/AISetPhysicsAnimationsNode";
import { WaitForAnimationFrame } from "../shared/aiNodes/consumerNodes/AIWaitForAnimationFrameNode";
import { WaitForAnimationLoop } from "../shared/aiNodes/consumerNodes/AIWaitForAnimationLoopNode";
import { ScopeWithCompositeAnimation } from "../shared/aiNodes/decoratorNodes/AIScopeWithCompositeAnimationNode";
import { AIBehavior } from "../shared/behaviors/AIBehavior";
import {
  APIAnimationData,
  APIPhysicsAnimationData,
  AnimationControlBehavior,
  AnimationPriority
} from "../shared/behaviors/AnimationControlBehavior";
import { CallbackTriggerManagerBehavior } from "../shared/behaviors/CallbackTriggerManagerBehavior";
import { CentralDataStoreBehavior } from "../shared/behaviors/CentralDataStoreBehavior";
import {
  CharacterGroundPhysicsControlBehavior,
  CharacterGroundPhysicsControlBehaviorEvents
} from "../shared/behaviors/CharacterGroundPhysicsController";
import {
  CharacterPhysicsBehavior,
  CharacterPhysicsEvents
} from "../shared/behaviors/CharacterPhysics";
import { FallDamageBehavior } from "../shared/behaviors/FallDamageBehavior";
import { InteractionConsumerBehavior } from "../shared/behaviors/InteractionConsumerBehavior";
import { MotionCapabilitiesBehavior } from "../shared/behaviors/MotionCapabilities";
import {
  NavPathFollowingBehavior,
  PathFollowingBehaviorEvents
} from "../shared/behaviors/NavPathFollowingBehavior";
import { OutOfBoundsBehaviour } from "../shared/behaviors/OutOfBoundsBehaviour";
import { SpellExecutionListenerBehavior } from "../shared/behaviors/SpellExecutionListenerBehavior";
import { StatusBehavior } from "../shared/behaviors/StatusBehavior";
import { VFXManagerBehavior } from "../shared/behaviors/VFXManagerBehavior";
import { isCommonTerrain } from "../terrain/commonTerrainApi";
import { InteractionProvider, PlayerAPI, isPlayerAPI } from "./PlayerAPI";
import {
  PlayerAnimation,
  PlayerSprite,
  SpellsSprite,
  customizePlayerSprite,
  customizePlayerSpriteColors,
  kParryWindowEnd,
  kParryWindowStart,
  kPlayerCastEndFrame,
  kPlayerCastFrame,
  kPlayerCastHoldEnd,
  kPlayerCastHoldStart
} from "./PlayerInternals";
import { SpellSpriteSyncBehavior } from "./SpellSpriteSyncBehavior";
import { SwordGeometryHelper } from "./SwordGeometryHelper";
import {
  PlayerDustAnimation,
  PlayerDustLayer
} from "./sprites/player-dust-types";
import * as spellTypes from "./sprites/wolf-spells";

export type PlayerProps = EntityProps & {
  disableCamera?: boolean;
  /** Preview players (the customizer) always render their real colors. */
  ignoreRenderMode?: boolean;
};

export type PlayerEventTypes = {
  SwordSwing: void;
  ParryStart: void;
  SwordUnsheathed: void;
  SwordSheathed: boolean;
  CastStart: [castSpeed: number, elementalType: ElementalType | undefined];
  CastHoldStart: ElementalType | undefined;
  CastHoldEnd: ElementalType | undefined;
  CastEnd: ElementalType | undefined;
};

type CastQueueItem = {
  castProps: CasterEntityCastProps;
  deferred: DoCastDeferredEmitter;
  holdTriggered: boolean;
  holdAborted: boolean;
};

@setAssetDependencies(() => [
  "wolfMaleSprite",
  "wolfFemaleSprite",
  "wolfSpells",
  "playerDustSprite",
  "wolfMaleGeometry",
  "wolfFemaleGeometry",
  "playerJumpSound",
  "playerFallSound",
  "playerStep1Sound",
  "playerStep2Sound",
  "playerStep3Sound",
  "playerStep4Sound",
  "playerSword1Sound",
  "playerSword2Sound",
  "playerSword3Sound",
  "playerSword4Sound",
  "hit1Sound",
  "hit2Sound",
  "hit3Sound",
  "hit4Sound",
  "heal1Sound",
  "waterSplashLowSound",
  "waterSplashHighSound",
  "generalMagicStartSound",
  "generalMagicLoopSound",
  "generalMagicEndSound",
  "fireMagicStartSound",
  "fireMagicLoopSound",
  "fireMagicEndSound",
  "iceMagicStartSound",
  "iceMagicLoopSound",
  "iceMagicEndSound",
  "windMagicStartSound",
  "windMagicLoopSound",
  "windMagicEndSound",
  "electricityMagicStartSound",
  "electricityMagicLoopSound",
  "electricityMagicEndSound"
])
@setConsumerDependencies(() => [TextPixelated])
export class Player
  extends CoreEntity
  implements PlayerAPI, BouncableEntityAPI
{
  static type = "Player";
  public type = Player.type;

  // Flag used by isPlayerAPI type guard.
  public _isPlayer = true;

  // Engine properties.
  public object3D = new Object3D();
  public persist = false;
  public children: BaseEntityType[] = [];
  public alignment = EntityAlignment.Player;
  public dead = false;
  override get canBindToVariable() {
    return true;
  }

  public events = createTypedEventEmitter<
    EntityLifecycleEventTypes & PlayerEventTypes
  >();

  /*
   * AI ANIMATION DATA
   */

  private readonly defaultIdleAnimation: APIPhysicsAnimationData<PlayerAnimation> =
    { tagName: "idle", priorityLevel: AnimationPriority.PHYSICS };
  private readonly defaultWalkAnimation: APIPhysicsAnimationData<PlayerAnimation> =
    { tagName: "run", priorityLevel: AnimationPriority.PHYSICS };
  private readonly swordIdleAnimation: APIPhysicsAnimationData<PlayerAnimation> =
    { tagName: "idle_sword_front", priorityLevel: AnimationPriority.PHYSICS };
  private readonly swordWalkAnimation: APIPhysicsAnimationData<PlayerAnimation> =
    { tagName: "run_sword", priorityLevel: AnimationPriority.PHYSICS };
  private readonly jumpRisingAnimation: APIPhysicsAnimationData<PlayerAnimation> =
    {
      tagName: "ascend",
      priorityLevel: AnimationPriority.PHYSICS,
      isLooping: false
    };
  private readonly jumpFallingAnimation: APIPhysicsAnimationData<PlayerAnimation> =
    {
      tagName: "reach_peak",
      priorityLevel: AnimationPriority.PHYSICS,
      isLooping: false
    };
  private readonly fallingAnimation: APIPhysicsAnimationData<PlayerAnimation> =
    {
      tagName: "descend",
      priorityLevel: AnimationPriority.PHYSICS,
      isLooping: false
    };
  private readonly climbingAnimation: APIPhysicsAnimationData<PlayerAnimation> =
    { tagName: "climb", priorityLevel: AnimationPriority.PHYSICS };
  private readonly swimmingAnimation: APIPhysicsAnimationData<PlayerAnimation> =
    { tagName: "swim", priorityLevel: AnimationPriority.PHYSICS };

  private readonly deathAnimationData: APIAnimationData<PlayerAnimation> = {
    tagName: "death",
    priorityLevel: AnimationPriority.CRITICAL,
    isLooping: false
  };
  private readonly chestAnimationData: APIAnimationData<PlayerAnimation> = {
    tagName: "chest",
    priorityLevel: AnimationPriority.CRITICAL,
    isLooping: false
  };
  private readonly unsheathAnimationData: APIAnimationData<PlayerAnimation> = {
    tagName: "unsheath",
    priorityLevel: AnimationPriority.ACTION,
    startFrame: 4,
    endFrame: 8,
    speedScaler: 2,
    isLooping: false
  };
  private readonly sheathAnimationData: APIAnimationData<PlayerAnimation> = {
    tagName: "sheath",
    priorityLevel: AnimationPriority.ACTION,
    startFrame: 3,
    endFrame: 10,
    speedScaler: 2,
    isLooping: false
  };
  private readonly quickSheathAnimationData: APIAnimationData<PlayerAnimation> =
    {
      tagName: "sheath",
      priorityLevel: AnimationPriority.ACTION,
      startFrame: 3,
      endFrame: 10,
      speedScaler: 7,
      isLooping: false
    };
  private readonly parryAnimationData: APIAnimationData<PlayerAnimation> = {
    tagName: "parry",
    startFrame: 1,
    priorityLevel: AnimationPriority.ACTION,
    isLooping: false
  };
  private readonly swing1AnimationData: APIAnimationData<PlayerAnimation> = {
    tagName: "swing_1",
    startFrame: 1,
    priorityLevel: AnimationPriority.ACTION,
    isLooping: false
  };
  private readonly counterattackAnimationData: APIAnimationData<PlayerAnimation> =
    {
      tagName: "swing_1",
      priorityLevel: AnimationPriority.ACTION,
      startFrame: 1,
      speedScaler: 2,
      isLooping: false
    };
  private readonly swing2AnimationData: APIAnimationData<PlayerAnimation> = {
    tagName: "swing_2",
    priorityLevel: AnimationPriority.ACTION,
    isLooping: false
  };
  private readonly spellAnimationData: APIAnimationData<PlayerAnimation> = {
    tagName: "spell",
    startFrame: 1,
    priorityLevel: AnimationPriority.ACTION,
    isLooping: true
  };
  // Earth casts are a quick rock-kick rather than a held cast. air_rock_spell
  // is a short (6-frame) windup+kick whose frames are duration-matched to the
  // spells sprite's air_rock_spell, so they play in sync.
  private readonly airRockSpellAnimationData: APIAnimationData<PlayerAnimation> =
    {
      tagName: "air_rock_spell",
      priorityLevel: AnimationPriority.ACTION,
      isLooping: false
    };
  // On-ladder combat animations (used while climbing).
  private readonly attackLadderAnimationData: APIAnimationData<PlayerAnimation> =
    {
      tagName: "attack_ladder_step01",
      priorityLevel: AnimationPriority.ACTION,
      isLooping: false
    };
  private readonly spellLadderAnimationData: APIAnimationData<PlayerAnimation> =
    {
      tagName: "spell_ladder01",
      startFrame: 1,
      priorityLevel: AnimationPriority.ACTION,
      isLooping: true
    };
  private readonly putSwordOnBackReverseAnimationData: APIAnimationData<PlayerAnimation> =
    {
      tagName: "put_sword_on_back",
      priorityLevel: AnimationPriority.ACTION,
      speedScaler: -1,
      isLooping: false
    };

  private readonly normalWalkingSpeed = 6;
  private readonly normalClimbingSpeed = 2;
  private readonly normalSwimmingSpeed = 12;
  private readonly normalGroundAccel = 0.05;
  private readonly normalJumpHeight = 6.5;
  private readonly blockingWalkingSpeed = 2;
  private readonly blockingClimbingSpeed = 1;
  private readonly blockingJumpHeight = 2;

  // Reusable / encapsulated logic.
  public behaviors = {
    motionCapabilities: new MotionCapabilitiesBehavior()
      .setSpeedLimits(this.normalWalkingSpeed, this.normalClimbingSpeed)
      .setSwimSpeed(this.normalSwimmingSpeed)
      .setGroundAccel(this.normalGroundAccel)
      .setJump(true, null, this.normalJumpHeight),
    physics: new CharacterPhysicsBehavior(),
    physicsControl: new CharacterGroundPhysicsControlBehavior(),
    pathFollowing: new NavPathFollowingBehavior(),
    status: new StatusBehavior(),
    data: new CentralDataStoreBehavior(),
    fallDamage: new FallDamageBehavior()
      .setMaxHealth(() => selectMaxHealth(store.getState()))
      .addFallDamageThreshold(20, 0.25)
      .addFallDamageThreshold(30, 0.5)
      .addFallDamageThreshold(40, 1.0),
    outOfBounds: new OutOfBoundsBehaviour(),
    animation: new AnimationControlBehavior<PlayerAnimation>({
      idle: this.defaultIdleAnimation,
      walk: this.defaultWalkAnimation,
      jumpRising: this.jumpRisingAnimation,
      jumpFalling: this.jumpFallingAnimation,
      falling: this.fallingAnimation,
      climbing: this.climbingAnimation,
      swimming: this.swimmingAnimation
    }),
    // Drives the standalone spells sprite: plays the element-appropriate cast
    // animation once and keeps it pinned to the upper body. Declared after
    // `animation` so its Step runs after the upper sprite has been aligned.
    spellSprite: new SpellSpriteSyncBehavior(),
    interactionConsumer: new InteractionConsumerBehavior(),
    ai: new AIBehavior(),
    vfx: new VFXManagerBehavior(),
    callbackTrigger: new CallbackTriggerManagerBehavior(),
    spellListener: new SpellExecutionListenerBehavior()
  };

  public sprites: {
    upper: PlayerSprite;
    lower: PlayerSprite;
    spells: SpellsSprite;
  };

  private disableCamera: boolean;
  private unsubscribeFromStore?: () => void;
  private lastCustomization: CharacterCustomization;
  private castQueue: CastQueueItem[] = [];
  private swordGeomHelper?: SwordGeometryHelper;
  private swordAvailable = false;
  private swordEquipped = false;
  private swordNeedsUnsheatheAnim = false;
  private swordUnsheathed = false;
  private swordOnBack = false;
  private parryWindowActive = false;
  private parryCounterattackPending = false;
  private blocking = false;
  private swingHitRegion?: AnimatedHitRegion;
  private gettingItem = false;
  private wasCutsceneLocked = false;
  private renderMode = PlayerRenderMode.Normal;
  private ignoreRenderMode: boolean;
  private manaDripIntervalMs = 100;

  private isNoClip = false;

  // Track this to fine-tune sword swing and blocking timing.
  private mouseDown = false;
  private rightMouseDown = false;

  private readonly parryHitStopMs = 300;
  private readonly swordScreenShake = 0.25;
  private readonly swordHitStopMs = 100;
  private readonly blockDamageMultiplier = 0.25;
  private readonly blockImpulseMultiplier = 0.25;

  /*
   * SFX
   */

  private readonly jumpSound = new PositionalSound(
    SoundType.SFX,
    this.object3D,
    getAsset("playerJumpSound")
  )
    .setPitchVariation(120)
    .setVolume(0.25)
    .setPlaybackRate(1.2);
  private readonly fallSound = new PositionalSound(
    SoundType.SFX,
    this.object3D,
    getAsset("playerFallSound")
  ).setPitchVariation(120);
  private readonly stepSound = new PositionalSound(
    SoundType.SFX,
    this.object3D,
    getAsset("playerStep1Sound"),
    getAsset("playerStep2Sound"),
    getAsset("playerStep3Sound"),
    getAsset("playerStep4Sound")
  )
    .setPitchVariation(40)
    .setVolume(0.15);
  private readonly swordSwingSound = new PositionalSound(
    SoundType.SFX,
    this.object3D,
    getAsset("playerSword1Sound"),
    getAsset("playerSword2Sound"),
    getAsset("playerSword3Sound"),
    getAsset("playerSword4Sound")
  ).setPitchVariation(300);
  private readonly parrySound = new PositionalSound(
    SoundType.SFX,
    this.object3D,
    getAsset("playerSword1Sound"),
    getAsset("playerSword2Sound"),
    getAsset("playerSword3Sound"),
    getAsset("playerSword4Sound")
  )
    .setPlaybackRate(0.7)
    .setDetune(1000)
    .setPitchVariation(120);
  private readonly unsheatheSwordSound = new PositionalSound(
    SoundType.SFX,
    this.object3D,
    getAsset("playerSword1Sound")
  )
    .setDetune(250)
    .setPlaybackRate(1.2)
    .setVolume(0.3)
    .setPitchVariation(160);
  private readonly sheatheSwordSound = new PositionalSound(
    SoundType.SFX,
    this.object3D,
    getAsset("playerSword4Sound")
  )
    .setPlaybackRate(0.8)
    .setVolume(0.5);
  private readonly quickSheatheSwordSound = new PositionalSound(
    SoundType.SFX,
    this.object3D,
    getAsset("playerSword3Sound")
  )
    .setPlaybackRate(1.5)
    .setVolume(0.3)
    .setPitchVariation(160);
  private readonly hitSound = new PositionalSound(
    SoundType.SFX,
    this.object3D,
    getAsset("hit1Sound"),
    getAsset("hit2Sound"),
    getAsset("hit3Sound"),
    getAsset("hit4Sound")
  )
    .setPitchVariation(400)
    .setVolume(0.75);
  private readonly healSound = new PositionalSound(
    SoundType.SFX,
    this.object3D,
    getAsset("heal1Sound")
  )
    .setDetune(600)
    .setPitchVariation(600)
    .setVolume(0.15);
  private readonly waterLowSound = new PositionalSound(
    SoundType.SFX,
    this.object3D,
    getAsset("waterSplashLowSound")
  ).setVolume(0.75);
  private readonly waterJumpSound = new PositionalSound(
    SoundType.SFX,
    this.object3D,
    getAsset("waterSplashLowSound")
  )
    .setVolume(0.45)
    .setPlaybackRate(1.25)
    .setPitchVariation(400);
  private readonly waterHighSound = new PositionalSound(
    SoundType.SFX,
    this.object3D,
    getAsset("waterSplashHighSound")
  ).setVolume(0.5);
  private readonly generalCastStartSound = new PositionalSound(
    SoundType.SFX,
    this.object3D,
    getAsset("generalMagicStartSound")
  ).setPitchVariation(30);
  private readonly generalCastLoopSound = new PositionalSound(
    SoundType.SFX,
    this.object3D,
    getAsset("generalMagicLoopSound")
  )
    .setVolume(0)
    .setIsLooping(true)
    .setPitchVariation(20);
  private readonly generalCastEndSound = new PositionalSound(
    SoundType.SFX,
    this.object3D,
    getAsset("generalMagicEndSound")
  )
    .setVolume(2)
    .setPitchVariation(30);
  private readonly fireCastStartSound = new PositionalSound(
    SoundType.SFX,
    this.object3D,
    getAsset("fireMagicStartSound")
  )
    .setVolume(0.7)
    .setPitchVariation(30);
  private readonly fireCastLoopSound = new PositionalSound(
    SoundType.SFX,
    this.object3D,
    getAsset("fireMagicLoopSound")
  )
    .setVolume(0)
    .setIsLooping(true)
    .setPitchVariation(20);
  private readonly fireCastEndSound = new PositionalSound(
    SoundType.SFX,
    this.object3D,
    getAsset("fireMagicEndSound")
  )
    .setVolume(0.7)
    .setPitchVariation(30);
  private readonly iceCastStartSound = new PositionalSound(
    SoundType.SFX,
    this.object3D,
    getAsset("iceMagicStartSound")
  )
    .setVolume(0.7)
    .setPitchVariation(30);
  private readonly iceCastLoopSound = new PositionalSound(
    SoundType.SFX,
    this.object3D,
    getAsset("iceMagicLoopSound")
  )
    .setVolume(0)
    .setIsLooping(true)
    .setPitchVariation(20);
  private readonly iceCastEndSound = new PositionalSound(
    SoundType.SFX,
    this.object3D,
    getAsset("iceMagicEndSound")
  )
    .setVolume(0.7)
    .setPitchVariation(30);
  private readonly windCastStartSound = new PositionalSound(
    SoundType.SFX,
    this.object3D,
    getAsset("windMagicStartSound")
  )
    .setVolume(0.7)
    .setPitchVariation(30);
  private readonly windCastLoopSound = new PositionalSound(
    SoundType.SFX,
    this.object3D,
    getAsset("windMagicLoopSound")
  )
    .setVolume(0)
    .setIsLooping(true)
    .setPitchVariation(20);
  private readonly windCastEndSound = new PositionalSound(
    SoundType.SFX,
    this.object3D,
    getAsset("windMagicEndSound")
  )
    .setVolume(0.7)
    .setPitchVariation(30);
  private readonly electricityCastStartSound = new PositionalSound(
    SoundType.SFX,
    this.object3D,
    getAsset("electricityMagicStartSound")
  )
    .setVolume(0.7)
    .setPitchVariation(30);
  private readonly electricityCastLoopSound = new PositionalSound(
    SoundType.SFX,
    this.object3D,
    getAsset("electricityMagicLoopSound")
  )
    .setVolume(0)
    .setIsLooping(true)
    .setPitchVariation(20);
  private readonly electricityCastEndSound = new PositionalSound(
    SoundType.SFX,
    this.object3D,
    getAsset("electricityMagicEndSound")
  )
    .setVolume(0.7)
    .setPitchVariation(30);

  constructor(props: PlayerProps) {
    super(props);
    this.disableCamera = props.disableCamera ?? false;
    this.ignoreRenderMode = props.ignoreRenderMode ?? false;
    this.size = {
      width: 24 * kInvPixelScale,
      height: 52 * kInvPixelScale
    };

    // Instantiate and customize the player sprite.
    const storeState = store.getState();
    const hasSword = selectHasSword(storeState);
    const hasSwordEquipped =
      selectEquippedWeapon(storeState) === EquippedWeaponTypes.Sword;
    this.swordAvailable = hasSword;
    this.swordEquipped = hasSwordEquipped;
    this.swordOnBack = false;
    const playerCustomization = selectCharacterCustomization(storeState);
    this.lastCustomization = playerCustomization;
    const customizedSprites = customizePlayerSprite(
      {
        wolfMale: getAsset("wolfMaleSprite"),
        wolfFemale: getAsset("wolfFemaleSprite")
      },
      playerCustomization
    );
    const spellsSprite = getAsset("wolfSpells").getSprite<
      spellTypes.sprite_layers,
      spellTypes.sprite_animations
    >();
    spellsSprite.center();
    spellsSprite.mesh.scale.set(
      kInvPixelScale,
      -kInvPixelScale,
      kInvPixelScale
    );

    this.sprites = {
      upper: customizedSprites.upperSprite,
      lower: customizedSprites.lowerSprite,
      spells: spellsSprite
    };
    this.sprites.upper.setLayerOpacity(
      this.swordAvailable ? 1 : 0,
      "sword",
      true
    );
    this._initSwordGeomHelper(playerCustomization);

    this.behaviors.motionCapabilities.init(this);
    this.behaviors.pathFollowing
      .init(this)
      .setMotionCapabilities(this.behaviors.motionCapabilities.capabilities);

    this.behaviors.physics.init(this).setGroup(playerCollisionGroup);
    this.behaviors.data.init(this);
    this.behaviors.physicsControl
      .init(this)
      .attachControlEvents(this.behaviors.data.controlEvents)
      .attachPhysicsBehavior(this.behaviors.physics)
      .assignMotionCapabilities(this.behaviors.motionCapabilities.capabilities)
      .setSensorCollisionGroup(terrainSensorCollisionGroup);
    this.behaviors.fallDamage.init(this);
    this.behaviors.outOfBounds.init(this);
    this.behaviors.status
      .init(this)
      .disableHealth()
      .attachProtosSprite(this.sprites.upper)
      .attachProtosSprite(this.sprites.lower);
    // Hit flashes and the silhouette override write the whole sprite's fade,
    // which flattens the per-layer fades the customization colors ride on.
    // Repaint them as soon as the global fade is back to nothing.
    this.behaviors.status.onFadeApplied = (fadeAmount) => {
      if (fadeAmount > 0) return;
      customizePlayerSpriteColors(
        this.sprites.upper,
        this.sprites.lower,
        this.lastCustomization,
        true
      );
    };
    this._applyRenderMode(selectPlayerRenderMode(storeState));
    this.behaviors.animation.init(this).attachCompositeSprites({
      lower: {
        sprite: this.sprites.lower,
        physicsIndependent: true
      },
      upper: {
        sprite: this.sprites.upper,
        alignmentLayer: "align_hip",
        alignToPartName: "lower"
      }
    });
    this.behaviors.interactionConsumer.init(this);
    // Align the spells sprite to the upper body's cast marker.
    this.behaviors.spellSprite.attachSprites(
      this.sprites.spells,
      this.sprites.upper
    );
    // Drive the spells sprite through the cast lifecycle: the effect is
    // frame-slaved to the player's cast frame through anticipation/hold, then
    // free-advances its summon once the cast fires.
    this.events.on("CastStart", ([castSpeed, elementalType]) =>
      this.behaviors.spellSprite.playCast(elementalType, castSpeed)
    );
    this.events.on("CastHoldStart", () =>
      this.behaviors.spellSprite.beginHold()
    );
    this.events.on("CastHoldEnd", () =>
      this.behaviors.spellSprite.releaseHold()
    );
    this.events.on("CastEnd", () => this.behaviors.spellSprite.onCastFired());

    this.object3D.add(this.sprites.lower.mesh);
    this.object3D.add(this.sprites.upper.mesh);
    this.object3D.add(this.sprites.spells.mesh);
    this.sprites.spells.mesh.position.z = 1;
    this.object3D.position
      .copy(this.position)
      .multiplyScalar(kPixelScale)
      .round()
      .multiplyScalar(kInvPixelScale);

    this.behaviors.physics.events.on(
      CharacterPhysicsEvents.PassBehindTerrain,
      (terrain) => {
        if (isCommonTerrain(terrain)) terrain.fadeForeground?.(true);
      }
    );

    this.behaviors.physics.events.on(
      CharacterPhysicsEvents.ExitTerrain,
      (terrain) => {
        if (isCommonTerrain(terrain)) terrain.fadeForeground?.(false);
      }
    );

    this.behaviors.physicsControl.events.on(
      CharacterGroundPhysicsControlBehaviorEvents.Jump,
      () => {
        if (this.behaviors.data.current.isClimbing) {
          this.behaviors.physics.detachLadder();
          if (this.behaviors.physicsControl.lastSetVSpeedRatio < 0) {
            this.behaviors.physics.body?.setLinvel(new Vector2(), true);
          }
        }
        if (this.behaviors.physics.isInWater()) {
          this.behaviors.animation.getSprite()?.gotoAnimationFrame(0);
          this.behaviors.animation
            .getPartSprite("upper")
            ?.gotoAnimationFrame(0);
        }
      }
    );

    // Two checks, one for when "just pressed" up and one for "holding down" up.
    // Leaving both in is important since it takes care of mulitple scenarios.

    // Wire ladder attach/detach when 'just pressed'
    this.behaviors.data.controlEvents.on(ControlEvents.MoveVertically, (dy) => {
      if (this.behaviors.physics.wasRecentlyOnLadder()) return;
      if (this.behaviors.physics.isLadderAvailable() && dy > 0)
        this.behaviors.physics.attachLadder();
    });

    // When entering a ladder, check if upward button held down.
    this.behaviors.physics.events.on(CharacterPhysicsEvents.LadderFound, () => {
      if (this.behaviors.physics.wasRecentlyOnLadder()) return;
      if (this.behaviors.physicsControl.lastSetVSpeedRatio > 0)
        this.behaviors.physics.attachLadder();
    });

    this.scheduler.add({
      id: "manaDrip",
      recurring: true,
      duration: this.manaDripIntervalMs,
      invokeFunctionAtComplete: this.manaDrip.bind(this)
    });

    const dustLandYOffset = 0.35;
    const dustStartRunYOffset = 0.15;
    const dustEndRunYOffset = 0.15;
    const dustEndRunXOffset = 0.6;
    const dustRunXOffset = -0.6;
    const dustRunYOffset = 0.15;

    const dataStore = this.behaviors.data;

    this.behaviors.vfx
      .init(this)
      .attachVFX<PlayerDustAnimation, PlayerDustLayer>({
        spriteKey: "playerDustSprite",
        frameTag: "start_jump",
        offset: new Vector2(0, -this.size.height / 2),
        opacity: 0.5,
        trigger: () => this.behaviors.data.current.isJumping
      })
      .attachVFX<PlayerDustAnimation, PlayerDustLayer>({
        spriteKey: "playerDustSprite",
        frameTag: "fall_jump",
        hideLayers: ["back"],
        depthOffset: 0.2,
        offset: new Vector2(0, -this.size.height / 2 + dustLandYOffset),
        opacity: 0.8,
        trigger: () =>
          dataStore.current.isGrounded &&
          !dataStore.previous.isGrounded &&
          !dataStore.current.isJumping &&
          dataStore.previous.linvel.y < -10.0
      })
      .attachVFX<PlayerDustAnimation, PlayerDustLayer>({
        spriteKey: "playerDustSprite",
        frameTag: "fall_jump",
        hideLayers: ["front"],
        depthOffset: -0.2,
        offset: new Vector2(0, -this.size.height / 2 + dustLandYOffset),
        opacity: 0.8,
        trigger: () =>
          dataStore.current.isGrounded &&
          !dataStore.previous.isGrounded &&
          !dataStore.current.isJumping &&
          dataStore.previous.linvel.y < -10.0
      })
      .attachVFX<PlayerDustAnimation, PlayerDustLayer>({
        spriteKey: "playerDustSprite",
        frameTag: "fall_jump",
        hideLayers: ["back"],
        depthOffset: 0.2,
        offset: new Vector2(0.15, -this.size.height / 2),
        followFacingDirection: true,
        sizeScaler: 0.3,
        opacity: 0.8,
        trigger: () =>
          dataStore.current.isGrounded &&
          !dataStore.previous.isGrounded &&
          !dataStore.current.isJumping &&
          dataStore.previous.linvel.y < -5.0 &&
          dataStore.previous.linvel.y > -10.0
      })
      .attachVFX<PlayerDustAnimation, PlayerDustLayer>({
        spriteKey: "playerDustSprite",
        frameTag: "fall_jump",
        hideLayers: ["front"],
        depthOffset: -0.2,
        offset: new Vector2(0.15, -this.size.height / 2),
        followFacingDirection: true,
        sizeScaler: 0.3,
        opacity: 0.8,
        trigger: () =>
          dataStore.current.isGrounded &&
          !dataStore.previous.isGrounded &&
          !dataStore.current.isJumping &&
          dataStore.previous.linvel.y < -5.0 &&
          dataStore.previous.linvel.y > -10.0
      })
      .attachVFX<PlayerDustAnimation, PlayerDustLayer>({
        spriteKey: "playerDustSprite",
        frameTag: "start_run",
        speedScaler: 1.5,
        followFacingDirection: true,
        offset: new Vector2(0, -this.size.height / 2 + dustStartRunYOffset),
        sizeScaler: 0.65,
        opacity: 0.8,
        trigger: () =>
          this.behaviors.data.current.hSpeedRatio !== 0 &&
          dataStore.previous.hSpeedRatio === 0 &&
          this.behaviors.data.current.isGrounded
      })
      .attachVFX<PlayerDustAnimation, PlayerDustLayer>({
        spriteKey: "playerDustSprite",
        frameTag: "end_run",
        followFacingDirection: true,
        offset: new Vector2(
          0 + dustEndRunXOffset,
          -this.size.height / 2 + dustEndRunYOffset
        ),
        opacity: 0.8,
        trigger: () =>
          this.behaviors.data.current.hSpeedRatio === 0 &&
          dataStore.previous.hSpeedRatio !== 0 &&
          this.behaviors.data.current.isGrounded
      })
      .attachVFX<PlayerDustAnimation, PlayerDustLayer>({
        spriteKey: "playerDustSprite",
        frameTag: "run",
        followFacingDirection: true,
        offset: new Vector2(
          0 + dustRunXOffset,
          -this.size.height / 2 + dustRunYOffset
        ),
        opacity: 0.8,
        triggerMode: "while",
        spawnIntervalMs: 300,
        spawnAtStart: false,
        trigger: () =>
          this.behaviors.data.current.hSpeedRatio !== 0 &&
          this.behaviors.data.current.isGrounded
      });

    this.behaviors.callbackTrigger
      .init(this)
      .attachPreset("jumpSound", {
        jumpSound: this.jumpSound
      })
      .attachPreset("stepSound", {
        sound: this.stepSound,
        stepInterval: 300
      })
      .attachPreset("landSound", {
        sound: this.fallSound,
        lowerYLinvelForMaxFallFactor: -20,
        pitchVariationAmountBasedOnFallFactor: 1200
      })
      .attachPreset("hitSound", {
        hitSound: this.hitSound,
        healSound: this.healSound
      })
      .attachPreset("landInWaterSound", {
        waterSound: this.waterLowSound,
        lowYLinvelThresholdForWaterSound: -5,
        highImpactWaterSound: this.waterHighSound,
        lowYLinvelThresholdForHighImpactWaterSound: -10
      })
      .attach({
        mode: "event",
        emitter: this.behaviors.physicsControl.events,
        event: CharacterGroundPhysicsControlBehaviorEvents.Jump,
        trigger: () => this.behaviors.data.current.isInWater,
        onActivation: () => this.waterJumpSound.play()
      })
      .attach({
        mode: "event",
        emitter: this.events,
        event: "SwordSwing",
        onActivation: () => this.swordSwingSound.play()
      })
      .attach({
        mode: "event",
        emitter: this.events,
        event: "ParryStart",
        onActivation: () => this.parrySound.play()
      })
      .attach({
        mode: "event",
        emitter: this.events,
        event: "SwordUnsheathed",
        onActivation: () => this.unsheatheSwordSound.play()
      })
      .attach({
        mode: "event",
        emitter: this.events,
        event: "SwordSheathed",
        onActivation: (isQuick: boolean) => {
          if (isQuick) this.quickSheatheSwordSound.play();
          else this.sheatheSwordSound.play();
        }
      })
      .attach({
        mode: "event",
        emitter: this.events,
        event: "CastStart",
        onActivation: ([castSpeed, elementalType]) => {
          const elementalCastSounds =
            this._getSoundsForElementalCast(elementalType);
          elementalCastSounds.start.setPlaybackRate(castSpeed).play();
        }
      })
      .attach({
        mode: "event",
        emitter: this.events,
        event: "CastHoldStart",
        onActivation: (elementalType) => {
          const elementalCastSounds =
            this._getSoundsForElementalCast(elementalType);
          elementalCastSounds.loop.stop().setVolume(1, 500).play();
        }
      })
      .attach({
        mode: "event",
        emitter: this.events,
        event: "CastHoldEnd",
        onActivation: (elementalType) => {
          const elementalCastSounds =
            this._getSoundsForElementalCast(elementalType);
          elementalCastSounds.loop.setVolume(0, 1500);
        }
      })
      .attach({
        mode: "event",
        emitter: this.events,
        event: "CastEnd",
        onActivation: (elementalType) => {
          const elementalCastSounds =
            this._getSoundsForElementalCast(elementalType);
          elementalCastSounds.end.play();
        }
      });

    this.behaviors.spellListener
      .onExecutionStart(this._onSpellExecutionStart)
      .onConsoleLog(this._onConsoleLog);
  }

  private _initSwordGeomHelper(customization: CharacterCustomization) {
    try {
      const geom =
        customization.gender === "female"
          ? getAsset("wolfFemaleGeometry")
          : getAsset("wolfMaleGeometry");
      this.swordGeomHelper = new SwordGeometryHelper(geom, this.sprites.upper);
    } catch {
      this.swordGeomHelper = undefined;
    }
  }

  destroy() {
    super.destroy();
    this.unsubscribeFromStore?.();
    this.unsubscribeFromStore = undefined;
    this.sprites.upper.dispose();
    this.sprites.lower.dispose();
    this.sprites.spells.dispose();
    this.jumpSound.dispose();
    this.swordSwingSound.dispose();
    this.unsheatheSwordSound.dispose();
    this.sheatheSwordSound.dispose();
    this.quickSheatheSwordSound.dispose();
    this.parrySound.dispose();
    this.stepSound.dispose();
    this.fallSound.dispose();
    this.hitSound.dispose();
    this.healSound.dispose();
    this.waterLowSound.dispose();
    this.waterJumpSound.dispose();
    this.waterHighSound.dispose();
    this.generalCastStartSound.dispose();
    this.generalCastLoopSound.dispose();
    this.generalCastEndSound.dispose();
    this.fireCastStartSound.dispose();
    this.fireCastLoopSound.dispose();
    this.fireCastEndSound.dispose();
    this.iceCastStartSound.dispose();
    this.iceCastLoopSound.dispose();
    this.iceCastEndSound.dispose();
    this.windCastStartSound.dispose();
    this.windCastLoopSound.dispose();
    this.windCastEndSound.dispose();
    this.electricityCastStartSound.dispose();
    this.electricityCastLoopSound.dispose();
    this.electricityCastEndSound.dispose();
    for (const textDisplay of this.textDisplaysStack) {
      this.level?.removeEntity(textDisplay.entity.id);
    }
    this.textDisplaysStack.length = 0;
  }

  attachToLevel(level: EntityLevelAPI): void {
    super.attachToLevel(level);
    if (!this.disableCamera) {
      level.cameraDirector.sendLookAtEntityRequest(
        this,
        {
          size: new Vector2(15, 15),
          priority: 500,
          getFacingDirection: () =>
            this.behaviors.animation.facingDirection as number
        },
        0
      );
    }
    this.unsubscribeFromStore = store.subscribe(this._subCallback.bind(this));
    this._subCallback();

    this._buildBehaviorTree();
  }

  detachFromLevel(level: EntityLevelAPI): void {
    super.detachFromLevel(level);
    this.unsubscribeFromStore?.();
    this.unsubscribeFromStore = undefined;
    this.jumpSound.dispose();
    this.stepSound.dispose();
    this.fallSound.dispose();
    this.swordSwingSound.dispose();
    this.unsheatheSwordSound.dispose();
    this.sheatheSwordSound.dispose();
    this.quickSheatheSwordSound.dispose();
    this.parrySound.dispose();
    this.hitSound.dispose();
    this.healSound.dispose();
    this.waterLowSound.dispose();
    this.waterJumpSound.dispose();
    this.waterHighSound.dispose();
    this.generalCastStartSound.dispose();
    this.generalCastLoopSound.dispose();
    this.generalCastEndSound.dispose();
    this.fireCastStartSound.dispose();
    this.fireCastLoopSound.dispose();
    this.fireCastEndSound.dispose();
    this.iceCastStartSound.dispose();
    this.iceCastLoopSound.dispose();
    this.iceCastEndSound.dispose();
    this.windCastStartSound.dispose();
    this.windCastLoopSound.dispose();
    this.windCastEndSound.dispose();
    this.electricityCastStartSound.dispose();
    this.electricityCastLoopSound.dispose();
    this.electricityCastEndSound.dispose();
  }

  step(deltaMs: number): void {
    super.step(deltaMs);

    this._stepTextDisplays(deltaMs);
  }

  private _buildBehaviorTree(): void {
    // --- Parry scope with .reset() override for cleanup ---
    // The inner Sequence fails early if a melee parry counterattack is
    // triggered by hit(), allowing the behavior tree to chain into a
    // counterattack swing. Succeeder wrapping in the tree ensures the
    // outer Sequence continues regardless.
    const parryScope = ScopeWithCompositeAnimation<PlayerAnimation>(
      this.parryAnimationData,
      ["upper"],
      Sequence(
        Do(() => this.events.emit("ParryStart")),
        WaitForAnimationFrame(kParryWindowStart),
        Do(() => {
          this.parryWindowActive = true;
        }),
        // Poll each tick: bail out (Failed) if counterattack was triggered,
        // otherwise wait until the parry window animation frame is reached.
        Execute(() => {
          if (this.parryCounterattackPending) {
            this.parryWindowActive = false;
            return AIResult.Failed;
          }
          if (
            this.behaviors.animation.currentAnimationFrame >= kParryWindowEnd
          ) {
            this.parryWindowActive = false;
            return AIResult.Succeeded;
          }
          return AIResult.Running;
        }),
        // After parry window: if right mouse still held, transition to block.
        Selector(
          Sequence(
            Verify(() => this.rightMouseDown),
            Do(() => this._enterBlock()),
            WaitUntilSuccess(
              Verify(() => !this.rightMouseDown || !this.swordUnsheathed)
            ),
            Do(() => this._exitBlock())
          ),
          // Right mouse not held — finish parry animation normally.
          WaitForAnimationLoop()
        )
      ),
      { mirrorToIdleParts: true }
    );
    const parryOriginalReset = parryScope.reset.bind(parryScope);
    parryScope.reset = () => {
      parryOriginalReset();
      this.parryWindowActive = false;
      if (this.blocking) this._exitBlock();
    };

    // --- Swing scopes with .reset() override for cleanup ---
    const swing1Scope = ScopeWithCompositeAnimation<PlayerAnimation>(
      this.swing1AnimationData,
      ["upper"],
      Sequence(
        WaitForAnimationFrame(4),
        Do(() => {
          this.sprites.upper.setAnimationSpeed(0);
          this.sprites.upper.gotoAnimationFrame(4);
        }),
        Timeout(
          5000,
          WaitUntilSuccess(
            Verify(() => !this.mouseDown || !this.swordUnsheathed)
          )
        ),
        Do(() => {
          this.sprites.upper.setAnimationSpeed(1);
          this.sprites.upper.gotoAnimationFrame(5);
        }),
        Do(() => this._startSwingHitRegion()),
        Do(() => this.events.emit("SwordSwing")),
        WaitForAnimationLoop(),
        Do(() => this._stopSwingHitRegion())
      ),
      { mirrorToIdleParts: true }
    );
    const swing1OriginalReset = swing1Scope.reset.bind(swing1Scope);
    swing1Scope.reset = () => {
      swing1OriginalReset();
      this._stopSwingHitRegion();
    };

    // Counterattack scope — same as swing1 but at 2x speed.
    const counterattackScope = ScopeWithCompositeAnimation<PlayerAnimation>(
      this.counterattackAnimationData,
      ["upper"],
      Sequence(
        Do(() => this._startSwingHitRegion()),
        WaitForAnimationFrame(2),
        Do(() => this.events.emit("SwordSwing")),
        WaitForAnimationLoop(),
        Do(() => this._stopSwingHitRegion())
      ),
      { mirrorToIdleParts: true }
    );
    const counterattackOriginalReset =
      counterattackScope.reset.bind(counterattackScope);
    counterattackScope.reset = () => {
      counterattackOriginalReset();
      this._stopSwingHitRegion();
    };

    const swing2Scope = ScopeWithCompositeAnimation<PlayerAnimation>(
      this.swing2AnimationData,
      ["upper"],
      Sequence(
        WaitForAnimationFrame(2),
        Do(() => {
          this.sprites.upper.setAnimationSpeed(0);
          this.sprites.upper.gotoAnimationFrame(2);
        }),
        Timeout(
          5000,
          WaitUntilSuccess(
            Verify(() => !this.mouseDown || !this.swordUnsheathed)
          )
        ),
        Do(() => {
          this.sprites.upper.setAnimationSpeed(1);
          this.sprites.upper.gotoAnimationFrame(3);
        }),
        Do(() => this._startSwingHitRegion()),
        Do(() => this.events.emit("SwordSwing")),
        WaitForAnimationLoop(),
        Do(() => this._stopSwingHitRegion())
      ),
      { mirrorToIdleParts: true }
    );
    const swing2OriginalReset = swing2Scope.reset.bind(swing2Scope);
    swing2Scope.reset = () => {
      swing2OriginalReset();
      this._stopSwingHitRegion();
    };

    // On-ladder sword attack — a single ladder swing (attack_ladder_step01),
    // no combo. The hit region opens at the contact frame.
    const ladderSwingScope = ScopeWithCompositeAnimation<PlayerAnimation>(
      this.attackLadderAnimationData,
      ["upper"],
      Sequence(
        WaitForAnimationFrame(4),
        Do(() => this._startSwingHitRegion()),
        Do(() => this.events.emit("SwordSwing")),
        WaitForAnimationLoop(),
        Do(() => this._stopSwingHitRegion())
      ),
      { mirrorToIdleParts: true }
    );
    const ladderSwingOriginalReset =
      ladderSwingScope.reset.bind(ladderSwingScope);
    ladderSwingScope.reset = () => {
      ladderSwingOriginalReset();
      this._stopSwingHitRegion();
    };

    // Combo input buffer — listens to LeftMouseDown events and latches true
    // until explicitly cleared between swings.
    let comboInputBuffered = false;
    this.behaviors.data.controlEvents.on(ControlEvents.LeftMouseDown, () => {
      comboInputBuffered = true;
      this.mouseDown = true;
    });
    this.behaviors.data.controlEvents.on(ControlEvents.LeftMouseUp, () => {
      this.mouseDown = false;
    });

    // Right mouse button held tracking for block state.
    this.behaviors.data.controlEvents.on(ControlEvents.RightMouseDown, () => {
      this.rightMouseDown = true;
    });
    this.behaviors.data.controlEvents.on(ControlEvents.RightMouseUp, () => {
      this.rightMouseDown = false;
    });

    // --- Cast scope ---
    // Shared mutable state for the currently active cast.
    let activeCast: CastQueueItem | undefined;
    let holdDone = false;
    let holdCancelled = false;

    const makeCastScope = (
      animData: APIAnimationData<PlayerAnimation>,
      markers: {
        holdStart: number;
        holdEnd: number;
        castFrame: number;
        endFrame: number;
      }
    ) => {
      const { holdStart, holdEnd, castFrame, endFrame } = markers;
      const scope = ScopeWithCompositeAnimation<PlayerAnimation>(
        animData,
        ["upper"],
        Sequence(
          // Dequeue the next cast and apply cast color/speed/hold wiring.
          // holdDone/holdCancelled and progressEvents listeners are
          // registered earlier (before the sheath animation) so that
          // user clicks during the sheath are not lost.
          Do(() => {
            activeCast = this.castQueue.shift();
            if (!activeCast) return;
            const castSpeed = activeCast.castProps.speed ?? 1;
            this.sprites.upper.setAnimationSpeed(castSpeed);
            this.events.emit("CastStart", [
              castSpeed,
              activeCast.castProps.elementalType
            ]);

            if (activeCast.castProps.color) {
              this.sprites.upper.fadeLayers(
                new Color(activeCast.castProps.color),
                0.5,
                ["effect_01", "effect_02"],
                false
              );
              this.sprites.upper.multiplyLayers(
                new Color(activeCast.castProps.color),
                0.5,
                ["effect_01", "effect_02"]
              );
            } else {
              this.sprites.upper.fadeLayers(
                new Color(1, 1, 1),
                0,
                ["effect_01", "effect_02"],
                false
              );
              this.sprites.upper.multiplyLayers(new Color(1, 1, 1), 0, [
                "effect_01",
                "effect_02"
              ]);
            }
          }),

          // Universal cast hold — all spells freeze in the hold animation
          // range until a release condition is met:
          //   Aim spells: aimTrigger (holdDone), or abort (holdCancelled → fail)
          //   Non-aim spells: both mouse buttons released
          // If the release condition is already met when the animation reaches
          // the hold frame, the cast proceeds with no delay.
          WaitForAnimationFrame(holdStart),
          Do(() =>
            this.events.emit(
              "CastHoldStart",
              activeCast?.castProps.elementalType
            )
          ),
          Execute(
            () => {
              const isAimCast = !!(
                activeCast?.castProps.hold &&
                activeCast?.castProps.progressEvents
              );
              const castSpeed = activeCast?.castProps.speed ?? 1;

              if (isAimCast) {
                let aimHDir =
                  (this.level?.controls?.cursorScenePosition?.x ?? 0) -
                  this.position.x;
                if (this.behaviors.data.current.hSpeedRatio === 0)
                  this.faceImmediate(aimHDir >= 0);

                let hDir = this.isFacingRight() ? 1 : -1;
                if (aimHDir * hDir >= 0) {
                  this.behaviors.animation.setPartSpeedScaler("lower", 1);
                  this.behaviors.animation.setPartFlipFacing("upper", false);
                  this.behaviors.animation.setPartFlipFacing("lower", false);
                } else {
                  this.behaviors.animation.setPartSpeedScaler("lower", -1);
                  this.behaviors.animation.setPartFlipFacing("upper", true);
                  this.behaviors.animation.setPartFlipFacing("lower", true);
                }

                if (holdDone) {
                  // Snap lower to upper's current hold-loop frame so the
                  // post-hold advance starts in sync (upper may be anywhere
                  // in [holdStart, holdEnd] while lower was frozen at
                  // holdStart).
                  this.sprites.lower.gotoAnimationFrame(
                    this.sprites.upper.getAnimationFrame()
                  );
                  this.sprites.lower.setAnimationSpeed(castSpeed);
                  return AIResult.Succeeded;
                }
                if (holdCancelled) {
                  this.behaviors.animation.setPartSpeedScaler("lower", 1);
                  this.behaviors.animation.setPartFlipFacing("upper", false);
                  this.behaviors.animation.setPartFlipFacing("lower", false);
                  return AIResult.Failed;
                }
              } else {
                if (!this.mouseDown && !this.rightMouseDown) {
                  // Snap lower to upper's current hold-loop frame and
                  // restore its speed so the post-hold advance doesn't
                  // leave lower stuck at holdStart (speed was set to 0
                  // during the hold to freeze it).
                  this.sprites.lower.gotoAnimationFrame(
                    this.sprites.upper.getAnimationFrame()
                  );
                  this.sprites.lower.setAnimationSpeed(castSpeed);
                  return AIResult.Succeeded;
                }
              }

              // Hold: loop upper body in hold range, freeze lower when idle.
              const frame = this.behaviors.animation.currentAnimationFrame;
              if (frame >= holdEnd) {
                this.sprites.upper.gotoAnimationFrame(holdStart);
              }
              // Freeze the lower body at the hold frame. Setting speed to
              // 0 prevents _advancePartAnimation from advancing when the
              // lower body is mirroring. When the player walks or jumps,
              // _stepComposite resets the speed to the physics animation's
              // speed before advancing, so this only affects idle mirroring.
              this.sprites.lower.setAnimationSpeed(0);
              const { current } = this.behaviors.data;

              if (
                !current.hSpeedRatio &&
                current.isGrounded &&
                !current.isJumping &&
                !current.isFalling
              ) {
                this.sprites.lower.gotoAnimationFrame(holdStart);
              }
              return AIResult.Running;
            },
            () => {
              holdDone = false;
              holdCancelled = false;
              // Covers every exit path — holdDone, holdCancelled, non-aim
              // mouse-released, and external preemption (death, hit,
              // level swap) via reset cascade.
              this.events.emit(
                "CastHoldEnd",
                activeCast?.castProps.elementalType
              );
            }
          ),
          // Emit done at the cast frame
          WaitForAnimationFrame(castFrame),
          Do(() => {
            activeCast?.deferred.emit("done");
            this.events.emit("CastEnd", activeCast?.castProps.elementalType);
            activeCast = undefined;
          }),
          // Return back to normal upper facing at animation end
          WaitForAnimationFrame(endFrame),
          Do(() => {
            this.behaviors.animation.setPartSpeedScaler("lower", 1);
            this.behaviors.animation.setPartFlipFacing("upper", false);
            this.behaviors.animation.setPartFlipFacing("lower", false);
          }),
          WaitForAnimationLoop()
        ),
        { mirrorToIdleParts: true }
      );
      const originalReset = scope.reset.bind(scope);
      scope.reset = () => {
        originalReset();
        if (activeCast) {
          activeCast.deferred.emit("cancel");
          activeCast = undefined;
        }
      };
      return scope;
    };
    const castScope = makeCastScope(this.spellAnimationData, {
      holdStart: kPlayerCastHoldStart,
      holdEnd: kPlayerCastHoldEnd,
      castFrame: kPlayerCastFrame,
      endFrame: kPlayerCastEndFrame
    });
    // On-ladder cast uses spell_ladder01 (13 frames): anticipation 0-3,
    // hold loop at frame 4, smear/cast at 5, summon 6-12.
    const ladderCastScope = makeCastScope(this.spellLadderAnimationData, {
      holdStart: 4,
      holdEnd: 4,
      castFrame: 5,
      endFrame: 12
    });

    // --- Earth cast scope (rock kick) ---
    // air_rock_spell is a short windup+kick with no hold. It emits CastStart
    // (so the spells sprite plays its matching air_rock_spell) but deliberately
    // NOT CastHoldStart/CastHoldEnd — the spells behavior plays straight through
    // when no hold is signalled, keeping the kick in sync.
    const kAirRockKickFrame = 4; // rock launches on foot contact
    const earthCastScope = ScopeWithCompositeAnimation<PlayerAnimation>(
      this.airRockSpellAnimationData,
      ["upper"],
      Sequence(
        Do(() => {
          activeCast = this.castQueue.shift();
          if (!activeCast) return;
          const castSpeed = activeCast.castProps.speed ?? 1;
          this.sprites.upper.setAnimationSpeed(castSpeed);
          this.events.emit("CastStart", [
            castSpeed,
            activeCast.castProps.elementalType
          ]);
        }),
        WaitForAnimationFrame(kAirRockKickFrame),
        Do(() => {
          activeCast?.deferred.emit("done");
          this.events.emit("CastEnd", activeCast?.castProps.elementalType);
          activeCast = undefined;
        }),
        WaitForAnimationLoop()
      ),
      { mirrorToIdleParts: true }
    );
    const earthCastOriginalReset = earthCastScope.reset.bind(earthCastScope);
    earthCastScope.reset = () => {
      earthCastOriginalReset();
      if (activeCast) {
        activeCast.deferred.emit("cancel");
        activeCast = undefined;
      }
    };

    // prettier-ignore
    this.behaviors.ai
    .init(this)
    .behaviorTree = new AIBehaviorTree(
      Selector(
        // ── 1. DEATH (CRITICAL) ─────────────────────────────────────────
        // Highest priority — preempts everything. Any lingering combat
        // state (hit regions, parry window) is cleaned up by the reset
        // cascade when the Selector switches to this branch.
        // Mirrors the Die subtree: disables physics, plays death animation
        // once, then holds indefinitely (without removing from level).
        Sequence(
          Verify(() => this.dead),
          DisableCharacterPhysics(),
          ScopeWithCompositeAnimation<PlayerAnimation>(
            this.deathAnimationData,
            ["upper", "lower"],
            Sequence(
              WaitForAnimationLoop(),
              Execute(() => AIResult.Running)
            ),
            { mirrorToIdleParts: true }
          )
        ),

        // ── 2. CUTSCENE LOCK ────────────────────────────────────────────
        // Blocks the tree — no combat actions or state management runs
        // while input is disabled. Movement is handled separately via
        // data.controlEvents (NPC scripts can still walk the player).
        // Uses a single Execute instead of Sequence(Verify, Execute) so the
        // condition is re-evaluated every tick (Sequence would resume from
        // the Running Execute child, skipping the Verify guard).
        Execute(() =>
          selectCutsceneLocked(store.getState())
            ? AIResult.Running
            : AIResult.Failed
        ),

        // ── 3. ITEM PICKUP ──────────────────────────────────────────────
        // Managed by the scheduler in pickupItem(). The tree just holds
        // here until the pickup flow completes. Uses a single Execute
        // (not Sequence(Verify, Execute)) so the condition is re-evaluated
        // every tick — Sequence would resume from the Running child,
        // skipping the guard.
        Execute(() =>
          this.gettingItem ? AIResult.Running : AIResult.Failed
        ),

        // ── 4. COMBAT ACTIONS ───────────────────────────────────────────
        // MemoSelector: once a combat action starts (mid-swing, mid-cast),
        // it runs to completion without re-evaluating other combat actions
        // in this group. Preemption from higher-priority branches (death,
        // cutscene) is still handled by the outer Selector.
        MemoSelector(
          // ── 4a. PARRY (secondary attack / right click) ─────────────
          Sequence(
            ConsumeControlInput(ControlEvents.SecondaryAttack),
            Verify(() => this.swordUnsheathed),
            Succeeder(parryScope),
            // Counterattack swing on successful melee parry (2x speed).
            Verify(() => this.parryCounterattackPending),
            Do(() => { this.parryCounterattackPending = false; }),
            counterattackScope
          ),

          // ── 4b. MELEE ATTACK ────────────────────────────────────────
          Sequence(
            Verify(() => this.swordAvailable && this.swordEquipped && this.swordUnsheathed),
            ConsumeControlInput(ControlEvents.LeftMouseDown),
            SetPhysicsAnimations({
              idle: this.swordIdleAnimation,
              walk: this.swordWalkAnimation
            }),
            Selector(
              // On a ladder: a single ladder swing (no combo).
              Sequence(
                Verify(() => this.behaviors.data.current.isClimbing),
                ladderSwingScope
              ),
              // On the ground: buffered MouseDown events chain swings.
              Sequence(
                Do(() => { comboInputBuffered = false; }),
                swing1Scope,
                Verify(() => comboInputBuffered),
                Do(() => { comboInputBuffered = false; }),
                swing2Scope,
              )
            )
          ),

          // ── 4c. SPELL CAST ──────────────────────────────────────────
          // Wraps castScope in a Selector so that if the held cast is
          // cancelled (castScope returns Failed), the cleanup Do emits
          // "cancel" and succeeds — preventing the MemoSelector from
          // trying lower-priority actions after a cancel.
          Sequence(
            Verify(() => this.castQueue.length > 0),
            // Register hold listeners early so that clicks during the
            // sheath animation are captured (prevents stuck hold state
            // when the user clicks before castScope starts).
            Do(() => {
              const front = this.castQueue[0];
              // Seed from per-item flags so events fired before this
              // point (e.g. spell aborted while a previous cast was
              // still animating) are not missed.
              holdDone = front?.holdTriggered ?? false;
              holdCancelled = front?.holdAborted ?? false;
              if (front?.castProps.hold && front.castProps.progressEvents) {
                front.castProps.progressEvents.on("aimTrigger", () => {
                  holdDone = true;
                });
                front.castProps.progressEvents.on("abort", () => {
                  holdCancelled = true;
                });
              }
            }),
            // Sheath sword if needed before casting.
            Selector(
              Sequence(
                Verify(() => this.swordUnsheathed),
                ScopeWithCompositeAnimation<PlayerAnimation>(
                  this.quickSheathAnimationData,
                  ["upper"],
                  Sequence(
                    WaitForAnimationFrame(5),
                    Do(() => this.events.emit("SwordSheathed", true)),
                    WaitForAnimationLoop()
                  )
                ),
                Do(() => {
                  this.swordUnsheathed = false;
                  this.swordOnBack = false;
                }),
                SetPhysicsAnimations({
                  idle: this.defaultIdleAnimation,
                  walk: this.defaultWalkAnimation
                })
              ),
              // Already sheathed — skip.
              Verify(() => !this.swordUnsheathed)
            ),
            // Skip sheath animation — go directly to spell.
            Do(() => {
              this.swordUnsheathed = false;
              this.swordOnBack = false;
            }),
            // Run the cast. On a ladder, use the held spell_ladder01 cast.
            // Otherwise Earth uses the air_rock_spell kick (no hold) and
            // everything else uses the generic held cast. If a held cast is
            // cancelled the cancel cleanup in the scope's reset() handles the
            // deferred.
            Selector(
              Sequence(
                Verify(() => this.behaviors.data.current.isClimbing),
                ladderCastScope
              ),
              Sequence(
                Verify(
                  () =>
                    this.castQueue[0]?.castProps.elementalType ===
                    ElementalType.Earth
                ),
                earthCastScope
              ),
              castScope
            )
          )
        ), // end MemoSelector

        // ── 5. SWORD STATE MANAGEMENT ───────────────────────────────────
        // Reactive sword transitions — handles equip/unequip changes from
        // Redux and auto-unsheathe after casting. These are lower priority
        // than combat actions, so starting a swing or cast preempts them.
        Selector(
          // ── 5a. SHEATH — sword unsheathed but no longer equipped ─────
          Sequence(
            Verify(() => this.swordUnsheathed && (!this.swordEquipped || !this.swordAvailable)),
            ScopeWithCompositeAnimation<PlayerAnimation>(
              this.sheathAnimationData,
              ["upper"],
              Sequence(
                WaitForAnimationFrame(5),
                Do(() => this.events.emit("SwordSheathed", false)),
                WaitForAnimationLoop()
              )
            ),
            Do(() => {
              this.swordUnsheathed = false;
              this.swordOnBack = false;
            }),
            SetPhysicsAnimations({
              idle: this.defaultIdleAnimation,
              walk: this.defaultWalkAnimation
            })
          ),

          // ── 5b. UNSHEATHE — sword equipped but currently sheathed ────
          // Also serves as auto-unsheathe after casting completes. The
          // Wait(100) prevents immediate re-unsheathe if the player is
          // about to queue another cast.
          Sequence(
            Verify(() =>
              this.swordAvailable &&
              this.swordEquipped &&
              !this.swordUnsheathed &&
              this.castQueue.length === 0
            ),
            Succeeder(
              Sequence(
                Verify(() => this.swordNeedsUnsheatheAnim),
                Wait(100),
                ScopeWithCompositeAnimation<PlayerAnimation>(
                  this.unsheathAnimationData,
                  ["upper"],
                  Sequence(
                    Do(() => this.events.emit("SwordUnsheathed")),
                    WaitForAnimationLoop()
                  )
                ),
                Do(() => { this.swordNeedsUnsheatheAnim = false; })
              )
            ),
            Do(() => { this.swordUnsheathed = true; }),
            SetPhysicsAnimations({
              idle: this.swordIdleAnimation,
              walk: this.swordWalkAnimation
            })
          )
        ),

        // ── 6. INTERACTION ──────────────────────────────────────────────
        Sequence(
          ConsumeControlInput(ControlEvents.Interact),
          Do(() => this.behaviors.interactionConsumer.doInteraction())
        ),

        // ── 7. IDLE ─────────────────────────────────────────────────────
        // No action needed — AnimationControlBehavior plays physics
        // animations (idle/walk/jump) when no override is active.
        Verify(() => true)
      ) // end Selector
    );
  }

  /**
   * White mode pins the sprite fade to full white, so the player renders as a
   * flat silhouette. StatusBehavior owns the fade, so the override lives there
   * and survives hit flashes.
   */
  private _applyRenderMode(mode: PlayerRenderMode) {
    this.renderMode = mode;
    if (this.ignoreRenderMode) return;
    if (mode === PlayerRenderMode.White) {
      this.behaviors.status.setFadeOverride(0xffffff, 1);
    } else {
      this.behaviors.status.clearFadeOverride();
    }
  }

  private _subCallback() {
    const state = store.getState();
    const customization = selectCharacterCustomization(state);
    if (customization !== this.lastCustomization) {
      if (
        customization.species === this.lastCustomization.species &&
        customization.gender === this.lastCustomization.gender
      ) {
        customizePlayerSpriteColors(
          this.sprites.upper,
          this.sprites.lower,
          customization,
          true
        );
        // Recoloring just wrote per-layer fades over an active silhouette.
        this.behaviors.status.markFadeDirty();
      } else {
        this.object3D.remove(this.sprites.lower.mesh);
        this.object3D.remove(this.sprites.upper.mesh);
        this.behaviors.status.detachProtoSprite(this.sprites.lower);
        this.behaviors.status.detachProtoSprite(this.sprites.upper);
        this.sprites.lower.dispose();
        this.sprites.upper.dispose();
        const newSprites = customizePlayerSprite(
          {
            wolfMale: getAsset("wolfMaleSprite"),
            wolfFemale: getAsset("wolfFemaleSprite")
          },
          customization
        );
        this.sprites.lower = newSprites.lowerSprite;
        this.sprites.upper = newSprites.upperSprite;
        this.object3D.add(this.sprites.lower.mesh);
        this.object3D.add(this.sprites.upper.mesh);
        this.behaviors.status.attachProtosSprite(this.sprites.lower);
        this.behaviors.status.attachProtosSprite(this.sprites.upper);
        this._initSwordGeomHelper(customization);
        this.behaviors.animation.attachCompositeSprites({
          lower: {
            sprite: this.sprites.lower,
            physicsIndependent: true
          },
          upper: {
            sprite: this.sprites.upper,
            alignmentLayer: "align_hip",
            alignToPartName: "lower"
          }
        });
      }
      this.lastCustomization = customization;
    }
    const isDead = selectIsDead(state);
    if (isDead && !this.dead) {
      this.dead = true;
      this.behaviors.physicsControl.lastSetHSpeedRatio = 0;
      this.behaviors.data.controlEvents.emit(ControlEvents.MoveHorizontally, 0);
      this.behaviors.data.controlEvents.emit(ControlEvents.Stop);
      this.behaviors.data.disableControls();
    } else if (!isDead && this.dead) {
      // revive (as of 07-04-26 this only happens with dev mode)
      this.dead = false;
      this.behaviors.ai.reset();
      this.behaviors.physics.enable();
      this.behaviors.physics.setGroup(playerCollisionGroup);
      this.behaviors.data.enableControls();
    }
    const cutsceneLocked = selectCutsceneLocked(state);
    if (cutsceneLocked !== this.wasCutsceneLocked) {
      this.wasCutsceneLocked = cutsceneLocked;
      if (cutsceneLocked) {
        this.behaviors.data.controlEvents.emit(
          ControlEvents.MoveHorizontally,
          0
        );
        this.behaviors.data.controlEvents.emit(ControlEvents.Stop);
        this.behaviors.data.disableControls();
      } else {
        this.behaviors.data.enableControls();
      }
    }

    const prevSwordAvailable = this.swordAvailable;
    const prevSwordEquipped = this.swordEquipped;
    this.swordAvailable = selectHasSword(state);
    this.swordEquipped =
      this.swordAvailable &&
      selectEquippedWeapon(state) === EquippedWeaponTypes.Sword;
    if (!prevSwordEquipped && this.swordEquipped) {
      this.swordNeedsUnsheatheAnim = true;
    }
    if (this.swordAvailable !== prevSwordAvailable) {
      this.sprites.upper.setLayerOpacity(
        this.swordAvailable ? 1 : 0,
        "sword",
        true
      );
    }

    const renderMode = selectPlayerRenderMode(state);
    if (renderMode !== this.renderMode) this._applyRenderMode(renderMode);

    const prevIsNoClip = this.isNoClip;
    this.isNoClip = selectNoClipEnabled(state);

    if (prevIsNoClip !== this.isNoClip) {
      if (this.isNoClip) {
        this.behaviors.motionCapabilities
          .setFly(true)
          .setSpeedLimits(20, 20)
          .setGroundAccel(1);

        this.behaviors.fallDamage.disable();
        this.behaviors.outOfBounds.disable();
        this.behaviors.physics
          .setGravityScale(0)
          .setGroup(noClipCollisionGroup);

        this.behaviors.animation.unsetPhysicsAnimation("walk");
      } else {
        this.behaviors.motionCapabilities
          .setFly(false)
          .setSpeedLimits(this.normalWalkingSpeed, this.normalClimbingSpeed)
          .setGroundAccel(this.normalGroundAccel);

        this.behaviors.fallDamage.enable();
        this.behaviors.outOfBounds.enable();
        this.behaviors.physics
          .setGravityScale(1)
          .setGroup(playerCollisionGroup);

        this.behaviors.animation.setPhysicsAnimations({
          walk: this.defaultWalkAnimation
        });
      }
    }
  }

  private _enterBlock(): void {
    this.blocking = true;
    this.behaviors.motionCapabilities
      .setSpeedLimits(this.blockingWalkingSpeed, this.blockingClimbingSpeed)
      .setJump(true, undefined, this.blockingJumpHeight);

    this.behaviors.animation.scaleAllPhysicsAnimationSpeeds(
      this.blockingWalkingSpeed / this.normalWalkingSpeed
    );
  }

  private _exitBlock(): void {
    this.blocking = false;
    this.behaviors.motionCapabilities
      .setSpeedLimits(this.normalWalkingSpeed, this.normalClimbingSpeed)
      .setJump(true, undefined, this.normalJumpHeight);

    this.behaviors.animation.scaleAllPhysicsAnimationSpeeds(
      this.normalWalkingSpeed / this.blockingWalkingSpeed
    );
  }

  isFacingRight() {
    return this.behaviors.animation.facingDirection === 1;
  }

  isUpperFacingRight() {
    const faceFlipFacing = this.behaviors.animation.getPartFlipFacing("upper");
    if (faceFlipFacing === undefined) return true;
    return this.isFacingRight() !== faceFlipFacing;
  }

  faceImmediate(facingRight: boolean) {
    this.behaviors.physicsControl.facingRight = facingRight;
    this.behaviors.animation.facingDirection = facingRight ? 1 : -1;
  }

  faceUpperImmediate(facingRight: boolean) {
    this.behaviors.animation.setPartFlipFacing(
      "upper",
      facingRight !== this.isFacingRight()
    );
  }

  private _startSwingHitRegion() {
    this._stopSwingHitRegion();

    this.sprites.upper.fadeLayers(new Color(1, 1, 1), 0.8, ["smears"]);

    if (this.swordGeomHelper) {
      const geomHelper = this.swordGeomHelper;
      const facingRight = this.isUpperFacingRight();
      const hitRegion = new AnimatedHitRegion({
        position: this.sprites.upper.mesh.position.clone().add(this.position),
        getHullPoints: () => {
          const absFrame =
            this.sprites.upper.protoSpriteInstance.animationState.currentFrame;
          return geomHelper.getHullPoints(absFrame, facingRight);
        },
        getWorldPosition: () =>
          this.sprites.upper.mesh.position.clone().add(this.position),
        targetAlignment: EntityAlignment.Enemy,
        damage: 5,
        hitStopMs: this.swordHitStopMs,
        screenShake: this.swordScreenShake,
        hitImpulse: new Vector2((facingRight ? 1 : -1) * 2, 1),
        sourceEntity: this,
        shouldCheckLineOfSight: true
      });
      this.swingHitRegion = hitRegion;
      this.level?.addEntity(hitRegion);
    } else {
      // Fallback: circle hitbox
      const facingRight = this.isUpperFacingRight();
      const dx = facingRight ? 1 : -1;
      const hitArea = new HitArea({
        position: this.position.clone().add(new Vector3(dx * 0.8, 0, 0)),
        lifetime: 250,
        targetAlignment: EntityAlignment.Enemy,
        damage: 5,
        hitImpulse: new Vector2(dx * 2, 1),
        shape: {
          type: HitAreaShape.Circle,
          radius: 1
        },
        sourceEntity: this,
        shouldCheckLineOfSight: true
      });
      this.level?.addEntity(hitArea);
    }
  }

  private _stopSwingHitRegion() {
    this.sprites.upper.fadeLayers(new Color(1, 1, 1), 0, ["smears"]);

    if (this.swingHitRegion) {
      if (this.level) {
        this.swingHitRegion.detachFromLevel(this.level);
      }
      this.swingHitRegion = undefined;
    }
  }

  // Spell API callbacks.
  attachToSpellApi(api: SpellsAPI): void {
    this.behaviors.spellListener.attachToSpellApi(api);
  }
  detachFromSpellApi(api: SpellsAPI): void {
    this.behaviors.spellListener.detachFromSpellApi(api);
  }

  extraSpellBindingData() {
    const body = this.behaviors.physics.body;
    const vel = body ? body.linvel() : { x: 0, y: 0 };
    const state = store.getState();
    const health = selectHealth(state);
    const mana = selectMana(state);
    return {
      facingRight: this.isUpperFacingRight(),
      swordUnsheathed: this.swordUnsheathed,
      velocity: { x: vel.x, y: vel.y },
      health,
      mana
    };
  }
  cursorOverrides?: (() => Set<string>) | undefined;

  /**
   * Multiplayer summary: everything a remote peer's PlayerStub needs to
   * mirror this player for one report. `acc` carries gravity while airborne
   * so stubs dead-reckon jumps/falls accurately between reports. Animation
   * travels per composite part (upper/lower play independently: swings and
   * casts override only the upper body), and the upper frame index travels
   * during casts so the stub's cast pose — and the spells sprite slaved to
   * it — hold in sync with the caster.
   */
  getNetSummary(): EntityNetSummary {
    const body = this.behaviors.physics.body;
    const vel = body ? body.linvel() : { x: 0, y: 0 };
    const data = this.behaviors.data.current;
    const state = store.getState();
    const animation = this.behaviors.animation;

    // Physics-driven fallback tag, mirroring the animation behavior's rules.
    let physicsAnim: string;
    if (data.isClimbing) {
      physicsAnim = "climb";
    } else if (data.isGrounded && data.hSpeedRatio !== 0) {
      physicsAnim = this.swordUnsheathed ? "run_sword" : "run";
    } else if (data.isGrounded) {
      physicsAnim = this.swordUnsheathed ? "idle_sword_front" : "idle";
    } else if (data.isInWater) {
      physicsAnim = "swim";
    } else if (data.isJumpRising) {
      physicsAnim = "ascend";
    } else if (data.isJumpFalling) {
      physicsAnim = "reach_peak";
    } else if (data.isFalling) {
      physicsAnim = "descend";
    } else {
      physicsAnim = "idle";
    }

    const animUpper = animation.getPartAnimationTag("upper") ?? physicsAnim;
    const animLower = animation.getPartAnimationTag("lower") ?? physicsAnim;
    // Frame-slave the stub's upper body during casts only: cast holds pin a
    // pose indefinitely, so time-based playback on the stub would drift. All
    // other animations free-run stub-side.
    const isCastAnim =
      animUpper === "spell" ||
      animUpper === "fast_spell" ||
      animUpper === "spell_ladder01" ||
      animUpper === "air_rock_spell";

    const airborne = !data.isGrounded && !data.isClimbing && !data.isInWater;
    const maxHealth = selectMaxHealth(state);
    return {
      pos: { x: this.position.x, y: this.position.y },
      vel: { x: vel.x, y: vel.y },
      acc: airborne
        ? { x: kWorldGravity.x, y: kWorldGravity.y }
        : { x: 0, y: 0 },
      facing: animation.facingDirection === 1 ? 1 : -1,
      upperFlip: animation.getPartFlipFacing("upper") === true,
      animUpper,
      animLower,
      ...(isCastAnim
        ? { animUpperFrame: animation.getCurrentCompositeAnimationFrame("upper") }
        : {}),
      hp: maxHealth > 0 ? selectHealth(state) / maxHealth : 0,
      maxHp: maxHealth,
      dead: this.dead,
      sword: this.swordUnsheathed
    };
  }

  // Caster API callbacks.
  hasCastInProgress() {
    return false;
  }
  doCast(castProps: CasterEntityCastProps) {
    const deferred = createCastDeferredEmitter();
    if (castProps.manaCost) {
      if (!this.subMana(castProps.manaCost)) {
        deferred.emit("manaOverdrawn");
        return deferred;
      }
    }
    const castQueueItem: CastQueueItem = {
      castProps,
      deferred,
      holdTriggered: false,
      holdAborted: false
    };
    // Register hold listeners immediately so events are never missed.
    // The behavior tree re-reads these flags when it processes each cast.
    if (castProps.hold && castProps.progressEvents) {
      castProps.progressEvents.on("aimTrigger", () => {
        castQueueItem.holdTriggered = true;
      });
      castProps.progressEvents.on("abort", () => {
        castQueueItem.holdAborted = true;
      });
    }
    this.castQueue.push(castQueueItem);
    return deferred;
  }
  addMana(mana: number) {
    store.dispatch(incrementMana(mana));
    return true;
  }
  subMana(mana: number) {
    const availableMana = selectMana(store.getState());
    if (availableMana < mana) return false;
    store.dispatch(incrementMana(-mana));
    return true;
  }
  getCastOrigin() {
    const pos = this.position.clone();
    pos.y += 0.3;
    // Note that this places the origin at the forward hand position,
    // not the backwards held position in the pre-cast pose.
    // This is intentional.
    pos.x += this.isUpperFacingRight() ? 0.8 : -0.8;
    return pos;
  }

  hit(details: EntityHitDetails) {
    if (
      details.hittingEntity !== this &&
      (this.parryWindowActive || this.blocking)
    ) {
      // Face the attacker.
      if (details.hittingEntity) {
        this.faceImmediate(details.hittingEntity.position.x > this.position.x);
      }
    }

    if (this.parryWindowActive && details.hittingEntity !== this) {
      if (
        details.hittingEntity &&
        typeof (details.hittingEntity as any).deflect === "function" &&
        (details.hittingEntity as any).behaviors?.projectilePhysics
      ) {
        // Deflect the projectile back.
        const projectile = details.hittingEntity as any;
        const vel = projectile.behaviors.projectilePhysics.velocity;
        const deflectedVelocity = new Vector2(-vel.x, -vel.y);
        projectile.deflect(deflectedVelocity, this.id);
      } else {
        // Melee parry: counterattack with a fast swing.
        this.parryWindowActive = false;
        this.parryCounterattackPending = true;
        this.level?.hitStop(this.parryHitStopMs);
      }
      return;
    }

    let finalDamage = details.damage;
    let finalImpulse = details.hitImpulse?.clone();

    if (this.blocking) {
      finalDamage = Math.ceil(finalDamage * this.blockDamageMultiplier);
      finalImpulse?.multiplyScalar(this.blockImpulseMultiplier);
    }

    super.hit({
      ...details,
      damage: finalDamage,
      hitImpulse: finalImpulse
    });
    store.dispatch(incrementHealth(-finalDamage));
    store.dispatch(
      setLastElementalHitType(details.elementalDamageType ?? null)
    );
  }

  // Player API callbacks.
  setMovementEnabled(enabled: boolean): void {
    store.dispatch(setCutsceneLocked(!enabled));
  }

  plotAndFollowPath(pos: Vector2): DeferredEmitter {
    const deferred = new DeferredEmitter();
    this.behaviors.pathFollowing.pathEvents.on(
      PathFollowingBehaviorEvents.PathComplete,
      () => deferred.emit("done")
    );
    this.behaviors.pathFollowing.planAndFollowPathToPosition(pos);
    return deferred;
  }

  addInteraction(id: string, provider: InteractionProvider) {
    this.behaviors.interactionConsumer.addInteraction(id, provider);
  }
  getCurrentInteractionProvider() {
    return this.behaviors.interactionConsumer.getCurrentInteractionProvider();
  }
  removeInteraction(id: string) {
    this.behaviors.interactionConsumer.removeInteraction(id);
  }

  pickupItem(
    itemObject3D: Object3D,
    pickupDeferred: DeferredEmitter
  ): DeferredEmitter<
    {
      done: void;
      heldInTheAir: void;
      cancel: void;
    },
    "done",
    "cancel"
  > {
    this.object3D.add(itemObject3D);
    itemObject3D.position.set(this.isUpperFacingRight() ? 1 : -1, 0.5, 0.5);
    const initialItemObjectPosition = itemObject3D.position.clone();
    const finalItemObjectPosition = new Vector3(0, 1, 0.5);
    const deferredOut = new DeferredEmitter<
      {
        done: void;
        heldInTheAir: void;
        cancel: void;
      },
      "done",
      "cancel"
    >();
    this.gettingItem = true;
    this.sprites.upper.hideLayers("effect_01", "effect_02");
    // Request override for item pickup animation on both parts
    this.behaviors.animation.requestOverride(this.chestAnimationData, {
      targetParts: ["upper", "lower"]
    });
    // Start from frame 18 to match old behavior
    this.sprites.upper.gotoAnimationFrame(18);
    this.sprites.lower.gotoAnimationFrame(18);
    this.scheduler.add({
      duration: 400,
      invokeFunction: (t) => {
        itemObject3D.position
          .copy(initialItemObjectPosition)
          .lerp(finalItemObjectPosition, t);
      },
      invokeFunctionAtComplete: async () => {
        deferredOut.emit("heldInTheAir");
        await pickupDeferred.getPromise();
        this.object3D.remove(itemObject3D);
        this.gettingItem = false;
        this.sprites.upper.showLayers("effect_01", "effect_02");
        this.behaviors.animation.clearOverride(this.chestAnimationData, {
          targetParts: ["upper", "lower"]
        });
        deferredOut.emit("done");
      }
    });
    return deferredOut;
  }

  // This gets invoked every 100ms.
  manaDrip() {
    const ms = this.manaDripIntervalMs;
    const state = store.getState();
    const mana = selectMana(state);
    const maxMana = selectMaxMana(state);
    const manaRegenRate = selectManaRechargeRatePerSecond(state);
    if (mana < maxMana) {
      const deltaMana = Math.min(maxMana - mana, ms * manaRegenRate * 0.001);
      store.dispatch(incrementMana(deltaMana));
    }
  }

  private _getSoundsForElementalCast(
    elementalType: ElementalType | undefined
  ): {
    start: SoundAPI;
    loop: SoundAPI;
    end: SoundAPI;
  } {
    const elementalCastingSoundMap = {
      general: {
        start: this.generalCastStartSound,
        loop: this.generalCastLoopSound,
        end: this.generalCastEndSound
      },
      [ElementalType.Fire]: {
        start: this.fireCastStartSound,
        loop: this.fireCastLoopSound,
        end: this.fireCastEndSound
      },

      // TODO:
      [ElementalType.Earth]: {
        start: this.generalCastStartSound,
        loop: this.generalCastLoopSound,
        end: this.generalCastEndSound
      },

      [ElementalType.Electricity]: {
        start: this.electricityCastStartSound,
        loop: this.electricityCastLoopSound,
        end: this.electricityCastEndSound
      },

      [ElementalType.Ice]: {
        start: this.iceCastStartSound,
        loop: this.iceCastLoopSound,
        end: this.iceCastEndSound
      },

      // TODO:
      [ElementalType.Mana]: {
        start: this.generalCastStartSound,
        loop: this.generalCastLoopSound,
        end: this.generalCastEndSound
      },

      // TODO:
      [ElementalType.Nature]: {
        start: this.generalCastStartSound,
        loop: this.generalCastLoopSound,
        end: this.generalCastEndSound
      },

      [ElementalType.Wind]: {
        start: this.windCastStartSound,
        loop: this.windCastLoopSound,
        end: this.windCastEndSound
      }
    } satisfies Record<
      ElementalType | "general",
      { start: SoundAPI; loop: SoundAPI; end: SoundAPI }
    >;

    const resolvedElementalType = elementalType ?? "general";

    return elementalCastingSoundMap[resolvedElementalType];
  }
  doBounce() {
    this.behaviors.fallDamage.disableNextDamage();
  }

  private static readonly TEXT_APPEAR_TIME_MS = 180;
  private static readonly TEXT_HOLD_TIME_MS = 2200;
  private static readonly TEXT_LEAVE_TIME_MS = 350;
  private static readonly TEXT_SPACING = 0.32;
  private static readonly TEXT_SPACING_FROM_PLAYER = 0.35;
  private static readonly TEXT_APPEAR_ANIM_OFFSET = 0.18;
  private static readonly TEXT_LEAVE_ANIM_OFFSET = 0.3;
  private static readonly TEXT_MAX_VISIBLE_AT_ONCE = 5;
  private static readonly TEXT_LERP = 120;
  private static readonly TEXT_MAX_CHARS = 48;

  private readonly textDisplaysStack: {
    entity: TextPixelated;
    ageMs: number;
    slotY: number;
  }[] = [];

  displayText(text: string): void {
    if (!this.level) return;

    const position = this.position.clone();
    position.y += this.size.height * 0.5 + Player.TEXT_SPACING_FROM_PLAYER;
    position.z += 0.1;

    const entity = new TextPixelated({
      position,
      color: "#ffffff",
      outline: true,
      outlineColor: "#000000",
      text,
      font: "directMessage",
      fontSize: 6,
      opacity: 0,
      numCharsWidth: Player.TEXT_MAX_CHARS,
      overflow: "truncate"
    });

    this.level.addEntity(entity);
    this.textDisplaysStack.push({ entity, ageMs: 0, slotY: 0 });

    const timeUntilExitMs =
      Player.TEXT_APPEAR_TIME_MS + Player.TEXT_HOLD_TIME_MS;

    const allVisibleTextDisplays = this.textDisplaysStack.filter(
      (textDisplay) => textDisplay.ageMs < timeUntilExitMs
    );

    const numTextDisplaysToExitEarly =
      allVisibleTextDisplays.length - Player.TEXT_MAX_VISIBLE_AT_ONCE;
    if (numTextDisplaysToExitEarly <= 0) return;

    for (let idx = 0; idx < numTextDisplaysToExitEarly; idx++) {
      const currentTextDisplay = allVisibleTextDisplays.at(idx);
      if (!currentTextDisplay) continue;

      currentTextDisplay.ageMs = timeUntilExitMs;
    }
  }

  private _stepTextDisplays(deltaMs: number): void {
    const appearTimeMs = Player.TEXT_APPEAR_TIME_MS;
    const timeUntilExitMs = appearTimeMs + Player.TEXT_HOLD_TIME_MS;
    const totalMs = timeUntilExitMs + Player.TEXT_LEAVE_TIME_MS;

    for (let idx = this.textDisplaysStack.length - 1; idx >= 0; idx--) {
      const textDisplay = this.textDisplaysStack[idx];
      textDisplay.ageMs += deltaMs;
      if (textDisplay.ageMs >= totalMs) {
        this.level?.removeEntity(textDisplay.entity.id);
        this.textDisplaysStack.splice(idx, 1);
      }
    }
    if (this.textDisplaysStack.length === 0) return;

    const anchorX = this.position.x;
    const anchorY =
      this.position.y + this.size.height / 2 + Player.TEXT_SPACING_FROM_PLAYER;
    const slotLerp = Math.min(1, deltaMs / Player.TEXT_LERP);
    const numTextDisplays = this.textDisplaysStack.length;

    for (let idx = 0; idx < numTextDisplays; idx++) {
      const textDisplay = this.textDisplaysStack.at(idx);
      if (!textDisplay) continue;

      const slotIndex = numTextDisplays - 1 - idx;
      const targetSlotY = slotIndex * Player.TEXT_SPACING;
      textDisplay.slotY += (targetSlotY - textDisplay.slotY) * slotLerp;

      let opacity = 1;
      let animationRiseOffset = 0;

      if (textDisplay.ageMs < appearTimeMs) {
        const relativeAppearTime = textDisplay.ageMs / appearTimeMs;
        opacity = relativeAppearTime;
        animationRiseOffset =
          -Player.TEXT_APPEAR_ANIM_OFFSET * (1 - relativeAppearTime);
      } else if (textDisplay.ageMs >= timeUntilExitMs) {
        const relativeLeaveTime =
          (textDisplay.ageMs - timeUntilExitMs) / Player.TEXT_LEAVE_TIME_MS;
        opacity = 1 - relativeLeaveTime;
        animationRiseOffset = Player.TEXT_LEAVE_ANIM_OFFSET * relativeLeaveTime;
      }

      textDisplay.entity.object3D.position.x = anchorX;
      textDisplay.entity.object3D.position.y =
        anchorY + textDisplay.slotY + animationRiseOffset;
      textDisplay.entity.setOpacity(opacity);
    }
  }

  private readonly _onSpellExecutionStart = (ctx: SpellCtx): boolean => {
    const caster = ctx.getCaster();
    if (!caster) return false;

    if (!isPlayerAPI(caster)) return false;

    return true;
  };

  private readonly _onConsoleLog = (logLine: SpellCtxConsoleLogLine): void => {
    const text = this._formatConsoleLogLine(logLine);
    if (text.length === 0) return;

    this.displayText(text);
  };

  private _formatConsoleLogLine(logLine: SpellCtxConsoleLogLine): string {
    const formattedText =
      logLine.primitiveValue !== undefined && logLine.primitiveValue !== null
        ? logLine.primitiveValue.toString()
        : logLine.objectValue !== undefined
          ? JSON.stringify(logLine.objectValue)
          : "";

    return formattedText.trim();
  }
}
