import { Texture } from "three";
import { ThreeAseprite } from "three-aseprite";

import {
  ItemData,
  ItemRenderInstance,
  assertStaticItemDefinitionProps
} from "src/api/item";
import { kInvPixelScale } from "src/engine/constants/scaling";
import { addResourceLoader, getResource } from "src/engine/entity/decorators";
import { TextureResourceLoader } from "src/engine/loader/Loaders";

import items32Json from "./sprites/items32.json";
import items32Png from "./sprites/items32.png";

@assertStaticItemDefinitionProps
@addResourceLoader(new TextureResourceLoader("itemsTexture", items32Png))
export class SwordDefinition {
  static type = "Sword";
  static cannotDrop = true;
  static isQuestItem = true;
  static autoEquip = true;
  static getRenderInstance(_props: ItemData): ItemRenderInstance {
    const texture = getResource<Texture>(SwordDefinition, "itemsTexture");
    const sprite = new ThreeAseprite({
      texture,
      sourceJSON: items32Json,
      frameName: (p) => `(${p.layerName}) ${p.frame}`
    });
    sprite.gotoTag("Sword");
    sprite.mesh.scale.multiplyScalar(kInvPixelScale);
    return {
      object3D: sprite.mesh,
      dispose: () => sprite.dispose()
    };
  }
}
