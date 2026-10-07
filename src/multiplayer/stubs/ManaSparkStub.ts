import { Texture } from "three";
import { StandardEvents, ThreeAseprite } from "three-aseprite";

import { kInvPixelScale } from "src/engine/constants/scaling";
import { addResourceLoader, getResource } from "src/engine/entity/decorators";
import { TextureResourceLoader } from "src/engine/loader/Loaders";
import { GlowParticlesBehavior } from "src/entities/shared/behaviors/GlowParticles";
import manaballJson from "src/entities/spells/spark/sprites/manaball.json";
import manaballPng from "src/entities/spells/spark/sprites/manaball.png";

import { EntityNetSummary } from "../api";
import { StubEntity, StubEntityProps } from "./StubEntity";

/**
 * Stub for a remote peer's ManaSpark: the hovering spark visual (manaball
 * sprite + glow particles) following the owner's reported motion. Casts an
 * opponent runs through their spark show up separately as their own
 * replicated projectile/blast entities.
 */
@addResourceLoader(new TextureResourceLoader("manaballTexture", manaballPng))
export class ManaSparkStub extends StubEntity {
  static type = "ManaSparkStub";
  public type = ManaSparkStub.type;

  public behaviors = {
    particles: new GlowParticlesBehavior()
  };

  private sprite: ThreeAseprite;
  private scale = 1;

  constructor(props: StubEntityProps) {
    super(props);
    this.scale = this.readScale(this.lastSummary);

    this.sprite = new ThreeAseprite({
      texture: getResource<Texture>(ManaSparkStub, "manaballTexture"),
      sourceJSON: manaballJson
    });
    this.sprite.setColor(0xaaffff);
    this.sprite.gotoTag("Form");
    this.sprite.setOutline(2, 0xffffff, 1);
    this.sprite.mesh.scale.multiplyScalar(this.scale * kInvPixelScale);
    this.object3D.add(this.sprite.mesh);
    this.object3D.position.copy(this.position);

    this.sprite.addEventListener(StandardEvents.animationComplete, () => {
      if (this.sprite.getCurrentTag() !== "Loop") this.sprite.gotoTag("Loop");
    });

    this.behaviors.particles.init(this);
    this.behaviors.particles.particleSettings.lifetimeMs = 500;
    this.behaviors.particles.object3D.position.z--;
  }

  private readScale(summary: EntityNetSummary): number {
    return typeof summary.scale === "number" && summary.scale > 0
      ? summary.scale
      : 1;
  }

  protected onSummary(summary: EntityNetSummary): void {
    const scale = this.readScale(summary);
    if (scale !== this.scale) {
      this.sprite.mesh.scale.multiplyScalar(scale / this.scale);
      this.scale = scale;
    }
  }

  step(deltaMs: number): void {
    super.step(deltaMs);
    this.sprite.animate(deltaMs);
  }

  destroy(): void {
    this.sprite.dispose();
    super.destroy();
  }
}
