import { ProtoSpriteSheetThree } from "protosprite-three";
import { Vector2 } from "three";

import {
  DamageType,
  ElementalType,
  EntityHitDetails,
  EntityLevelAPI
} from "src/api/entity";
import { SoundType } from "src/api/sound";
import { kInvPixelScale, kPixelScale } from "src/engine/constants/scaling";
import {
  addResourceLoader,
  getAsset,
  getResource,
  setAssetDependencies
} from "src/engine/entity/decorators";
import { ProtoSpriteLoader } from "src/engine/loader/Loaders";
import { PositionalSound } from "src/engine/sound/Sound";
import { getPlayer } from "src/engine/util/levelUtil";
import * as explosionTypes from "src/entities/spells/blasts/sprites/explosion-types";
import explosionPrs from "src/entities/spells/blasts/sprites/explosion.prs";

import { StubEntity, StubEntityProps } from "./StubEntity";

/**
 * Stub for a remote FireballExplosion: the explosion sprite and sound play
 * locally, and the AOE applies once to the local player if inside the blast
 * radius (victim-authoritative, mirroring the real entity's HitArea). Spawn
 * summaries are the whole story — the entity never moves.
 */
@addResourceLoader(new ProtoSpriteLoader("explosionSheet", explosionPrs))
@setAssetDependencies(() => ["fireExplosionSound"])
export class FireballExplosionStub extends StubEntity {
  static type = "FireballExplosionStub";
  public type = FireballExplosionStub.type;

  private sprite = getResource<ProtoSpriteSheetThree>(
    FireballExplosionStub,
    "explosionSheet"
  ).getSprite<explosionTypes.sprite_layers, explosionTypes.sprite_animations>();
  private readonly explosionSound = new PositionalSound(
    SoundType.SFX,
    this.object3D,
    getAsset("fireExplosionSound")
  )
    .setDetune(-600)
    .setPitchVariation(300);
  private done = false;

  constructor(props: StubEntityProps) {
    super(props);
    const radius =
      typeof this.lastSummary.radius === "number" ? this.lastSummary.radius : 1;

    this.object3D.position
      .copy(this.position)
      .multiplyScalar(kPixelScale)
      .round()
      .multiplyScalar(kInvPixelScale);
    this.sprite.mesh.scale.multiplyScalar(kInvPixelScale * radius);
    this.sprite.mesh.scale.y *= -1;
    this.object3D.add(this.sprite.mesh);
    this.sprite.gotoFrame(0);
    this.sprite.center();
    this.sprite.events.on("animationLooped", () => {
      this.done = true;
      this.level?.removeEntity(this.id);
      this.destroy();
    });
  }

  attachToLevel(level: EntityLevelAPI): void {
    super.attachToLevel(level);
    this.explosionSound.setVolume(0.25).play();
    this.applyBlastToLocalPlayer();
  }

  private applyBlastToLocalPlayer(): void {
    if (!this.level) return;
    const player = getPlayer(this.level);
    if (!player || player.dead) return;
    const summary = this.lastSummary;
    const power = typeof summary.power === "number" ? summary.power : 5;
    const radius = typeof summary.radius === "number" ? summary.radius : 1;
    const dx = player.position.x - this.position.x;
    const dy = player.position.y - this.position.y;
    const distSq = dx * dx + dy * dy;
    const hitRadius = radius * 0.75 + player.size.width * 0.5;
    if (!(distSq <= hitRadius * hitRadius)) return;
    const impulse = new Vector2(dx, dy).normalize().multiplyScalar(3);
    const details: EntityHitDetails = {
      hittingEntity: this,
      sourceEntity: this,
      damage: power,
      elementalDamageType: ElementalType.Fire,
      damageType: DamageType.Explosion,
      hitImpulse: impulse
    };
    player.hit?.(details);
  }

  handleDespawn(): void {
    // The sprite self-removes when its animation completes; a despawn racing
    // ahead of that just lets the animation finish.
    if (this.done) {
      this.level?.removeEntity(this.id);
      this.destroy();
    }
  }

  step(deltaMs: number): void {
    // Static VFX: skip dead reckoning entirely.
    this.lifetimeMs += deltaMs;
    this.scheduler.step(deltaMs);
    if (!this.done) this.sprite.advance(deltaMs);
  }

  destroy(): void {
    this.sprite.dispose();
    this.explosionSound.dispose();
    super.destroy();
  }
}
