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

import greenBoardJson from "./sprites/greenboard.json";
import greenBoardPng from "./sprites/greenboard.png";

@assertStaticItemDefinitionProps
@addResourceLoader(
  new TextureResourceLoader("greenBoardTexture", greenBoardPng)
)
export class JunkDefinition {
  static type = "Junk";
  static cannotDrop = true;
  static getRenderInstance(_props: ItemData): ItemRenderInstance {
    const texture = getResource<Texture>(JunkDefinition, "greenBoardTexture");
    const sprite = new ThreeAseprite({
      texture,
      sourceJSON: greenBoardJson,
      frameName: (p) => `${p.frame}`
    });
    sprite.mesh.scale.multiplyScalar(kInvPixelScale);
    return {
      object3D: sprite.mesh,
      dispose: () => sprite.dispose()
    };
  }
}
