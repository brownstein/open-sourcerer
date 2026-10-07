import {
  Animation,
  AnimationState,
  AnimationStateData,
  MixBlend,
  Physics,
  Skeleton,
  SkeletonData
} from "@esotericsoftware/spine-core";
import { Object3D, Vector2 } from "three";

import { AIResult } from "src/api/ai";
import {
  BaseEntityType,
  EntityAlignment,
  EntityHitDetails,
  EntityLevelAPI,
  EntityLevelEvents,
  EntityLifecycleEvents,
  EntityProps
} from "src/api/entity";
import { OverlayAPI, OverlayPosition } from "src/api/overlay";
import { createTypedEventEmitter } from "src/api/util";
import {
  BossHealthBar,
  BossHealthBarEvents,
  BossHealthBarOverlayProps
} from "src/components/ui/overlays/overlays/BossHealthBar";
import { kInvPixelScale, kPixelScale } from "src/engine/constants/scaling";
import { AIBehaviorTree, AINode } from "src/engine/entity/AIBehaviorTree";
import {
  Do,
  Execute,
  Selector,
  Sequence,
  Verify,
  Wait,
  WaitUntilSuccess
} from "src/engine/entity/AICoreNodes";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import { addResourceLoader, getResource } from "src/engine/entity/decorators";
import { SpineLoader } from "src/engine/spine/SpineLoader";
import { ThreeSpine, ThreeSpineEvents } from "src/engine/spine/ThreeSpine";
import { buildFilteredAnimation } from "src/engine/spine/filterAnimation";
import { vector2To3 } from "src/engine/util/vecTypes";
import { Marker } from "src/entities/environment/Marker";
import { AIBehavior } from "src/entities/shared/behaviors/AIBehavior";
import { OutOfBoundsBehaviour } from "src/entities/shared/behaviors/OutOfBoundsBehaviour";

import { EchoAttachment } from "./EchoAttachment";
import { EchoCannonAiming } from "./EchoCannonAiming";
import { EchoControlTester } from "./EchoControlTester";
import { createControlTesters } from "./EchoControlTesterSetup";
import { EchoHeightTrackTimeline } from "./EchoHeightTrackTimeline";
import { EchoKnockBackTimeline } from "./EchoKnockBackTimeline";
import { EchoProjectileSpawner } from "./EchoProjectileSpawner";
import { EchoAnimation, EchoBone, EchoBossPhase, EchoSlot } from "./dataTypes";
import echoAtlas from "./spine/skeleton.atlas";
import echoPng from "./spine/skeleton.png";
import echoSkel from "./spine/skeleton.skel";

/** Slot names that belong to the head region — flashed on head hit. */
const HEAD_FLASH_SLOTS = [
  EchoSlot.BaseHead,
  EchoSlot.BaseHeadBottom,
  EchoSlot.EyesSockets,
  EchoSlot.EyesSocketsBottom,
  EchoSlot.EyeBig,
  EchoSlot.Gear,
  EchoSlot.NeckSlot,
  EchoSlot.WiresHead
];

/** Slot names whose vertices define the head convex hull. */
const HEAD_HULL_SLOTS = [
  EchoSlot.BaseHead,
  EchoSlot.BaseHeadBottom,
  EchoSlot.EyesSockets
];

/** Slot names that belong to the body region — flashed on body hit. */
const BODY_FLASH_SLOTS = [
  EchoSlot.UpperBody1,
  EchoSlot.UpperBody1Back,
  EchoSlot.BottomBody1Front,
  EchoSlot.BottomBody1Back,
  EchoSlot.UpperBody2,
  EchoSlot.UpperBody2Back,
  EchoSlot.BottomBody2,
  EchoSlot.BottomBody2Back,
  EchoSlot.UpperBody3,
  EchoSlot.UpperBody3Back,
  EchoSlot.BottomBody3,
  EchoSlot.BottomBody3Back,
  EchoSlot.Body1
];

/** Slot names whose vertices define the body convex hull. */
const BODY_HULL_SLOTS = [
  EchoSlot.UpperBody1,
  EchoSlot.BottomBody1Front,
  EchoSlot.UpperBody2,
  EchoSlot.BottomBody2,
  EchoSlot.UpperBody3,
  EchoSlot.BottomBody3
];

/** Speed of cannon projectiles (units per second). */
const PROJECTILE_SPEED = 15;
/** Number of times the short cannon fires in a burst. */
const SHORT_CANNON_REPEAT_COUNT = 10;
/** Minimum idle time between attacks in Phase 1 (ms). */
const IDLE_MIN_MS = 1000;
/** Maximum idle time between attacks in Phase 1 (ms). */
const IDLE_MAX_MS = 2000;
/** Duration (seconds) for crossfading between animation switches. */
const ANIMATION_SWITCH_DURATION = 0.5;

export type EchoProps = EntityProps & {
  debugPolygons?: boolean;
  enableControlTesters?: boolean;
};

@addResourceLoader(
  new SpineLoader({
    resourceName: "EchoSpineWrapper",
    sourceAtlasPath: echoAtlas,
    sourcePngPath: echoPng,
    sourcePngName: "skeleton.png",
    sourceSkelPath: echoSkel
  })
)
export class Echo extends CoreEntity implements BaseEntityType {
  static type = "Echo";
  public type = "Echo";
  public alignment = EntityAlignment.Enemy;
  public object3D = new Object3D();
  public children: BaseEntityType[] = [];

  public maxHealth = 400;
  public health = 400;

  public behaviors = {
    ai: new AIBehavior(),
    outOfBounds: new OutOfBoundsBehaviour()
  };

  private healthEvents = createTypedEventEmitter<BossHealthBarEvents>();
  private overlay?: OverlayAPI<BossHealthBarOverlayProps>;
  private threeSpine: ThreeSpine;
  private headAttachment?: EchoAttachment;
  private bodyAttachment?: EchoAttachment;
  private knockbackTimeline?: EchoKnockBackTimeline;
  /** Shadow skeleton for sampling clean bone world positions (no knockback offsets). */
  private refSkeleton: Skeleton;
  private refAnimState: AnimationState;
  private debugPolygons: boolean;
  private enableControlTesters: boolean;
  private controlTesters: EchoControlTester[] = [];
  private smallCannonTesters: EchoControlTester[] = [];
  private bigCannonTesters: EchoControlTester[] = [];

  // Velocity - this boss is not physically controlled, so we have to manage this ourselves.
  private targetVelocity = new Vector2();
  private velocity = new Vector2();
  private acceleration = new Vector2();

  /** Filtered ShortCannonShoot animation containing only small-cannon timelines. */
  private shortCannonAnimation?: Animation;

  /** Current boss phase. */
  private phase = EchoBossPhase.Asleep;
  /** True while an attack animation is playing. */
  private isAttacking = false;
  /** Set to true when the current attack animation finishes. */
  private attackComplete = false;
  /** Remaining shots in a short-cannon burst. */
  private shortCannonShotsRemaining = 0;
  /** Cached player entity reference. */
  private playerEntity: BaseEntityType | null = null;

  // Motion markers.
  private closeMarker?: Marker;
  private farMarker?: Marker;
  private attachedLevel?: EntityLevelAPI;

  private cannonAiming: EchoCannonAiming;
  private projectileSpawner: EchoProjectileSpawner;

  constructor(props: EchoProps) {
    super(props);
    this.debugPolygons = props.debugPolygons ?? false;
    this.enableControlTesters = props.enableControlTesters ?? false;
    this.object3D.position.copy(this.position);

    const skeletonData = getResource<SkeletonData>(Echo, "EchoSpineWrapper");
    this.threeSpine = new ThreeSpine(skeletonData);
    this.threeSpine.mesh.scale.multiplyScalar(kInvPixelScale);
    this.threeSpine.events.setMaxListeners(20);
    this.object3D.add(this.threeSpine.mesh);

    // Enable animated crossfades between all animation transitions
    this.threeSpine.animationState.data.defaultMix = ANIMATION_SWITCH_DURATION;

    const idle = this.threeSpine.animationState.setAnimation(
      0,
      EchoAnimation.Idle
    );
    idle.loop = true;

    this.threeSpine.update();

    // Reference skeleton: a shadow copy that mirrors the real animation state
    // but never receives knockback offsets. Used to sample clean bone world
    // positions each frame.
    this.refSkeleton = new Skeleton(skeletonData);
    this.refAnimState = new AnimationState(
      new AnimationStateData(skeletonData)
    );
    this.refAnimState.data.defaultMix = ANIMATION_SWITCH_DURATION;
    const refIdle = this.refAnimState.setAnimation(0, EchoAnimation.Idle);
    refIdle.loop = true;
    this.refAnimState.update(0);
    this.refAnimState.apply(this.refSkeleton);
    this.refSkeleton.updateWorldTransform(Physics.update);

    // Track 1: body height tracking — applied to both real and ref skeletons
    // so the knockback timeline's ideal centroid stays in sync.
    const heightTrackTimeline = new EchoHeightTrackTimeline(1).setup(
      this.threeSpine.skeleton
    );
    const heightAnim = new Animation("heightTrack", [heightTrackTimeline], 1);
    const heightEntry = this.threeSpine.animationState.setAnimationWith(
      1,
      heightAnim
    );
    heightEntry.mixDuration = 0;

    const refHeightTrackTimeline = new EchoHeightTrackTimeline(1).setup(
      this.refSkeleton
    );
    const refHeightAnim = new Animation(
      "heightTrack",
      [refHeightTrackTimeline],
      1
    );
    const refHeightEntry = this.refAnimState.setAnimationWith(1, refHeightAnim);
    refHeightEntry.mixDuration = 0;

    // Track 2: knockback timeline reads clean positions from reference
    // skeleton and applies physics offsets to the real skeleton.
    const knockbackTimeline = new EchoKnockBackTimeline(1).setup(
      this.threeSpine.skeleton,
      this.refSkeleton
    );
    const knockbackAnimation = new Animation(
      "knockback",
      [knockbackTimeline],
      1
    );
    const knockbackEntry = this.threeSpine.animationState.setAnimationWith(
      2,
      knockbackAnimation
    );
    knockbackEntry.mixDuration = 0;
    this.knockbackTimeline = knockbackTimeline;

    this.shortCannonAnimation = buildFilteredAnimation(
      skeletonData,
      EchoAnimation.ShortCannonShoot,
      EchoBone.SmallCannon
    );

    // Initialize helpers
    this.cannonAiming = new EchoCannonAiming({
      threeSpine: this.threeSpine,
      getPosition: () => this.position,
      findPlayer: () => this._findPlayer(),
      projectileSpeed: PROJECTILE_SPEED,
      heightTrackTimeline,
      refHeightTrackTimeline
    });

    this.projectileSpawner = new EchoProjectileSpawner({
      threeSpine: this.threeSpine,
      getPosition: () => this.position,
      getLevel: () => this.level ?? undefined,
      findPlayer: () => this._findPlayer(),
      getIgnoreEntityIds: () => {
        const ids = [this.id];
        if (this.headAttachment) ids.push(this.headAttachment.id);
        if (this.bodyAttachment) ids.push(this.bodyAttachment.id);
        return ids;
      },
      sourceEntity: this
    });

    this._setupAIBehaviorTree();
    this.behaviors.outOfBounds.init(this);
  }

  attachToLevel(level: EntityLevelAPI): void {
    super.attachToLevel(level);
    this.attachedLevel = level;
    this._constructAttachments();
    if (this.enableControlTesters) {
      this._constructControlTesters();
    }

    // Chain cannon-aiming logic onto the preWorldTransform hook
    // (which may already be set by _constructControlTesters).
    const existingHook = this.threeSpine.preWorldTransform;
    this.threeSpine.preWorldTransform = () => {
      existingHook?.();
      this.cannonAiming.applyCannonAiming();
    };

    this.projectileSpawner.setupListeners();

    for (const child of this.children) level.addEntity(child);

    // Find marker entities in post-init phase.
    level.on(EntityLevelEvents.PreloadComplete, this._onPreloadComplete);
  }

  private readonly _onPreloadComplete = (): void => {
    const level = this.attachedLevel;
    if (!level) return;
    this.closeMarker = level.getEntityForName<Marker>("EchoClose") ?? undefined;
    this.farMarker = level.getEntityForName<Marker>("EchoFar") ?? undefined;
  };

  detachFromLevel(level: EntityLevelAPI): void {
    super.detachFromLevel(level);
    level.off(EntityLevelEvents.PreloadComplete, this._onPreloadComplete);
    this.attachedLevel = undefined;
    this.overlay?.remove();
    this.overlay = undefined;
  }

  destroy(): void {
    super.destroy();
    this.overlay?.remove();
    this.overlay = undefined;
    this.threeSpine.geometry.dispose();
    this.threeSpine.material.dispose();
  }

  getThreeSpine(): ThreeSpine {
    return this.threeSpine;
  }

  getSkeletonData(): SkeletonData {
    return getResource<SkeletonData>(Echo, "EchoSpineWrapper");
  }

  /** Set animation on track 0, mirrored to the reference skeleton. */
  private _setAnimation(name: string, loop: boolean) {
    const entry = this.threeSpine.animationState.setAnimation(0, name, loop);
    const refEntry = this.refAnimState.setAnimation(0, name, loop);
    refEntry.mixDuration = entry.mixDuration;
    return entry;
  }

  /** Queue animation on track 0, mirrored to the reference skeleton. */
  private _addAnimation(name: string, loop: boolean, delay: number) {
    const entry = this.threeSpine.animationState.addAnimation(
      0,
      name,
      loop,
      delay
    );
    const refEntry = this.refAnimState.addAnimation(0, name, loop, delay);
    refEntry.mixDuration = entry.mixDuration;
    return entry;
  }

  step(ms: number) {
    // Apply motion.
    this.acceleration
      .copy(this.targetVelocity)
      .sub(this.velocity)
      .multiplyScalar(10);
    this.velocity.add(this.acceleration.clone().multiplyScalar(ms * 0.001));
    this.position.add(vector2To3(this.velocity).multiplyScalar(ms * 0.001));
    this.object3D.position
      .copy(this.position)
      .multiplyScalar(kPixelScale)
      .round()
      .multiplyScalar(kInvPixelScale);

    // Fire event triggers.
    super.step(ms);

    // Compute height-tracking offset before animation update so both
    // real and ref timelines apply the same value this frame.
    this.cannonAiming.updateBodyHeightTracking();
    // Update reference skeleton first so the knockback timeline (which runs
    // inside threeSpine.update) can sample clean bone positions from it.
    const dt = ms * 0.001;
    this.refAnimState.update(dt);
    this.refAnimState.apply(this.refSkeleton);
    this.refSkeleton.updateWorldTransform(Physics.update);
    this.threeSpine.update(dt);
    this._updateKnockbackFromAttachments(ms);
    if (this.smallCannonTesters.length > 0) {
      const slot = this.threeSpine.skeleton.findSlot(EchoSlot.SmallCannon);
      const visible = !!(slot && slot.getAttachment());
      for (const tester of this.smallCannonTesters) tester.hidden = !visible;
    }
    if (this.bigCannonTesters.length > 0) {
      const slot = this.threeSpine.skeleton.findSlot(EchoSlot.InnerCannon1);
      const visible = !!(slot && slot.getAttachment());
      for (const tester of this.bigCannonTesters) tester.hidden = !visible;
    }
  }

  private _onHeadHit(hit: EntityHitDetails) {
    this.hit(hit);
    this._applyDamage(hit.damage);
    this._wakeIfAsleep();
  }

  private _onBodyHit(hit: EntityHitDetails) {
    this.hit(hit);
    this._applyDamage(hit.damage);
    this._wakeIfAsleep();
  }

  private _applyDamage(damage: number) {
    this.health = Math.max(0, this.health - damage);
    this.healthEvents.emit("healthUpdated", this.health);
    if (this.health <= 0) {
      this.healthEvents.emit("dead");
    }
  }

  /** Transition from Asleep -> Transforming -> Phase_1. */
  private async _wakeIfAsleep() {
    if (this.phase !== EchoBossPhase.Asleep) return;
    this.phase = EchoBossPhase.Scream;

    // Show boss health bar
    this.overlay = this.level?.ctx?.overlayProvider?.addOverlay({
      component: BossHealthBar,
      position: OverlayPosition.ViewportBottom,
      overlayProps: {
        bossName: "Echo: The Primordial Web Developer",
        maxHealth: this.maxHealth,
        healthEvents: this.healthEvents
      }
    });

    // This sprite has no mouth, but make it scream.
    const screamEntry = this._setAnimation(EchoAnimation.Scream, false);
    screamEntry.mixDuration = ANIMATION_SWITCH_DURATION;
    await new Promise<void>((resolve) => {
      const onAnimationDone = (animationName: string) => {
        if (animationName !== EchoAnimation.Scream) return;
        this.threeSpine.events.off(
          ThreeSpineEvents.AnimationComplete,
          onAnimationDone
        );
        resolve();
      };
      this.threeSpine.events.on(
        ThreeSpineEvents.AnimationComplete,
        onAnimationDone
      );
    });

    this.phase = EchoBossPhase.Chase;

    // Queue Idle2 after Transform — Spine holds Transform's final pose during
    // the crossfade, so there's no gap or state reset between the two.
    const walkAggro = this._addAnimation(
      EchoAnimation.WalkAggressively,
      true,
      0
    );
    walkAggro.mixDuration = ANIMATION_SWITCH_DURATION;
  }

  private async _scrabble() {
    this.headAttachment?.setKnockbackEnabled(false);
    this.bodyAttachment?.setKnockbackEnabled(false);

    const scrabble = this._setAnimation(EchoAnimation.PlayerTrapped, true);
    scrabble.mixDuration = ANIMATION_SWITCH_DURATION;

    await new Promise<void>((resolve) => {
      const onAnimationDone = (animationName: string) => {
        if (animationName !== EchoAnimation.PlayerTrapped) return;
        this.threeSpine.events.off(
          ThreeSpineEvents.AnimationComplete,
          onAnimationDone
        );
        resolve();
      };
      this.threeSpine.events.on(
        ThreeSpineEvents.AnimationComplete,
        onAnimationDone
      );
    });

    this.headAttachment?.setKnockbackEnabled(true);
    this.bodyAttachment?.setKnockbackEnabled(true);

    this._transform();
  }

  private _transform() {
    this.phase = EchoBossPhase.Transforming;
    const transform = this._setAnimation(EchoAnimation.Transform3, false);
    transform.mixDuration = ANIMATION_SWITCH_DURATION;
    // Queue Idle2 after Transform — Spine holds Transform's final pose during
    // the crossfade, so there's no gap or state reset between the two.
    const idle2 = this._addAnimation(EchoAnimation.Idle2, true, 0);
    idle2.mixDuration = ANIMATION_SWITCH_DURATION;
    idle2.listener = {
      start: () => {
        this.phase = EchoBossPhase.Phase_1;
        this._recalculateAttachmentHulls();
      }
    };
  }

  // ---------------------------------------------------------------------------
  // AI behavior tree
  // ---------------------------------------------------------------------------

  private _setupAIBehaviorTree() {
    const waitDuration = AINode.CreateSharedVariable(3000);

    // NOTE: Nodes that return AIResult.Running resume on the next tick
    // without re-evaluating earlier Sequence siblings (like Verify).
    // For "hold in this phase" branches, use a single Execute that
    // re-checks the phase each tick and returns Failed to let the
    // Selector fall through when the phase changes.
    const tree = new AIBehaviorTree(
      Selector(
        // Asleep — idle until hit
        Execute(() =>
          this.phase === EchoBossPhase.Asleep
            ? AIResult.Running
            : AIResult.Failed
        ),

        // Chasing the player to the left - chase until marker reached,
        // lunge, and then transition to transformation.
        Sequence(
          Verify(() => this.phase === EchoBossPhase.Chase),
          Execute(() => {
            if (this.phase !== EchoBossPhase.Chase) return AIResult.Running;
            if (!this.closeMarker) return AIResult.Failed;
            if (this.position.x > this.closeMarker.position.x) {
              this.targetVelocity.x = -5;
              return AIResult.Running;
            }
            this.targetVelocity.x = 0;
            this._scrabble();
            return AIResult.Succeeded;
          }),
          WaitUntilSuccess(
            Verify(() => this.phase === EchoBossPhase.Transforming)
          )
        ),

        // Phase 1 — alternate idle / attack
        Sequence(
          Verify(() => this.phase === EchoBossPhase.Phase_1),
          Do(() => {
            waitDuration.value =
              IDLE_MIN_MS + Math.random() * (IDLE_MAX_MS - IDLE_MIN_MS);
          }),
          Wait(waitDuration),
          Do(() => this._startRandomAttack()),
          Execute(
            () => (this.attackComplete ? AIResult.Succeeded : AIResult.Running),
            () => this._cleanupAttack()
          )
        ),

        // Phase 2 — placeholder
        Execute(() =>
          this.phase === EchoBossPhase.Phase_2
            ? AIResult.Running
            : AIResult.Succeeded
        ),

        // Phase 3 — placeholder
        Execute(() =>
          this.phase === EchoBossPhase.Phase_3
            ? AIResult.Running
            : AIResult.Succeeded
        ),

        // Defeated — stay idle
        Execute(() =>
          this.phase === EchoBossPhase.Defeated
            ? AIResult.Running
            : AIResult.Succeeded
        )
      )
    );

    this.behaviors.ai.init(this).behaviorTree = tree;
  }

  // ---------------------------------------------------------------------------
  // Attack selection & lifecycle
  // ---------------------------------------------------------------------------

  private _startRandomAttack() {
    this.isAttacking = true;
    this.attackComplete = false;
    this.cannonAiming.isAttacking = true;
    this.projectileSpawner.isAttacking = true;
    this.projectileSpawner.attackComplete = false;

    if (Math.random() < 0.5) {
      this._startBigCannonAttack();
    } else {
      this._startShortCannonAttack();
    }
  }

  private _startBigCannonAttack() {
    this.cannonAiming.startAiming(EchoBone.InnerCannon1);
    this.projectileSpawner.setActiveCannon(
      EchoBone.InnerCannon1,
      EchoSlot.InnerCannon1
    );

    const anim = this.cannonAiming.pickBigCannonAnimation();
    const entry = this._setAnimation(anim, false);
    entry.mixDuration = ANIMATION_SWITCH_DURATION;
    entry.listener = {
      complete: () => {
        this.attackComplete = true;
        this.projectileSpawner.attackComplete = true;
      }
    };
  }

  private _startShortCannonAttack() {
    if (!this.shortCannonAnimation) return;

    this.cannonAiming.startAiming(EchoBone.SmallCannon);
    this.projectileSpawner.setActiveCannon(
      EchoBone.SmallCannon,
      EchoSlot.SmallCannon
    );
    this.shortCannonShotsRemaining = SHORT_CANNON_REPEAT_COUNT;

    // Play filtered short cannon animation additively on track 3.
    // Only contains timelines for the Small_cannon bone subtree, so idle
    // and other bones are unaffected.
    const entry = this.threeSpine.animationState.setAnimationWith(
      3,
      this.shortCannonAnimation
    );
    entry.loop = true;
    entry.mixBlend = MixBlend.add;
    entry.mixDuration = ANIMATION_SWITCH_DURATION;
    entry.listener = {
      complete: () => {
        this.shortCannonShotsRemaining--;
        if (this.shortCannonShotsRemaining <= 0) {
          this.attackComplete = true;
          this.projectileSpawner.attackComplete = true;
        } else {
          // Allow next loop iteration to fire
          this.projectileSpawner.projectileFiredThisShot = false;
        }
      }
    };

    // Mirror to reference skeleton.
    const refEntry = this.refAnimState.setAnimationWith(
      3,
      this.shortCannonAnimation
    );
    refEntry.loop = true;
    refEntry.mixBlend = MixBlend.add;
    refEntry.mixDuration = ANIMATION_SWITCH_DURATION;
  }

  /** Reset all attack state and return to the combat idle animation. */
  private _cleanupAttack() {
    this.isAttacking = false;
    this.attackComplete = false;
    this.cannonAiming.isAttacking = false;
    this.cannonAiming.stopAiming();
    this.projectileSpawner.isAttacking = false;
    this.projectileSpawner.attackComplete = false;
    this.projectileSpawner.clearActiveCannon();
    this.shortCannonShotsRemaining = 0;

    // Clear the additive short cannon track (track 3) on both skeletons.
    this.threeSpine.animationState.setEmptyAnimation(
      3,
      ANIMATION_SWITCH_DURATION
    );
    this.refAnimState.setEmptyAnimation(3, ANIMATION_SWITCH_DURATION);

    const idle = this._setAnimation(
      this.phase === EchoBossPhase.Asleep ||
        this.phase === EchoBossPhase.Defeated
        ? EchoAnimation.Idle
        : EchoAnimation.Idle2,
      true
    );
    idle.mixDuration = ANIMATION_SWITCH_DURATION;
  }

  // ---------------------------------------------------------------------------
  // Hit impulse offsets
  // ---------------------------------------------------------------------------

  /**
   * Called AFTER threeSpine.update(). The timeline has already computed ideal
   * skeleton-world positions (including centroid offsets) and applied the
   * previous frame's world offsets as bone-local displacements.
   *
   * Here we just convert ideal skeleton-world -> game-world, apply the spring
   * force, and store the new skeleton-world offset for next frame.
   */
  private _updateKnockbackFromAttachments(ms: number) {
    if (!this.knockbackTimeline) return;
    const kt = this.knockbackTimeline;
    const meshScale = this.threeSpine.mesh.scale.x;
    const pos = this.position;

    // Body — the ideal position from the timeline is the rectangular centroid
    // of the ref skeleton's slot vertices. The hull centroid (where the RB
    // should rest) is offset from this by centroidDelta.
    const bodyAttachment = this.bodyAttachment;
    const bodyState = bodyAttachment?.getRigidBodyState();
    if (bodyAttachment && bodyState) {
      const idealX =
        kt.bodyIdealWorldX * meshScale + pos.x + bodyAttachment.centroidDelta.x;
      const idealY =
        kt.bodyIdealWorldY * meshScale + pos.y + bodyAttachment.centroidDelta.y;
      bodyAttachment.applyCorrectiveForce(
        idealX,
        idealY,
        kt.bodyIdealRotation,
        ms
      );
      kt.bodyWorldOffsetX = (bodyState.x - idealX) / meshScale;
      kt.bodyWorldOffsetY = (bodyState.y - idealY) / meshScale;
      kt.bodyRotationOffset = bodyState.rotation - kt.bodyIdealRotation;
    } else {
      kt.bodyWorldOffsetX = 0;
      kt.bodyWorldOffsetY = 0;
      kt.bodyRotationOffset = 0;
    }

    // Head
    const headAttachment = this.headAttachment;
    const headState = headAttachment?.getRigidBodyState();
    if (headAttachment && headState) {
      const idealX =
        kt.headIdealWorldX * meshScale + pos.x + headAttachment.centroidDelta.x;
      const idealY =
        kt.headIdealWorldY * meshScale + pos.y + headAttachment.centroidDelta.y;
      headAttachment.applyCorrectiveForce(
        idealX,
        idealY,
        kt.headIdealRotation,
        ms
      );
      kt.headWorldOffsetX = (headState.x - idealX) / meshScale;
      kt.headWorldOffsetY = (headState.y - idealY) / meshScale;
      kt.headRotationOffset = headState.rotation - kt.headIdealRotation;
    } else {
      kt.headWorldOffsetX = 0;
      kt.headWorldOffsetY = 0;
      kt.headRotationOffset = 0;
    }
  }

  // ---------------------------------------------------------------------------
  // Utility
  // ---------------------------------------------------------------------------

  private _findPlayer(): BaseEntityType | null {
    if (this.playerEntity) return this.playerEntity;
    if (!this.level) return null;
    for (const [, entity] of this.level.getEntities()) {
      if (entity.type === "Player") {
        this.playerEntity = entity;
        return entity;
      }
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  // Attachments & hull extraction
  // ---------------------------------------------------------------------------

  private _constructAttachments() {
    const headResult = EchoAttachment.extractHullFromSlots(
      this.threeSpine,
      HEAD_HULL_SLOTS
    );
    if (headResult) {
      this.headAttachment = new EchoAttachment({
        position: this.position.clone(),
        parent: this,
        threeSpine: this.threeSpine,
        hullPoints: headResult.points,
        centroid: headResult.centroid,
        hullSlotNames: [...HEAD_HULL_SLOTS],
        flashSlots: [...HEAD_FLASH_SLOTS],
        debugPolygons: this.debugPolygons,
        debugColor: 0xff3333
      });
      this.headAttachment.events.on(EntityLifecycleEvents.Hit, (hit) => {
        this._onHeadHit(hit);
      });
      this.children.push(this.headAttachment);
    }

    const bodyResult = EchoAttachment.extractHullFromSlots(
      this.threeSpine,
      BODY_HULL_SLOTS
    );
    if (bodyResult) {
      this.bodyAttachment = new EchoAttachment({
        position: this.position.clone(),
        parent: this,
        threeSpine: this.threeSpine,
        hullPoints: bodyResult.points,
        centroid: bodyResult.centroid,
        hullSlotNames: [...BODY_HULL_SLOTS],
        flashSlots: [...BODY_FLASH_SLOTS],
        debugPolygons: this.debugPolygons,
        debugColor: 0x33ff33
      });
      this.bodyAttachment.events.on(EntityLifecycleEvents.Hit, (hit) => {
        this._onBodyHit(hit);
      });
      this.children.push(this.bodyAttachment);
    }

    // Pass hull slot names to the knockback timeline so it can compute
    // the animated centroid from the reference skeleton each frame.
    if (this.knockbackTimeline) {
      this.knockbackTimeline.setup(
        this.threeSpine.skeleton,
        this.refSkeleton,
        [...BODY_HULL_SLOTS],
        [...HEAD_HULL_SLOTS]
      );
    }
  }

  /**
   * Re-extract convex hulls from the current skeleton pose and update the
   * attachment collider shapes. Called after the transform animation completes
   * since the skeleton geometry changes significantly between Idle and Idle2.
   */
  private _recalculateAttachmentHulls() {
    if (this.headAttachment) {
      const headResult = EchoAttachment.extractHullFromSlots(
        this.threeSpine,
        HEAD_HULL_SLOTS
      );
      if (headResult) {
        this.headAttachment.updateHull(headResult.points, headResult.centroid);
      }
    }
    if (this.bodyAttachment) {
      const bodyResult = EchoAttachment.extractHullFromSlots(
        this.threeSpine,
        BODY_HULL_SLOTS
      );
      if (bodyResult) {
        this.bodyAttachment.updateHull(bodyResult.points, bodyResult.centroid);
      }
    }

    // Reset knockback offsets and recapture base rotations so the spring
    // re-centers on the new ideal positions/rotations.
    if (this.knockbackTimeline) {
      this.knockbackTimeline.headWorldOffsetX = 0;
      this.knockbackTimeline.headWorldOffsetY = 0;
      this.knockbackTimeline.bodyWorldOffsetX = 0;
      this.knockbackTimeline.bodyWorldOffsetY = 0;
      this.knockbackTimeline.bodyRotationOffset = 0;
      this.knockbackTimeline.headRotationOffset = 0;
      this.knockbackTimeline.recaptureBaseRotations();
    }

    // Log post-transform collider state for verification
    if (this.debugPolygons) {
      const bodyState = this.bodyAttachment?.getRigidBodyState();
      const headState = this.headAttachment?.getRigidBodyState();
      console.log(
        `[Echo] hulls recalculated — body RB=(${bodyState?.x.toFixed(2)},${bodyState?.y.toFixed(2)}) rot=${bodyState?.rotation.toFixed(3)} head RB=(${headState?.x.toFixed(2)},${headState?.y.toFixed(2)}) rot=${headState?.rotation.toFixed(3)}`
      );
    }
  }

  private _constructControlTesters() {
    const result = createControlTesters(this, this.threeSpine);
    this.children.push(...result.children);
    this.controlTesters = result.controlTesters;
    this.smallCannonTesters = result.smallCannonTesters;
    this.bigCannonTesters = result.bigCannonTesters;
    this.threeSpine.preWorldTransform = result.preWorldTransformHook;
  }

  wakeUpAndStartFight() {
    if (this.phase !== EchoBossPhase.Asleep) return;
    this._wakeIfAsleep();
  }

  setPhase(phase: EchoBossPhase) {
    this.phase = phase;
  }
}
