import { ElementalType } from "src/api/entity";
import { kInvPixelScale } from "src/engine/constants/scaling";
import { SmokeParticlesBehavior } from "src/entities/shared/behaviors/SmokeParticles";
import { getElementalDefaults } from "src/entities/spells/projectiles/GenericProjectile";
import { TrailRenderingBehavior } from "src/entities/spells/projectiles/TrailRendering";

import { ProjectileStub } from "./ProjectileStub";
import { StubEntityProps } from "./StubEntity";

/**
 * Stub for a remote GenericProjectile. Appearance reconstructs locally from
 * the summary's element + radius using the same elemental defaults the real
 * projectile uses (colors, trail shape, particle style), so nothing visual
 * needs to travel beyond those two fields.
 */
export class GenericProjectileStub extends ProjectileStub {
  static type = "GenericProjectileStub";
  public type = GenericProjectileStub.type;

  public behaviors = {
    trailRender: new TrailRenderingBehavior(),
    smokeRender: new SmokeParticlesBehavior()
  };

  constructor(props: StubEntityProps) {
    super(props);
    const element = this.element ?? ElementalType.Fire;
    const defaults = getElementalDefaults(element);

    const trail = this.behaviors.trailRender;
    trail.colorInner.copy(defaults.colorInner);
    trail.colorOuter.copy(defaults.colorOuter);
    trail.colorTrail.copy(defaults.colorTrail);
    if (defaults.trailJitter !== undefined)
      trail.trailJitter = defaults.trailJitter;
    if (defaults.trailTurbulence !== undefined)
      trail.trailTurbulence = defaults.trailTurbulence;
    if (defaults.trailDelta !== undefined)
      trail.trailDelta.copy(defaults.trailDelta);
    const radius = this.lastSummary.radius;
    trail.radius =
      typeof radius === "number"
        ? radius
        : Math.sqrt(this.damage) * kInvPixelScale * 0.8;
    trail.trailMaxLength = 35;
    trail.trailLengthMs = 250;
    trail.init(this);

    const smoke = this.behaviors.smokeRender;
    if (defaults.particleSettings) {
      smoke.particleSettings = defaults.particleSettings;
    } else {
      smoke.particleSettings.color.copy(defaults.colorTrail);
    }
    smoke.init(this);

    this.object3D.position.copy(this.position);
  }

  protected setImpactFade(t: number): void {
    this.behaviors.trailRender.setOpacity(1 - t);
    if (t === 0) this.behaviors.smokeRender.enableSpawn = false;
  }
}
