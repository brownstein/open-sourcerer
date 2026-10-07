import { ProtoSpriteThree } from "protosprite-three";
import { Color, ColorRepresentation } from "three";
import { ThreeAseprite } from "three-aseprite";

import {
  BaseEntityType,
  ElementalType,
  EntityBehavior,
  EntityHitDetails,
  EntityLifecycleEvents
} from "src/api/entity";
import { Scheduler } from "src/engine/scheduling/Scheduler";

import { HealthBarBehavior } from "./HealthBar";
import { SmokeParticlesBehavior } from "./SmokeParticles";

export class StatusBehavior implements EntityBehavior {
  public readonly type = "Status";
  public healthEnabled = true;
  public health = 25;
  public maxHealth = 25;
  public dead = false;
  public hasBeenHit = false;
  public hasBeenHitDetails?: EntityHitDetails;
  public healthBar = new HealthBarBehavior();
  /**
   * Invoked after a whole-sprite fade write, with the amount written. The fade
   * channel is shared with per-layer tinting (the player's customization
   * colors), and a whole-sprite write flattens it — owners of per-layer fades
   * repaint them when this reports the global fade back at 0.
   */
  public onFadeApplied?: (fadeAmount: number) => void;
  private entity?: BaseEntityType;
  private scheduler = new Scheduler();
  private highlightAmount = 0;
  private highlightColor = new Color(0xffffff);
  private lastHighlightAmount = 0;
  private lastHighlightColor = new Color(0xffffff);
  private fadeOverrideAmount?: number;
  private fadeOverrideColor = new Color(0xffffff);
  private lastFadeAmount = 0;
  private lastFadeColor = new Color(0xffffff);
  private fadeDirty = false;
  private threeSprites: ThreeAseprite[] = [];
  private protoSprites: ProtoSpriteThree[] = [];
  private wasHitMarker = false;
  private wasHitMarkerDetails?: EntityHitDetails;
  private onFire = false;
  private smokeParticles = new SmokeParticlesBehavior();
  constructor() {
    this.step = this.step.bind(this);
    this.applyHit = this.applyHit.bind(this);
  }
  init(entity: BaseEntityType) {
    this.entity = entity;
    this.entity.events.on(EntityLifecycleEvents.Step, this.step);
    this.entity.events.on(EntityLifecycleEvents.Hit, this.applyHit);
    this.smokeParticles.enableSpawn = false;
    this.smokeParticles.particleSettings.msBetweenSpawn = 40;
    this.smokeParticles.particleSettings.lifetimeMs = 500;
    const oldTransform = this.smokeParticles.particleSettings.transform;
    this.smokeParticles.particleSettings.transform = (particle, ms) => {
      oldTransform(particle, ms);
      particle.opacity *= 2.5;
      particle.size *= 1.5;
    };

    this.smokeParticles.init(this.entity);
    this.healthBar.init(this.entity);

    return this;
  }

  public debugSetColor(amount: number, color: Color) {
    this.highlightAmount = amount;
    this.highlightColor = color;
  }

  /**
   * Pins the attached sprites' fade to a fixed color/amount, taking priority
   * over the hit-flash highlight. Outlines still follow the highlight.
   */
  setFadeOverride(color: ColorRepresentation, amount: number) {
    this.fadeOverrideColor.set(color);
    this.fadeOverrideAmount = amount;
    return this;
  }

  clearFadeOverride() {
    this.fadeOverrideAmount = undefined;
    return this;
  }

  /**
   * Re-asserts an active fade override on the next step, for when something
   * else has since written per-layer fades over it. A no-op without an
   * override, so it never stomps per-layer tinting in the normal case.
   */
  markFadeDirty() {
    if (this.fadeOverrideAmount !== undefined) this.fadeDirty = true;
    return this;
  }

  applyHit(hit: EntityHitDetails) {
    this.wasHitMarker = true;
    this.wasHitMarkerDetails = hit;
    this.applyHitWithDuration(hit);
  }
  applyHitWithDuration(hit: EntityHitDetails, duration?: number) {
    if (this.dead) return;
    if (hit.damage === 0) return;

    if (this.healthEnabled) {
      this.health = Math.max(0, this.health - hit.damage);
      this.healthBar.setHealth(this.health / this.maxHealth);
      if (this.health <= 0) {
        this.entity?.events.emit(EntityLifecycleEvents.Die);
        this.markDead();
      }
    }

    this.scheduler.cancel("hit");
    switch (hit.elementalDamageType) {
      case ElementalType.Fire:
        this.onFire = true;
        this.highlightColor.set(0xffaa33);
        this.smokeParticles.enableSpawn = true;
        this.scheduler.add({
          id: "hitFire",
          duration: duration ?? 1500,
          invokeFunction: (t) => {
            this.highlightAmount = Math.sin(t * Math.PI * 4) * 0.15 + 0.25;
            this.highlightColor.r = 1;
            this.highlightColor.g = 0.7 + Math.sin(t * Math.PI * 10) * 0.15;
            this.highlightColor.b = 0.3;
          },
          invokeFunctionAtComplete: () => {
            this.highlightAmount = 0;
            this.onFire = false;
            this.smokeParticles.enableSpawn = false;
          }
        });
        break;
      case ElementalType.Wind:
        this.highlightColor.set(0xaaaaaa);
        this.scheduler.add({
          id: "hitAir",
          duration: duration ?? 800,
          invokeFunction: (t) => {
            this.highlightAmount = Math.sin(t * Math.PI) * 0.15 + 0.25;
          },
          invokeFunctionAtComplete: () => {
            this.highlightAmount = 0;
          }
        });
        break;
      case ElementalType.Nature:
        this.highlightColor.set(0x79e326);
        this.scheduler.add({
          id: "hitNature",
          duration: duration ?? 250,
          invokeFunction: (t) => {
            this.highlightAmount = Math.cos(t * Math.PI * 0.5) * 0.8;
          },
          invokeFunctionAtComplete: () => {
            this.highlightAmount = 0;
          }
        });
        break;
      default:
        this.highlightColor.set(0xffffff);
        this.scheduler.add({
          id: "hit",
          duration: duration ?? 250,
          invokeFunction: (t) => {
            this.highlightAmount = Math.cos(t * Math.PI * 0.5) * 0.8;
          },
          invokeFunctionAtComplete: () => {
            this.highlightAmount = 0;
            this.onFire = false;
          }
        });
        break;
    }
  }
  setMaxHealth(health: number) {
    this.maxHealth = health;
    this.health = health;
    return this;
  }
  disableHealth() {
    this.healthEnabled = false;
    this.healthBar.setOpacity(0);
    return this;
  }
  destroy() {
    this.smokeParticles.destroy();
    this.healthBar.destroy();
  }
  attachSprite(sprite: ThreeAseprite) {
    this.threeSprites.push(sprite);
    if (this.fadeOverrideAmount !== undefined) {
      sprite.setFade(this.fadeOverrideColor, this.fadeOverrideAmount);
    }
    return this;
  }
  attachProtosSprite(sprite: ProtoSpriteThree) {
    this.protoSprites.push(sprite);
    if (this.fadeOverrideAmount !== undefined) {
      sprite.fadeAllLayers(this.fadeOverrideColor, this.fadeOverrideAmount);
    }
    return this;
  }
  detachProtoSprite(sprite: ProtoSpriteThree) {
    this.protoSprites = this.protoSprites.filter((ps) => ps !== sprite);
  }
  step(ms: number) {
    this.scheduler.step(ms);
    const overridden = this.fadeOverrideAmount !== undefined;
    const fadeAmount = overridden
      ? (this.fadeOverrideAmount as number)
      : this.highlightAmount;
    const fadeColor = overridden ? this.fadeOverrideColor : this.highlightColor;
    // The outline always tracks the highlight, so it can go stale while the
    // fade is pinned — check both against what was last written.
    if (
      this.fadeDirty ||
      fadeAmount !== this.lastFadeAmount ||
      !fadeColor.equals(this.lastFadeColor) ||
      this.highlightAmount !== this.lastHighlightAmount ||
      !this.highlightColor.equals(this.lastHighlightColor)
    ) {
      for (const sprite of this.threeSprites) {
        sprite.setFade(fadeColor, fadeAmount);
        sprite.setOutline(
          this.highlightAmount ? 1 : 0,
          this.highlightColor,
          this.highlightAmount * 2
        );
      }
      for (const sprite of this.protoSprites) {
        sprite.fadeAllLayers(fadeColor, fadeAmount);
        sprite.outlineAllLayers(
          this.highlightAmount ? 1 : 0,
          this.highlightColor,
          this.highlightAmount * 2
        );
      }
      this.lastFadeAmount = fadeAmount;
      this.lastFadeColor.copy(fadeColor);
      this.lastHighlightAmount = this.highlightAmount;
      this.lastHighlightColor.copy(this.highlightColor);
      this.fadeDirty = false;
      this.onFadeApplied?.(fadeAmount);
    }

    // set that we have been hit for the single game tick that it happened
    this.hasBeenHit = this.wasHitMarker;
    this.hasBeenHitDetails = this.wasHitMarkerDetails;

    this.wasHitMarker = false;
    this.wasHitMarkerDetails = undefined;
  }
  markDead() {
    this.dead = true;
    this.scheduler.cancel("hit");
    this.scheduler.cancel("hitFire");
    this.highlightAmount = 0;
    if (!this.healthBar.getOpacity()) return;
    this.scheduler.add({
      id: "barFadeOut",
      duration: 250,
      invokeFunction: (t) => {
        this.healthBar.setOpacity(1 - t);
      },
      invokeFunctionAtComplete: () => {
        this.healthBar.setOpacity(0);
      }
    });
  }
}
