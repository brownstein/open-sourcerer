import { AssetConsumerType } from "src/api/asset";
import { EntityClassType, EntityProps } from "src/api/entity";
import { ItemDefinition } from "src/api/item";
import { ExtractLoaderResourceType, Loader } from "src/api/loader";
import { ConfigDefType } from "src/api/util";
import { GameAssets } from "src/assets/allAssets";

import { centralAssetManager } from "../asset/AssetManager";

export type ResourceLoadableClazzType =
  | Omit<EntityClassType, "new">
  | ItemDefinition;

export function addResourceLoader<ResourceType>(loader: Loader<ResourceType>) {
  return function _decorate<Clazz extends ResourceLoadableClazzType>(
    clazz: Clazz
  ) {
    if (clazz.loaders === undefined) clazz.loaders = {};
    clazz.loaders[loader.resourceName] = loader;
  };
}

export function getResource<ResourceType>(
  clazz: ResourceLoadableClazzType,
  resourceName: string
) {
  const loader = clazz.loaders?.[resourceName];
  if (!loader?.resource)
    throw new Error(`Resource ${resourceName} not loaded.`);
  return loader.resource as ResourceType;
}

// NOTE: any class and any object can be attached with the methods at runtime,
// but we still have type safety since it is only exposed and accesibly by types
// that explcitly extend AssetConsumerType
type AssetConsumerTarget = object;

export function setAssetDependencies<P extends EntityProps = EntityProps>(
  assetDepFn: (props?: P) => (keyof GameAssets)[]
) {
  return (targetConsumer: AssetConsumerTarget) => {
    (targetConsumer as AssetConsumerType).getAssetDependencies = assetDepFn;
  };
}

export function setConsumerDependencies(
  consumerDepFn: (props?: EntityProps) => AssetConsumerTarget[]
) {
  return (targetConsumer: AssetConsumerTarget) => {
    (targetConsumer as AssetConsumerType).getConsumerDependencies =
      consumerDepFn as (props?: EntityProps) => AssetConsumerType[];
  };
}

export function getAsset<
  AssetKey extends keyof GameAssets,
  LoaderType extends GameAssets[AssetKey],
  AssetType = ExtractLoaderResourceType<LoaderType>
>(assetKey: AssetKey): AssetType;
export function getAsset<T>(assetKey: string): T;
export function getAsset(assetKey: string): unknown {
  try {
    return centralAssetManager.get(assetKey);
  } catch {
    throw new Error(`${assetKey} is unloaded or is invalid`);
  }
}

export function withConfigDef<T extends ConfigDefType>(configDef: T) {
  return function _decorate<Clazz extends EntityClassType>(clazz: Clazz) {
    clazz.configDef = {
      ...clazz.configDef,
      ...configDef
    };
  };
}

export function addFlag(flag: string) {
  return function _decorate<Clazz extends EntityClassType>(clazz: Clazz) {
    if (clazz.flags === undefined) clazz.flags = [];
    clazz.flags.push(flag);
  };
}

export function addDevOverlayFlag() {
  return addFlag("dev");
}
