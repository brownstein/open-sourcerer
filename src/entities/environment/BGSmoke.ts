import { Color, Object3D } from "three";

import { EntityProps } from "src/api/entity";
import { kInvPixelScale, kPixelScale } from "src/engine/constants/scaling";
import { CoreEntity } from "src/engine/entity/CoreEntity";

import { SmokeParticlesBehavior } from "../shared/behaviors/SmokeParticles";

export type BGSmokeProps = EntityProps;

export class BGSmoke extends CoreEntity {
  static type = "BGSmoke";
  public type = BGSmoke.type;
  public object3D = new Object3D();

  public behaviors = {
    smoke: new SmokeParticlesBehavior()
  };

  constructor(props: BGSmokeProps) {
    super(props);
    this.object3D.position
      .copy(this.position)
      .multiplyScalar(kPixelScale)
      .round()
      .multiplyScalar(kInvPixelScale);
    this.behaviors.smoke.particleSettings.color = new Color(1, 1, 1);
    this.behaviors.smoke.maxParticles = 8000;
    this.behaviors.smoke.particleSettings.lifetimeMs = 3000;
    this.behaviors.smoke.particleSettings.msBetweenSpawn = 2.5;
    this.behaviors.smoke.particleSettings.roundPositions = true;
    this.behaviors.smoke.particleSettings.transform = (particle, ms) => {
      if (ms === 0) {
        particle.size = 0;
        particle.opacity = 1;
        particle.velocity.x = (Math.random() - 0.5) * 0.002;
        particle.velocity.y = (Math.random() - 0.5) * 0.001 + 0.001;
        particle.position.x = (Math.random() - 0.5) * this.size.width;
        particle.position.y = (Math.random() - 0.5) * this.size.height;
      } else {
        const f = Math.sqrt(
          Math.max(
            0,
            Math.min(1, 2 * (0.5 - Math.abs(0.5 - ms / particle.lifetimeMs)))
          )
        );
        particle.size = 0.25 * f;
        particle.opacity = 0.1 * f;
        particle.velocity.x *= 0.98;
      }
    };
    this.behaviors.smoke.init(this);
  }
}
