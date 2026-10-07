import { Color, Object3D, Texture } from "three";
import { ThreeAseprite } from "three-aseprite";

import { EntityProps } from "src/api/entity";
import { kInvPixelScale } from "src/engine/constants/scaling";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import { addResourceLoader, getResource } from "src/engine/entity/decorators";
import { TextureResourceLoader } from "src/engine/loader/Loaders";
import greenBoardJson from "src/items/quests/sprites/greenboard.json";
import greenBoardPng from "src/items/quests/sprites/greenboard.png";
import { addItems } from "src/redux/shared/actions";
import { store } from "src/redux/store";

import { isPlayerAPI } from "../player/PlayerAPI";
import { GlowParticlesBehavior } from "../shared/behaviors/GlowParticles";
import {
  ItemPhysicsBehavior,
  ItemPhysicsEvents
} from "../shared/behaviors/ItemPhysics";

@addResourceLoader(
  new TextureResourceLoader("greenBoardTexture", greenBoardPng)
)
export class Junk extends CoreEntity {
  static type = "Junk";
  public type = "Junk";
  public object3D = new Object3D();
  public behaviors = {
    physics: new ItemPhysicsBehavior(),
    particles: new GlowParticlesBehavior()
  };
  private sprite: ThreeAseprite;
  constructor(props: EntityProps) {
    super(props);
    this.sprite = new ThreeAseprite({
      texture: getResource<Texture>(Junk, "greenBoardTexture"),
      sourceJSON: greenBoardJson
    });
    this.sprite.mesh.scale.multiplyScalar(kInvPixelScale);
    this.object3D.add(this.sprite.mesh);
    this.object3D.position.copy(this.position);

    this.behaviors.physics.init(this);
    this.behaviors.particles.init(this);
    this.behaviors.particles.object3D.position.z = -1;

    const defaultTransform =
      this.behaviors.particles.particleSettings.transform;
    this.behaviors.particles.particleSettings.transform = (p, ms) => {
      defaultTransform(p, ms);
      if (ms === 0) {
        p.position.x = (Math.random() - 0.5) * this.size.width * 1.5;
        p.position.y = (Math.random() - 0.5) * this.size.height * 1.5;
        p.velocity.multiplyScalar(0.25);
        p.color = new Color(0xaaddff);
        p.lifetimeMs = 800;
      } else {
        p.size = 0.15 * Math.sin((Math.PI * p.ms) / p.lifetimeMs);
      }
    };

    this.behaviors.physics.events.on(
      ItemPhysicsEvents.CollideWithEntity,
      ([entity]) => {
        if (isPlayerAPI(entity)) {
          this.pickup();
        }
      }
    );
  }
  destroy() {
    super.destroy();
    this.sprite.dispose();
  }
  pickup() {
    const { level } = this;
    if (!level) return;
    store.dispatch(
      addItems({
        item: { type: "Junk" },
        hotkey: true
      })
    );
    level.removeEntity(this.id);
  }
}
