import { Texture, Vector3 } from "three";
import { ThreeAseprite } from "three-aseprite";

import { EntityProps } from "src/api/entity";
import {
  ItemData,
  ItemRenderInstance,
  assertStaticItemDefinitionProps
} from "src/api/item";
import { kInvPixelScale } from "src/engine/constants/scaling";
import { addResourceLoader, getResource } from "src/engine/entity/decorators";
import { TextureResourceLoader } from "src/engine/loader/Loaders";
import { incrementHealth, incrementMana } from "src/redux/status/slice";
import { store } from "src/redux/store";

import consumablesJson from "./sprites/consumables.json";
import consumablesPng from "./sprites/consumables.png";

export enum PotionType {
  Health = "Health",
  Mana = "Mana"
}

@assertStaticItemDefinitionProps
@addResourceLoader(
  new TextureResourceLoader("consumablesTexture", consumablesPng)
)
export class PotionDefinition {
  static type = "Potion";
  static variants = Object.values(PotionType);
  static getRenderInstance(props: ItemData): ItemRenderInstance {
    const texture = getResource<Texture>(
      PotionDefinition,
      "consumablesTexture"
    );
    const sprite = new ThreeAseprite({
      texture,
      sourceJSON: consumablesJson
    });
    if (props.variant === PotionType.Mana) {
      sprite.gotoTag("ManaPotion");
    } else {
      sprite.gotoTag("HealthPotion");
    }
    sprite.mesh.scale.multiplyScalar(kInvPixelScale);
    return {
      object3D: sprite.mesh,
      dispose: () => sprite.dispose()
    };
  }
  static getEntityProps(props: ItemData): EntityProps {
    return {
      type: PotionDefinition.type,
      position: new Vector3()
    };
  }
  static consume(props: ItemData) {
    console.log(props);
    if (props.variant === PotionType.Health) {
      store.dispatch(incrementHealth(100));
    } else if (props.variant === PotionType.Mana) {
      store.dispatch(incrementMana(50));
    }
  }
}
