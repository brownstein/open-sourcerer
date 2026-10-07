import { TFunction } from "i18next";
import { Color } from "three";

import { AssetConsumerType } from "src/api/asset";
import { EntityClassArray, LevelAPI } from "src/api/entity";
import { ItemData } from "src/api/item";
import { MusicAssets } from "src/assets/allMusicAssets";

import { GenericHotLoader } from "../loader/HotLoader";
import { LayerProviderAPI } from "./tiled/Layers";
import * as TiledFormat from "./tiled/tiledJson";

export type LevelDefinitionAPI<ST extends unknown | void = unknown | void> = {
  id: string;
  localizedName?: Parameters<TFunction>[0] & string;
  screenshotImage?: string;
  mapJson:
    | TiledFormat.ITiledLevelJSON
    | (() => TiledFormat.ITiledLevelJSON)
    | (() => Promise<TiledFormat.ITiledLevelJSON>);
  images?: Record<string, string>;
  // TileSets can be embedded in levels definitions, such as when used by the upload feature.
  tileSets?: Record<string, TilesetDefinitionAPI>;
  backgroundColor?: Color;
  layers?: LayerProviderAPI;
  ambientMusic?: keyof MusicAssets;
  ambientMusicGain?: number;
  demoItems?: ItemData[];
  demoAllies?: EntityClassArray;
  setup?: (level: LevelAPI) => ST | Promise<ST>;
  teardown?: (level: LevelAPI, setupResult: Awaited<ST>) => void;
} & AssetConsumerType;

export type TilesetDefinitionAPI = {
  tileSetJson: TiledFormat.ITiledTileSetJSON;
  tileSetImage: string;
};

export type LevelLoaderContextAPI = {
  readonly hotLoaders: {
    readonly levels: GenericHotLoader<LevelDefinitionAPI>;
    readonly tileSets: GenericHotLoader<TilesetDefinitionAPI>;
  };
};
