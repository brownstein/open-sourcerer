import { Object3D, Texture } from "three";
import { ThreeAseprite } from "three-aseprite";

import { kInvPixelScale } from "src/engine/constants/scaling";
import { getAsset, setAssetDependencies } from "src/engine/entity/decorators";

import { HudItemData, HudItemRenderInstance } from "./hudItem";
import portraitJson from "./sprites/Hud_portrait.json";

export enum PortraitType {
  Healthy = "Healthy",
  Injured = "Injured"
}

@setAssetDependencies(() => ["portraitTexture"])
export class PortraitDefinition {
  static type = "portrait";
  static getRenderInstance(props: HudItemData): HudItemRenderInstance {
    const data = props;
    const texture = getAsset<Texture>("portraitTexture");
    const sprite = new ThreeAseprite({
      texture,
      sourceJSON: portraitJson,
      frameName: (p) => `(${p.layerName}) ${p.frame}`
    });

    sprite.setLayerOpacities({
      Glow: 0
    });

    const rootObj = new Object3D();
    sprite.gotoTag("Normal");

    if (data.variant === PortraitType.Healthy) {
      sprite.gotoTag("Normal");
    } else {
      sprite.gotoTag("Damaged");
    }
    sprite.mesh.scale.multiplyScalar(kInvPixelScale);
    rootObj.add(sprite.mesh);
    return {
      object3D: rootObj,
      dispose: () => {
        sprite.dispose();
      }
    };
  }
}
