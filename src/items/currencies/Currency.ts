import { Vector3 } from "three";

import { EntityProps } from "src/api/entity";
import {
  ItemData,
  ItemRenderInstance,
  assertStaticItemDefinitionProps
} from "src/api/item";
import { kInvPixelScale } from "src/engine/constants/scaling";
import { getAsset, setAssetDependencies } from "src/engine/entity/decorators";
import { addCoins } from "src/redux/inventory/slice";
import { store } from "src/redux/store";

import * as gemsTypes from "./gems";

export enum CurrencyType {
  Green = "Green",
  Red = "Red",
  Blue = "Blue"
}

export const CurrencyOrder: CurrencyType[] = [
  CurrencyType.Green,
  CurrencyType.Red,
  CurrencyType.Blue
];
export const CurrencyValues: Record<CurrencyType, number> = {
  [CurrencyType.Green]: 1,
  [CurrencyType.Red]: 10,
  [CurrencyType.Blue]: 100
};

export function isCurrencyVariant(variant: unknown): variant is CurrencyType {
  switch (variant) {
    case CurrencyType.Green:
    case CurrencyType.Blue:
    case CurrencyType.Red:
      return true;
    default:
      return false;
  }
}

export function getCurrencyVariantValue(variant: CurrencyType) {
  return CurrencyValues[variant];
}

export function getCurrencyValueVariant(value: number) {
  let largestType = CurrencyType.Green;
  for (const [cType, cValue] of Object.entries(CurrencyValues)) {
    if (cValue <= value) largestType = cType as CurrencyType;
  }
  return largestType;
}

@assertStaticItemDefinitionProps
@setAssetDependencies(() => ["gemsSprite"])
export class CurrencyDefinition {
  static type = "Currency";
  static isCurrency = true;

  static getRenderInstance(props: ItemData): ItemRenderInstance {
    const sprite = getAsset("gemsSprite").getSprite<
      gemsTypes.sprite_layers,
      gemsTypes.sprite_animations
    >();
    sprite.hideLayers("green", "red", "blue");
    switch (props.variant) {
      case CurrencyType.Blue:
        sprite.showLayers("blue");
        break;
      case CurrencyType.Red:
        sprite.showLayers("red");
        break;
      default:
        sprite.showLayers("green");
        break;
    }
    sprite.center();
    sprite.mesh.scale.y = -1;
    sprite.mesh.scale.multiplyScalar(kInvPixelScale);
    return {
      object3D: sprite.mesh,
      dispose: () => sprite.dispose()
    };
  }
  static getEntityProps(props: ItemData): EntityProps {
    return {
      type: CurrencyDefinition.type,
      position: new Vector3()
    };
  }

  static waste(amount: number) {
    store.dispatch(addCoins({ amount: -amount }));
  }
}
