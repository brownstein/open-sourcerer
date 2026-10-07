import { GameAssets } from "src/assets/allAssets";

import { EntityProps } from "./entity";
import { ExtractLoaderResourceType, Loader } from "./loader";

/**
 * The unified interface for classes or objects to declare themselves dependent
 * on an asset or dependent on another class or object that uses an asset.
 *
 * Level loading will resolve all dependencies of a level and preload them
 */
export interface AssetConsumerType {
  getAssetDependencies?(props?: EntityProps): (keyof GameAssets)[];
  getConsumerDependencies?(props?: EntityProps): AssetConsumerType[];
}

/**
 * Centralized asset lifecycle manager. Tracks which assets are in use via
 * reference counting and supports lazy unloading of assets that are no
 * longer needed.
 *
 * Typical usage during a level transition:
 * 1. The level loader calls {@link acquireReference} for every asset the
 *    new level requires and loads them via the returned loaders.
 * 2. Entities access loaded resources through {@link get} during
 *    construction and gameplay.
 * 3. On level teardown, the level calls {@link releaseReference} for each
 *    asset it previously acquired.
 * 4. After the next level finishes loading, {@link unloadUnusedAssets} is
 *    called to dispose of any assets whose reference count has dropped to
 *    zero, freeing GPU/memory resources.
 */
export interface BaseAssetManager {
  /**
   * Marks the asset as in-use by incrementing its reference count and
   * returns the underlying loader. The caller is responsible for ensuring
   * the loader's {@link Loader.load} method is invoked (typically via a
   * {@link MultiLoader}) before the asset is accessed with {@link get}.
   *
   * @remark reference count is not incremented if asset does not exist
   */
  acquireReference<AssetKey extends keyof GameAssets>(
    assetKey: AssetKey
  ): GameAssets[AssetKey];
  acquireReference(assetKey: string): Loader | null;

  /**
   * Returns the loaded resource for the given asset key. The asset must
   * have been previously acquired and its loader must have completed
   * loading, otherwise this method will throw.
   */
  get<
    AssetKey extends keyof GameAssets,
    LoaderType extends GameAssets[AssetKey],
    AssetType = ExtractLoaderResourceType<LoaderType>
  >(
    assetKey: AssetKey
  ): AssetType;
  get<T>(assetKey: string): T;

  /**
   * Decrements the reference count for the given asset. This does not
   * immediately unload the asset — it is marked for deferred cleanup so
   * that assets shared across consecutive levels are not needlessly
   * reloaded. Call {@link unloadUnusedAssets} to perform the actual
   * disposal.
   *
   * @remark if assetKey does not exist, this is a no-op
   */
  releaseReference(assetKey: string): void;

  /**
   * Disposes and unloads all assets whose reference count has reached
   * zero. Should be called after a new level has finished loading so that
   * assets from the previous level that are no longer needed can be
   * garbage collected. Assets still referenced by the current level are
   * left untouched.
   */
  unloadUnusedAssets(): void;
}
