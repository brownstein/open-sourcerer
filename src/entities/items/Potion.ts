import { Color, Object3D, Vector2 } from "three";
import { ThreeAseprite } from "three-aseprite";

import { EntityProps } from "src/api/entity";
import { OverlayPosition } from "src/api/overlay";
import {
  ItemGoingPlaces,
  ItemJuiceOverlayProps,
  ItemPickupJuice
} from "src/components/ui/overlays/overlays/ItemPickupJuice";
import { kInvPixelScale } from "src/engine/constants/scaling";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import { addResourceLoader, getResource } from "src/engine/entity/decorators";
import { TextureResourceLoader } from "src/engine/loader/Loaders";
import { vector3To2 } from "src/engine/util/vecTypes";
import { PotionDefinition, PotionType } from "src/items/consumables/Potion";
import consumablesJson from "src/items/consumables/sprites/consumables.json";
import consumablesPng from "src/items/consumables/sprites/consumables.png";
import { addItems } from "src/redux/shared/actions";
import { store } from "src/redux/store";

import { Player } from "../player/Player";
import { GlowParticlesBehavior } from "../shared/behaviors/GlowParticles";
import {
  ItemPhysicsBehavior,
  ItemPhysicsEvents
} from "../shared/behaviors/ItemPhysics";

export type PotionProps = EntityProps & {
  potionType?: PotionType;
};

@addResourceLoader(
  new TextureResourceLoader("consumablesTexture", consumablesPng)
)
export class Potion extends CoreEntity {
  static type = "Potion";
  public type = "Potion";
  override get canBindToVariable() { return true; }
  public object3D = new Object3D();
  public behaviors = {
    physics: new ItemPhysicsBehavior(),
    particles: new GlowParticlesBehavior()
  };
  private potionType: PotionType = PotionType.Health;
  private sprite: ThreeAseprite;
  constructor(props: PotionProps) {
    super(props);
    this.size = {
      width: 0.5,
      height: 0.5
    };
    this.sprite = new ThreeAseprite({
      texture: getResource(Potion, "consumablesTexture"),
      sourceJSON: consumablesJson
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
        if (entity.type === Player.type) {
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

    // TODO: make this juicy pickup stuff a standard behavior.
    const { center, size } = level.cameraDirector.getCurrentProperties();
    const cameraSize = size;
    const cameraCenter = center;
    if (!cameraSize || !cameraCenter) return;

    const viewportPosRelative = vector3To2(this.position);
    viewportPosRelative.sub(cameraCenter);
    viewportPosRelative.divide(cameraSize);
    viewportPosRelative.x += 0.5;
    viewportPosRelative.y *= -1;
    viewportPosRelative.y += 0.5;

    const viewportSizeRelative = new Vector2(this.size.width, this.size.height);
    viewportSizeRelative.divide(cameraSize);

    level.ctx?.overlayProvider?.addOverlay<ItemJuiceOverlayProps>({
      component: ItemPickupJuice,
      position: OverlayPosition.Screen,
      overlayProps: {
        viewportPosRelative,
        viewportSizeRelative,
        item: {
          type: PotionDefinition.type
        },
        wheresItGoing: ItemGoingPlaces.HotBar,
        andWhenItGetsThere: () => {
          store.dispatch(
            addItems({
              item: {
                type: PotionDefinition.type,
                variant: PotionType.Health
              },
              hotkey: true
            })
          );
        }
      }
    });

    // Detach physics to end collisions.
    this.behaviors.physics.detachFromLevel();

    this.scheduler.add({
      startIn: 100,
      invokeFunction: (t) => {
        this.sprite.setOpacity(1 - t);
      },
      invokeFunctionAtComplete: () => {
        level.removeEntity(this.id);
      }
    });
  }
}
