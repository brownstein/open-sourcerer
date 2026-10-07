import shortid from "shortid";
import { Color } from "three";

import {
  ItemData,
  ItemRenderInstance,
  assertStaticItemDefinitionProps
} from "src/api/item";
import { kInvPixelScale } from "src/engine/constants/scaling";
import { getAsset, setAssetDependencies } from "src/engine/entity/decorators";
import { setManaSources } from "src/redux/status/slice";
import { store } from "src/redux/store";

export type CrystalItemAttributes = {
  glowFraction?: number;
};
@assertStaticItemDefinitionProps
@setAssetDependencies(() => ["crystals"])
export class CrystalsDefintiion {
  static type = "Crystal";
  static cannotDrop = true;
  static isQuestItem = true;
  static autoEquip = false;
  static getRenderInstance(item: ItemData): ItemRenderInstance {
    const sprite = getAsset("crystals").getSprite();
    sprite.mesh.scale.multiplyScalar(kInvPixelScale);
    sprite.mesh.scale.y *= -1;
    sprite.center();

    let outlineMsTotal = 0;
    let lastMana = 1;

    const asData = item as CrystalItemAttributes;
    if (asData.glowFraction !== undefined) {
      lastMana = asData.glowFraction;
      sprite.outlineAllLayers(
        1,
        new Color(
          asData.glowFraction,
          asData.glowFraction,
          asData.glowFraction
        ),
        1
      );
    }

    return {
      object3D: sprite.mesh,
      animate: (ms: number) => {
        outlineMsTotal += ms;
        let frac =
          Math.cos((outlineMsTotal * Math.PI) / 2000) * (1 - lastMana) * 0.25 +
          lastMana;
        frac = Math.max(0.25, Math.min(1, frac));
        sprite.outlineAllLayers(1, new Color(frac, frac, frac), 1);
      },
      dispose: () => sprite.dispose()
    };
  }
  static equip({ type: _typeName }: ItemData) {
    setImmediate(() => {
      console.log("Equip for mana sources");
      store.dispatch(
        setManaSources([
          {
            id: shortid(),
            capacity: 100,
            available: 100,
            rechargeRate: 1
          }
        ])
      );
    });
  }
}
