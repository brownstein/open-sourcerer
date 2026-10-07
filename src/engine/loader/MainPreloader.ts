import { Loader } from "src/api/loader";
import { allPermanentAssets } from "src/assets/allPermanentAssets";
import { allItems } from "src/items/allItems";

import { centralAssetManager } from "../asset/AssetManager";
import { MultiLoader } from "./Loaders";

/**
 * Loader bound to all preloadable resources.
 */
export class MainPreloader {
  public loaded = false;
  public loader: Loader;

  private resourceMap: Record<string, Loader> = {};
  constructor() {
    // Preload all item sprites in the game.
    for (const itemDef of allItems) {
      if (itemDef.loaders) {
        const loaderKey = `${itemDef.type}:resources`;
        const defLoader = new MultiLoader(loaderKey, itemDef.loaders);
        this.resourceMap[loaderKey] = defLoader;
      }
      const assetDependencies = itemDef.getAssetDependencies?.();
      if ((assetDependencies?.length ?? 0) > 0) {
        const loaderKey = `${itemDef.type}:assets`;
        const loadersMap: Record<string, Loader> = {};
        for (const assetKey of assetDependencies ?? []) {
          const loader = centralAssetManager.acquireReference(assetKey);
          loadersMap[assetKey] = loader;
        }
        const defLoader = new MultiLoader(loaderKey, loadersMap);
        this.resourceMap[loaderKey] = defLoader;
      }
    }
    // Preload all permanent assets in the game.
    for (const assetKey of allPermanentAssets) {
      const assetLoader = centralAssetManager.acquireReference(assetKey);
      if (!assetLoader) continue;

      this.resourceMap[assetKey] = assetLoader;
    }

    this.loader = new MultiLoader("mainPreloader", this.resourceMap);
  }
  async load() {
    if (this.loaded) return;

    await this.loader.load();
    this.loaded = true;
  }
}

export const mainPreloader = new MainPreloader();
