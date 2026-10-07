import { BaseAssetManager } from "src/api/asset";
import { ExtractLoaderResourceType, Loader } from "src/api/loader";
import { GameAssets, assetsRegistry } from "src/assets/allAssets";

class AssetManager implements BaseAssetManager {
  private readonly referenceCounts = new Map<string, number>();

  acquireReference<AssetKey extends keyof GameAssets>(
    assetKey: AssetKey
  ): GameAssets[AssetKey];
  acquireReference(assetKey: string): Loader | null;
  acquireReference(assetKey: string): Loader | null {
    const assetLoader = assetsRegistry.get(assetKey);
    if (!assetLoader) return null;

    const previousReferenceCount = this.referenceCounts.get(assetKey) ?? 0;
    const newReferenceCount = previousReferenceCount + 1;
    this.referenceCounts.set(assetKey, newReferenceCount);

    return assetLoader;
  }

  get<
    AssetKey extends keyof GameAssets,
    LoaderType extends GameAssets[AssetKey],
    AssetType = ExtractLoaderResourceType<LoaderType>
  >(assetKey: AssetKey): AssetType;
  get<T>(assetKey: string): T;
  get(assetKey: string): unknown {
    const asset = assetsRegistry.get(assetKey)?.resource;
    if (!asset) {
      console.error(`${assetKey} is unloaded or is invalid`);
      throw new Error(`${assetKey} is unloaded or is invalid`);
    }

    return asset;
  }

  releaseReference(assetKey: string): void {
    const previousReferenceCount = this.referenceCounts.get(assetKey);
    if (previousReferenceCount === undefined || previousReferenceCount <= 0)
      return;

    const newReferenceCount = previousReferenceCount - 1;
    this.referenceCounts.set(assetKey, newReferenceCount);
  }

  unloadUnusedAssets(): void {
    for (const [assetKey, referenceCount] of this.referenceCounts) {
      if (referenceCount > 0) continue;

      this.referenceCounts.delete(assetKey);

      const assetLoader = assetsRegistry.get(assetKey);
      if (!assetLoader) continue;

      assetLoader.unload();
    }
  }
}

export const centralAssetManager = new AssetManager();
