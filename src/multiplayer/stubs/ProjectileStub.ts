import { ElementalType, EntityHitDetails } from "src/api/entity";
import { getPlayer } from "src/engine/util/levelUtil";

import { EntityNetSummary } from "../api";
import { StubEntity, StubEntityProps } from "./StubEntity";

/**
 * Shared base for projectile-shaped stubs: dead-reckoned flight, a `flying`
 * flag mirroring the owner's projectile physics, and victim-authoritative
 * damage — this client decides its own player was hit by overlap-testing the
 * stub's predicted position, and applies it through the normal `hit` path.
 * Subclasses provide visuals via the hook methods.
 */
export class ProjectileStub extends StubEntity {
  protected damage = 5;
  protected element: ElementalType | undefined;
  protected flying = true;
  protected hitApplied = false;

  constructor(props: StubEntityProps) {
    super(props);
    this.readCombatFields(this.lastSummary);
  }

  private readCombatFields(summary: EntityNetSummary): void {
    if (typeof summary.damage === "number") this.damage = summary.damage;
    if (typeof summary.element === "string") {
      this.element = summary.element as ElementalType;
    }
    if (summary.flying === false) this.flying = false;
  }

  protected onSummary(summary: EntityNetSummary): void {
    this.readCombatFields(summary);
  }

  handleDespawn(_reason: string, finalSummary?: EntityNetSummary): void {
    if (finalSummary?.pos) {
      this.position.x = finalSummary.pos.x;
      this.position.y = finalSummary.pos.y;
      this.object3D.position.x = this.position.x;
      this.object3D.position.y = this.position.y;
    }
    this.flying = false;
    this.playImpact();
  }

  /** Owner said the projectile ended — play the exit, then remove. The
   *  default fades via setImpactFade over 120ms. */
  protected playImpact(): void {
    this.scheduler.add({
      id: "stubImpactFade",
      duration: 120,
      invokeFunction: (t) => this.setImpactFade(t),
      invokeFunctionAtComplete: () => this.removeSelf()
    });
  }

  /** Fade progress hook (0 → 1) while the impact exit plays. */
  protected setImpactFade(_t: number): void {}

  /** Per-frame visual advance (trails, sprites, particles). */
  protected advanceVisual(_deltaMs: number): void {}

  protected removeSelf(): void {
    this.level?.removeEntity(this.id);
    this.destroy();
  }

  step(deltaMs: number): void {
    if (this.flying) {
      super.step(deltaMs);
      this.checkLocalPlayerHit();
    } else {
      // Frozen at the impact point: keep lifetime/scheduler/visuals going.
      this.lifetimeMs += deltaMs;
      this.scheduler.step(deltaMs);
    }
    this.advanceVisual(deltaMs);
  }

  private checkLocalPlayerHit(): void {
    if (this.hitApplied || !this.level) return;
    const player = getPlayer(this.level);
    if (!player || player.dead) return;
    const halfW = player.size.width * 0.5 + 0.15;
    const halfH = player.size.height * 0.5 + 0.15;
    const dx = player.position.x - this.position.x;
    const dy = player.position.y - this.position.y;
    // Inclusive form so non-finite values can never pass the overlap test.
    if (!(Math.abs(dx) <= halfW && Math.abs(dy) <= halfH)) return;
    this.hitApplied = true;
    const details: EntityHitDetails = {
      hittingEntity: this,
      sourceEntity: this,
      damage: this.damage,
      elementalDamageType: this.element,
      hitImpulse: this.sampledVelocity.clone().normalize().multiplyScalar(2)
    };
    player.hit?.(details);
    // Stop visibly flying through the player; the owner's despawn message
    // (or parry deflection continuing the flight) supersedes this.
    this.flying = false;
    this.playImpact();
  }
}
