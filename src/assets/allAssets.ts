import { Loader } from "src/api/loader";
import { RegistryProvider } from "src/api/registry";

import allFontAssets from "./allFontAssets";
import allGeometryAssets from "./allGeometryAssets";
import allMusicAssets from "./allMusicAssets";
import allSoundAssets from "./allSoundAssets";
import allSpineAssets from "./allSpineAssets";
import allSpriteAssets from "./allSpriteAssets";
import allTextureAssets from "./allTextureAssets";

const allAssets = {
  ...allSpriteAssets,
  ...allGeometryAssets,
  ...allTextureAssets,
  ...allSoundAssets,
  ...allMusicAssets,
  ...allSpineAssets,
  ...allFontAssets
} satisfies Record<string, Loader>;

export type GameAssets = typeof allAssets;

export class AssetsRegistry implements RegistryProvider<Loader> {
  private readonly assetsMap = new Map<string, Loader>();

  constructor() {
    for (const [assetKey, assetLoader] of Object.entries(allAssets))
      this.add(assetKey, assetLoader);
  }

  keys(): string[] {
    return [...this.assetsMap.keys()];
  }
  add(assetKey: string, assetLoader: Loader): void {
    this.assetsMap.set(assetKey, assetLoader);
  }
  get(assetKey: keyof GameAssets): Loader;
  get(assetKey: string): Loader | null;
  get(assetKey: string): Loader | null {
    return this.assetsMap.get(assetKey) ?? null;
  }
}

export const assetsRegistry = new AssetsRegistry();
