import { ElementalType } from "src/api/entity";
import { kInvPixelScale } from "src/engine/constants/scaling";
import { SmokeParticlesBehavior } from "src/entities/shared/behaviors/SmokeParticles";
import { TrailRenderingBehavior } from "src/entities/spells/projectiles/TrailRendering";

import { ProjectileStub } from "./ProjectileStub";
import { StubEntityProps } from "./StubEntity";

/**
 * Presentation stub for a remote peer's Fireball. The owner's summary
 * carries its exact gravity as `acc`, so dead reckoning is exact between
 * spell interventions (moveTo/deflect just change what the next report
 * says).
 */
export class FireballStub extends ProjectileStub {
  static type = "FireballStub";
  public type = FireballStub.type;

  public behaviors = {
    trailRender: new TrailRenderingBehavior(),
    smokeRender: new SmokeParticlesBehavior()
  };

  constructor(props: StubEntityProps) {
    super(props);
    this.element = this.element ?? ElementalType.Fire;
    this.behaviors.trailRender.radius =
      Math.sqrt(this.damage) * kInvPixelScale * 0.8;
    this.behaviors.trailRender.init(this);
    this.behaviors.smokeRender.init(this);
    this.object3D.position.copy(this.position);
  }

  protected setImpactFade(t: number): void {
    this.behaviors.trailRender.setOpacity(1 - t);
  }
}
