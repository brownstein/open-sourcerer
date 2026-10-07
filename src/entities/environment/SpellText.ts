import { Color, Object3D } from "three";

import { EntityAlignment, EntityLevelAPI, EntityProps } from "src/api/entity";
import { SpellCtx, SpellCtxConsoleLogLine, SpellsAPI } from "src/api/spells";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import { setConsumerDependencies } from "src/engine/entity/decorators";

import { isPlayerAPI } from "../player/PlayerAPI";
import {
  AreaSensorBehavior,
  AreaSensorEvents
} from "../shared/behaviors/AreaSensorBehavior";
import { SignalConnectionBehavior } from "../shared/behaviors/SignalConnectionBehavior";
import { SpellExecutionListenerBehavior } from "../shared/behaviors/SpellExecutionListenerBehavior";
import { AvailableFont, TextPixelated } from "./TextPixelated";

export type SpellTextProps = EntityProps & {
  // the phrase the player must console.log to solve this
  phrase?: string;
  range?: number;

  mainColor?: string;
  correctColor?: string;
  incorrectColor?: string;
  mainGlowColor?: string;
  inRangeGlowColor?: string;
  correctGlowColor?: string;
  incorrectGlowColor?: string;

  scale?: number;
  horizontalSpacing?: number;

  floatyAmplitude?: number;
  floatyRotationAmplitude?: number;
  floatyScaleAmplitude?: number;
  floatySpeed?: number;
  inRangeStaticness?: number;

  outline?: boolean;
  outlineColor?: string;
  outlineWidth?: number;
};

// eases value toward target by a frame-scaled fraction
function approach(value: number, target: number, alpha: number): number {
  return value + (target - value) * Math.min(Math.max(alpha, 0), 1);
}

@setConsumerDependencies(() => [TextPixelated])
export class SpellText extends CoreEntity {
  static type = "SpellText";
  public type = SpellText.type;
  public alignment = EntityAlignment.Environment;
  public object3D = new Object3D();

  public behaviors = {
    spellListener: new SpellExecutionListenerBehavior(),
    signal: new SignalConnectionBehavior(),
    sensor: new AreaSensorBehavior()
  };

  private static readonly FONT: AvailableFont = "fredoka";
  private static readonly FONT_SIZE = 32;
  private static readonly GLOW_RADIUS = 12;
  private static readonly TEXEL_SCALE = SpellText.FONT_SIZE / 18;
  private static readonly VERTICAL_SPACING = 3 * SpellText.TEXEL_SCALE;

  private static readonly IDLE_GLOW = 0.35;
  private static readonly IN_RANGE_GLOW = 1.8;
  private static readonly SOLVED_GLOW = 2.2;

  private static readonly IN_RANGE_SCALE = 1.12;
  private static readonly SOLVED_SCALE = 1.35;

  private static readonly PULSE_SIZE = 0.12;
  private static readonly PULSE_MS = 260;

  // feedback holds at full strength, then eases back over the fade window
  private static readonly FEEDBACK_HOLD_MS = 1600;
  private static readonly FADE_BACK_MS = 1200;

  private static readonly RANGE_EASE_MS = 350;
  private static readonly SCALE_EASE_MS = 220;
  private static readonly GLOW_EASE_MS = 300;
  // phase offset per character so the drift ripples along the phrase
  private static readonly FLOATY_PHASE_STEP = 0.6;
  private static readonly FEEDBACK_GLOW_BOOST = 0.6;

  private readonly phrase: string;

  private readonly mainColorObj: Color;
  private readonly correctColorObj: Color;
  private readonly incorrectColorObj: Color;
  private readonly mainGlowObj: Color;
  private readonly inRangeGlowObj: Color;
  private readonly correctGlowObj: Color;
  private readonly incorrectGlowObj: Color;

  private readonly scale: number;
  private readonly horizontalSpacing: number;
  private readonly outline: boolean;
  private readonly outlineColor: string;
  private readonly outlineWidth: number;

  private readonly floatyAmplitude: number;
  private readonly floatyRotationAmplitude: number;
  private readonly floatyScaleAmplitude: number;
  private readonly floatySpeed: number;
  private readonly inRangeStaticness: number;

  private textEntity?: TextPixelated;
  private playerInRange = false;
  private solved = false;

  // eased animation state
  private rangeAmount = 0;
  private baseScale = 1;
  private glowIntensity = SpellText.IDLE_GLOW;
  private pulseTimer = Infinity;
  private feedbackHoldTimer = 0;
  private glowFeedbackAmount = 0;
  private readonly glowFeedbackColor = new Color();

  // per-character feedback, sized once the text has been generated
  private charFeedbackAmount: number[] = [];
  private charLockFeedbackAmount: number[] = [];
  private charFeedbackColor: Color[] = [];

  private readonly scratchColor = new Color();

  constructor(props: SpellTextProps) {
    super(props);

    this.phrase = props.phrase ?? "Hello, World!";

    // the sensor box covers a square of side 2 * range around the text
    const range = props.range ?? 6;
    this.size = { width: range * 2, height: range * 2 };

    this.mainColorObj = new Color(props.mainColor ?? "#ffffff");
    this.correctColorObj = new Color(props.correctColor ?? "#7cff6b");
    this.incorrectColorObj = new Color(props.incorrectColor ?? "#ff5c5c");
    this.mainGlowObj = new Color(props.mainGlowColor ?? "#6db3ff");
    this.inRangeGlowObj = new Color(props.inRangeGlowColor ?? "#ffffff");
    this.correctGlowObj = new Color(props.correctGlowColor ?? "#5bff7a");
    this.incorrectGlowObj = new Color(props.incorrectGlowColor ?? "#ff4d4d");

    this.scale = props.scale ?? 1;
    this.horizontalSpacing =
      props.horizontalSpacing ?? 3 * SpellText.TEXEL_SCALE;
    this.outline = props.outline ?? true;
    this.outlineColor = props.outlineColor ?? "#222034";
    this.outlineWidth = props.outlineWidth ?? 1;

    this.floatyAmplitude = props.floatyAmplitude ?? 1.6 * SpellText.TEXEL_SCALE;
    this.floatyRotationAmplitude = props.floatyRotationAmplitude ?? 0.09;
    this.floatyScaleAmplitude = props.floatyScaleAmplitude ?? 0.06;
    this.floatySpeed = props.floatySpeed ?? 2.2;
    this.inRangeStaticness = props.inRangeStaticness ?? 0.65;

    this.behaviors.signal.init(this);
    this.behaviors.sensor.init(this);
    this.behaviors.sensor.events.on(
      AreaSensorEvents.EntityContact,
      (entity) => {
        if (isPlayerAPI(entity)) this.playerInRange = true;
      }
    );
    this.behaviors.sensor.events.on(
      AreaSensorEvents.EntityContactEnd,
      (entity) => {
        if (isPlayerAPI(entity)) this.playerInRange = false;
      }
    );
    this.behaviors.spellListener
      .onExecutionStart(this._onExecutionStart)
      .onConsoleLog(this._onConsoleLog);
  }

  attachToLevel(level: EntityLevelAPI): void {
    super.attachToLevel(level);

    this.textEntity = new TextPixelated({
      position: this.position.clone(),
      angle: this.angle,
      polyline: this.initialProps.polyline,
      text: this.phrase,
      font: SpellText.FONT,
      fontSize: SpellText.FONT_SIZE,
      // one glyph per character so per-character feedback lines up
      ligatures: false,
      horizontalSpacing: this.horizontalSpacing,
      verticalSpacing: SpellText.VERTICAL_SPACING,
      color: this.mainColorObj.getStyle(),
      outline: this.outline,
      outlineColor: this.outlineColor,
      outlineWidth: this.outlineWidth,
      glow: true,
      glowColor: this.mainGlowObj.getStyle(),
      glowRadius: SpellText.GLOW_RADIUS,
      glowIntensity: SpellText.IDLE_GLOW
    });
    level.addEntity(this.textEntity);

    const count = this.textEntity.characterCount();
    this.charFeedbackAmount = new Array(count).fill(0);
    this.charLockFeedbackAmount = new Array(count).fill(0);
    this.charFeedbackColor = Array.from({ length: count }, () => new Color());
  }

  detachFromLevel(level: EntityLevelAPI): void {
    super.detachFromLevel(level);
    if (this.textEntity) {
      level.removeEntity(this.textEntity.id);
      this.textEntity = undefined;
    }
  }

  attachToSpellApi(api: SpellsAPI): void {
    this.behaviors.spellListener.attachToSpellApi(api);
  }
  detachFromSpellApi(api: SpellsAPI): void {
    this.behaviors.spellListener.detachFromSpellApi(api);
  }

  step(deltaMs: number): void {
    super.step(deltaMs);
    const text = this.textEntity;
    if (!text) return;

    this.rangeAmount = approach(
      this.rangeAmount,
      this.playerInRange ? 1 : 0,
      deltaMs / SpellText.RANGE_EASE_MS
    );

    this._updateFeedbackFade(deltaMs);
    this._updateScale(text, deltaMs);
    this._updateGlow(text, deltaMs);
    this._updateCharacters(text);
  }

  destroy(): void {
    super.destroy();
    this.textEntity = undefined;
  }

  // once holds expire, ease the feedback color/lock back toward the drift default
  private _updateFeedbackFade(deltaMs: number): void {
    if (this.solved) return;
    if (this.feedbackHoldTimer > 0) {
      this.feedbackHoldTimer -= deltaMs;
      return;
    }
    const fade = deltaMs / SpellText.FADE_BACK_MS;
    this.glowFeedbackAmount = Math.max(0, this.glowFeedbackAmount - fade);
    for (let i = 0; i < this.charFeedbackAmount.length; i++) {
      this.charFeedbackAmount[i] = Math.max(
        0,
        this.charFeedbackAmount[i] - fade
      );
      this.charLockFeedbackAmount[i] = Math.max(
        0,
        this.charLockFeedbackAmount[i] - fade
      );
    }
  }

  // whole-text expansion, plus a quick per-log pulse layered on top
  private _updateScale(text: TextPixelated, deltaMs: number): void {
    const targetScale = this.solved
      ? SpellText.SOLVED_SCALE
      : 1 + this.rangeAmount * (SpellText.IN_RANGE_SCALE - 1);
    this.baseScale = approach(
      this.baseScale,
      targetScale,
      deltaMs / SpellText.SCALE_EASE_MS
    );

    let pulse = 0;
    if (this.pulseTimer < SpellText.PULSE_MS) {
      this.pulseTimer += deltaMs;
      pulse = Math.sin(
        Math.PI * Math.min(1, this.pulseTimer / SpellText.PULSE_MS)
      );
    }
    text.object3D.scale.setScalar(
      this.scale * (this.baseScale + pulse * SpellText.PULSE_SIZE)
    );
  }

  // glow drifts from main toward white as the player nears, with feedback flashes
  // and the solved color taking precedence
  private _updateGlow(text: TextPixelated, deltaMs: number): void {
    this.scratchColor
      .copy(this.mainGlowObj)
      .lerp(this.inRangeGlowObj, this.rangeAmount);
    if (this.glowFeedbackAmount > 0) {
      this.scratchColor.lerp(this.glowFeedbackColor, this.glowFeedbackAmount);
    }
    if (this.solved) this.scratchColor.copy(this.correctGlowObj);
    text.setGlowColor(this.scratchColor.getStyle());

    const targetIntensity = this.solved
      ? SpellText.SOLVED_GLOW
      : SpellText.IDLE_GLOW +
        this.rangeAmount * (SpellText.IN_RANGE_GLOW - SpellText.IDLE_GLOW);
    this.glowIntensity = approach(
      this.glowIntensity,
      targetIntensity,
      deltaMs / SpellText.GLOW_EASE_MS
    );
    text.setGlowIntensity(
      this.glowIntensity +
        this.glowFeedbackAmount * SpellText.FEEDBACK_GLOW_BOOST
    );
  }

  // per-character color and floaty transform; being in range or locked in calms
  // the drift, and solving freezes it entirely
  private _updateCharacters(text: TextPixelated): void {
    const tSec = this.lifetimeMs / 1000;
    const staticFromRange = this.rangeAmount * this.inRangeStaticness;
    const count = text.characterCount();
    const colors: string[] = new Array(count);

    for (let i = 0; i < count; i++) {
      colors[i] = this._characterColor(i);

      const lockIn = this.solved
        ? 1
        : Math.max(staticFromRange, this.charLockFeedbackAmount[i] ?? 0);
      const drift = 1 - lockIn;
      const phase = i * SpellText.FLOATY_PHASE_STEP;

      text.setCharacterTransform(i, {
        x:
          Math.sin(tSec * this.floatySpeed + phase) *
          this.floatyAmplitude *
          drift,
        y:
          Math.cos(tSec * this.floatySpeed * 0.8 + phase * 1.3) *
          this.floatyAmplitude *
          drift,
        rotation:
          Math.sin(tSec * this.floatySpeed * 0.7 + phase) *
          this.floatyRotationAmplitude *
          drift,
        scale:
          1 +
          Math.sin(tSec * this.floatySpeed * 1.1 + phase) *
            this.floatyScaleAmplitude *
            drift
      });
    }
    text.setColors(colors, false);
  }

  private _characterColor(index: number): string {
    if (this.solved) return this.correctColorObj.getStyle();
    if ((this.charFeedbackAmount[index] ?? 0) > 0) {
      this.scratchColor
        .copy(this.mainColorObj)
        .lerp(this.charFeedbackColor[index], this.charFeedbackAmount[index]);
      return this.scratchColor.getStyle();
    }
    return this.mainColorObj.getStyle();
  }

  // only react to player-cast spells while the player is inside the sensor
  private readonly _onExecutionStart = (ctx: SpellCtx): boolean => {
    if (this.solved) return false;
    return isPlayerAPI(ctx.getCaster()) && this.playerInRange;
  };

  private readonly _onConsoleLog = (logLine: SpellCtxConsoleLogLine): void => {
    if (this.solved) return;
    const log = this._formatConsoleLogLine(logLine);
    if (log.length === 0) return;

    this.pulseTimer = 0;

    const { matched, full } = this._matchPhrase(log);
    if (full) {
      this._solve();
      return;
    }

    // flash matched characters correct and the rest incorrect, then hold and fade
    this.feedbackHoldTimer = SpellText.FEEDBACK_HOLD_MS;
    this.glowFeedbackColor.copy(this.incorrectGlowObj);
    this.glowFeedbackAmount = 1;
    const count = Math.min(matched.length, this.charFeedbackColor.length);
    for (let i = 0; i < count; i++) {
      this.charFeedbackColor[i].copy(
        matched[i] ? this.correctColorObj : this.incorrectColorObj
      );
      this.charFeedbackAmount[i] = 1;
      if (matched[i]) this.charLockFeedbackAmount[i] = 1;
    }
  };

  private _solve(): void {
    this.solved = true;
    this.behaviors.signal.transmit({ value: true });
  }

  // a full match is the phrase appearing as a case-insensitive substring. for a
  // partial log we slide the phrase against it and keep the best-aligned offset,
  // so a short or padded log still highlights the right characters.
  private _matchPhrase(log: string): { matched: boolean[]; full: boolean } {
    const target = this.phrase.toLowerCase();
    const hay = log.toLowerCase();
    const n = target.length;

    if (hay.includes(target)) {
      return { matched: new Array(n).fill(true), full: true };
    }

    let bestShift = 0;
    let bestScore = -1;
    for (let shift = -(n - 1); shift < hay.length; shift++) {
      let score = 0;
      for (let i = 0; i < n; i++) {
        const j = i + shift;
        if (j >= 0 && j < hay.length && hay[j] === target[i]) score++;
      }
      if (score > bestScore) {
        bestScore = score;
        bestShift = shift;
      }
    }

    const matched = new Array<boolean>(n);
    for (let i = 0; i < n; i++) {
      const j = i + bestShift;
      matched[i] = j >= 0 && j < hay.length && hay[j] === target[i];
    }
    return { matched, full: false };
  }

  private _formatConsoleLogLine(logLine: SpellCtxConsoleLogLine): string {
    const text =
      logLine.primitiveValue !== undefined && logLine.primitiveValue !== null
        ? logLine.primitiveValue.toString()
        : logLine.objectValue !== undefined
          ? JSON.stringify(logLine.objectValue)
          : "";
    return text.trim();
  }
}
