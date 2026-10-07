import { Vector2 } from "three";

import {
  ElementalType,
  EntityBehavior,
  EntityLevelEvents,
  LevelAPI
} from "src/api/entity";

import {
  PlayerLayer,
  PlayerSprite,
  SpellsSprite
} from "./PlayerInternals";
import * as spellTypes from "./sprites/wolf-spells";

type SpellAnimation = spellTypes.sprite_animations;
type SpellLayer = spellTypes.sprite_layers;

// Cast lifecycle, mirroring the player's own cast animation phases.
enum CastPhase {
  Idle,
  Anticipating, // CastStart -> CastHoldStart: anticipation frames advance
  Holding, // CastHoldStart -> CastHoldEnd: loop the hold range
  Releasing // CastHoldEnd -> end: attack/summon frames advance to completion
}

export interface SpellSpriteSyncOptions {
  /** Maps a cast's elemental type to the spells-sprite animation to play. */
  elementAnimations?: Partial<Record<ElementalType, SpellAnimation>>;
  /** Animation used when the element is unmapped or undefined. */
  fallbackAnimation?: SpellAnimation;
  /** Alignment-marker layer on the spells sprite. */
  spellsAlignLayer?: SpellLayer;
  /** Alignment-marker layer on the reference player sprite. */
  referenceAlignLayer?: PlayerLayer;
  /** Multiplier applied to the cast speed when driving the spells animation. */
  baseSpeedScaler?: number;
  /** Marker/system layers on the spells sprite to keep hidden (never rendered). */
  hiddenLayers?: SpellLayer[];
  /**
   * Player-sprite effect layers to hide for the duration of a cast (the spells
   * sprite supplies the effect instead). Covers both sheets' naming: the female
   * sheet uses effect_0N, the male sheet uses effects_0N.
   */
  playerEffectLayers?: PlayerLayer[];
}

// Default element -> spells-sprite animation.
//
// Only animations authored to the player `spell` cadence (300ms lead-in, then
// 80ms frames; anticipation 0-5, hold from frame 6) sync cleanly, since the
// effect is frame-slaved to the player's cast frame (see the class doc). The
// thematic effects do: fire_spell, ice_spell, regular_spell. The air_* and
// fast_* variants do NOT (different frame layouts/durations), so Wind /
// Electricity / Nature are remapped to the generic regular_spell (the cast
// color still tints them per-element). Earth keeps air_rock_spell — its kick
// frames are duration-identical to the player's air_rock_spell.
const DEFAULT_ELEMENT_ANIMATIONS: Record<ElementalType, SpellAnimation> = {
  [ElementalType.Fire]: "fire_spell",
  [ElementalType.Ice]: "ice_spell",
  [ElementalType.Earth]: "air_rock_spell",
  [ElementalType.Mana]: "regular_spell",
  [ElementalType.Wind]: "regular_spell",
  [ElementalType.Electricity]: "regular_spell",
  [ElementalType.Nature]: "regular_spell"
};

/**
 * Drives the player's standalone "spells" sprite, kept in sync with the
 * player's own cast animation:
 *
 *  - **Frame-slaving:** through anticipation and the hold, the effect's frame is
 *    driven directly from the player's cast frame, not advanced by time. The
 *    effects share the player cast's frame indices (anticipation 0-5, hold from
 *    6), so this makes the hands and effect move together even when their
 *    authored per-frame *durations* differ (e.g. fire_spell). On release the
 *    effect free-advances its summon so it plays out fully while the hands
 *    return to idle.
 *  - While playing, pins the spells sprite to a reference player sprite by
 *    matching alignment-marker pixels (`align_spell` <-> the reference layer)
 *    and mirrors the reference sprite's facing.
 *  - Hides the player's built-in cast effect layers for the duration of the
 *    cast (the spells sprite is the effect), restoring them afterward.
 *  - Stays hidden whenever no cast is playing.
 *
 * The owning entity drives it via {@link playCast} / {@link beginHold} /
 * {@link releaseHold} / {@link onCastFired} (wired to CastStart / CastHoldStart
 * / CastHoldEnd / CastEnd).
 *
 * NOTE: reads the reference sprite's `mesh.position` (set by the
 * AnimationControlBehavior's composite alignment each Step), so it must step
 * **after** that behavior — declare it after `animation` in the entity's
 * `behaviors` map so its Step listener registers later.
 */
export class SpellSpriteSyncBehavior implements EntityBehavior {
  public readonly type = "SpellSpriteSync";

  private spells?: SpellsSprite;
  private reference?: PlayerSprite;

  private readonly elementAnimations: Record<ElementalType, SpellAnimation>;
  private readonly fallbackAnimation: SpellAnimation;
  private readonly spellsAlignLayer: SpellLayer;
  private readonly referenceAlignLayer: PlayerLayer;
  private readonly baseSpeedScaler: number;
  private readonly hiddenLayers: SpellLayer[];
  private readonly playerEffectLayers: PlayerLayer[];

  private phase: CastPhase = CastPhase.Idle;
  private completed = false;
  // Last relative frame index of the currently-playing effect animation, used
  // to clamp the slaved player frame.
  private effectLastFrame = 0;

  // Reusable scratch vectors for the per-frame alignment math.
  private readonly anchorA = new Vector2();
  private readonly anchorB = new Vector2();

  constructor(options: SpellSpriteSyncOptions = {}) {
    this.elementAnimations = {
      ...DEFAULT_ELEMENT_ANIMATIONS,
      ...options.elementAnimations
    };
    this.fallbackAnimation = options.fallbackAnimation ?? "regular_spell";
    this.spellsAlignLayer = options.spellsAlignLayer ?? "align_spell";
    // NOTE: the player sprite has no `align_spell` marker on its main `spell`
    // cast frames — `align_spell_ladder` only exists on the spell_ladder*
    // animations. `align_chest` is populated on every frame and tracks the
    // cast point, so it's the working reference anchor for normal casts.
    this.referenceAlignLayer = options.referenceAlignLayer ?? "align_chest";
    this.baseSpeedScaler = options.baseSpeedScaler ?? 1;
    this.hiddenLayers = options.hiddenLayers ?? ["align_spell", "engine"];
    this.playerEffectLayers = options.playerEffectLayers ?? [
      "effect_01",
      "effect_02",
      "effects_01",
      "effects_02"
    ];
  }

  /**
   * Wire up the spells sprite and the player sprite it aligns to. `reference`
   * should be the sprite carrying the cast-anchor marker (the upper body),
   * already positioned by the AnimationControlBehavior.
   */
  attachSprites(
    spells: SpellsSprite,
    reference: PlayerSprite
  ): SpellSpriteSyncBehavior {
    this.spells = spells;
    this.reference = reference;

    // Marker/system layers should never render.
    if (this.hiddenLayers.length) spells.hideLayers(...this.hiddenLayers);

    // Frame-accurate one-shot playback; completion detected via animationLooped.
    spells.setAnimationLooping(false);
    spells.events.on("animationLooped", this._onAnimationEnd);

    // Idle (invisible) until the first cast.
    spells.mesh.visible = false;

    return this;
  }

  attachToLevel(level: LevelAPI): void {
    level.on(EntityLevelEvents.Step, this.step);
  }

  detachFromLevel(level: LevelAPI): void {
    level.off(EntityLevelEvents.Step, this.step);
  }

  destroy(): void {
    this.spells?.events.off("animationLooped", this._onAnimationEnd);
  }

  /**
   * CastStart: begin the cast. Plays the element-appropriate animation from the
   * start at the given cast speed and enters the anticipation phase.
   */
  playCast(elementalType: ElementalType | undefined, castSpeed: number): void {
    const spells = this.spells;
    if (!spells) return;

    const tag =
      (elementalType && this.elementAnimations[elementalType]) ??
      this.fallbackAnimation;

    this.completed = false;
    this.phase = CastPhase.Anticipating;

    spells.setAnimationLooping(false);
    spells.setAnimationSpeed(Math.max(0, castSpeed) * this.baseSpeedScaler);
    spells.gotoAnimation(tag);
    spells.gotoAnimationFrame(0);
    spells.mesh.visible = true;

    const animData = spells.data.sprite.maps.animationMap.get(tag);
    this.effectLastFrame = animData
      ? animData.indexEnd - animData.indexStart
      : 0;

    // Hide the player's built-in cast effect for the duration of the cast.
    this._setPlayerEffectLayersHidden(true);

    // Position correctly on the very first visible frame.
    this._sync();
  }

  /** CastHoldStart: the player entered the hold (still slaved to its frame). */
  beginHold(): void {
    if (this.phase !== CastPhase.Idle) this.phase = CastPhase.Holding;
  }

  /** CastHoldEnd: the player released — free-advance the summon to completion. */
  releaseHold(): void {
    if (this.phase !== CastPhase.Idle) this.phase = CastPhase.Releasing;
  }

  /**
   * CastEnd: the cast fired. For a no-hold cast (no CastHoldStart/End, e.g. the
   * earth kick) this is the cue to stop slaving and free-advance the summon.
   * For held casts it arrives after releaseHold(), so it is a no-op.
   */
  onCastFired(): void {
    if (this.phase === CastPhase.Anticipating) this.phase = CastPhase.Releasing;
  }

  /** Stop, hide, and restore the player's effect layers (interrupt/cleanup). */
  stopCast(): void {
    this._finish();
  }

  private _finish(): void {
    this.phase = CastPhase.Idle;
    this.completed = false;
    if (this.spells) this.spells.mesh.visible = false;
    this._setPlayerEffectLayersHidden(false);
  }

  private readonly _onAnimationEnd = (): void => {
    // The non-looping animation reached its final frame.
    this.completed = true;
  };

  readonly step = (deltaMs: number): void => {
    if (this.phase === CastPhase.Idle || !this.spells) return;

    // Completed on a prior frame (event fired after our step) — tear down.
    if (this.completed) {
      this._finish();
      return;
    }

    if (
      this.phase === CastPhase.Anticipating ||
      this.phase === CastPhase.Holding
    ) {
      // Frame-slave the effect to the player's current cast frame so the hands
      // and effect stay locked together regardless of authored per-frame
      // durations. The effects share the player cast's frame indices
      // (anticipation 0-5, hold from frame 6); clamp to the effect's range.
      const reference = this.reference;
      if (reference) {
        const playerFrame = reference.getAnimationFrame();
        this.spells.gotoAnimationFrame(
          Math.max(0, Math.min(playerFrame, this.effectLastFrame))
        );
      }
      this._sync();
      return;
    }

    // Releasing: free-advance the summon to completion (it plays out fully
    // while the player's hands return to idle).
    this.spells.advance(deltaMs);
    if (this.completed) {
      this._finish();
      return;
    }
    this._sync();
  };

  private _setPlayerEffectLayersHidden(hidden: boolean): void {
    const reference = this.reference;
    if (!reference || !this.playerEffectLayers.length) return;
    if (hidden) reference.hideLayers(...this.playerEffectLayers);
    else reference.showLayers(...this.playerEffectLayers);
  }

  /**
   * Pin the spells sprite to the reference sprite by matching alignment-marker
   * centers, and mirror the reference's facing. Each marker center is converted
   * from local pixel space to object3D units via the sprite's mesh scale (which
   * carries the facing sign); the spells sprite is then placed so its marker
   * lands on the reference's marker, accounting for the reference's own offset:
   *
   *   spells.pos + anchorA === reference.pos + anchorB
   */
  private _sync(): void {
    const spells = this.spells;
    const reference = this.reference;
    if (!spells || !reference) return;

    // Mirror facing from the reference sprite's scale sign.
    const facing = Math.sign(reference.mesh.scale.x) || 1;
    spells.mesh.scale.x = facing * Math.abs(spells.mesh.scale.x);

    // A marker layer can be absent on a given frame (its bounds come back
    // empty/non-finite). Hold the last position rather than snapping to NaN.
    const spellsBounds = spells.getLayerBounds(this.spellsAlignLayer);
    const referenceBounds = reference.getLayerBounds(this.referenceAlignLayer);
    if (
      !isFinite(spellsBounds.min.x) ||
      !isFinite(referenceBounds.min.x) ||
      spellsBounds.max.x < spellsBounds.min.x ||
      referenceBounds.max.x < referenceBounds.min.x
    ) {
      return;
    }
    spellsBounds.getCenter(this.anchorA);
    referenceBounds.getCenter(this.anchorB);

    this.anchorA.x *= spells.mesh.scale.x;
    this.anchorA.y *= spells.mesh.scale.y;
    this.anchorB.x *= reference.mesh.scale.x;
    this.anchorB.y *= reference.mesh.scale.y;

    spells.mesh.position.x =
      reference.mesh.position.x + this.anchorB.x - this.anchorA.x;
    spells.mesh.position.y =
      reference.mesh.position.y + this.anchorB.y - this.anchorA.y;
  }
}
