import { TilesetDefinitionAPI } from "src/engine/level/LevelLoaderAPI";
import * as TiledFormat from "src/engine/level/tiled/tiledJson";

export type StoredEditorMap = {
  id: string;
  name: string;
  mapJson: TiledFormat.ITiledLevelJSON;
  tileSets?: Record<string, TilesetDefinitionAPI>;
  images?: Record<string, string>;
  sourceLevelId?: string;
  /** Shared identity of the level (see levelEditorDoc): lets peers in a live
   *  session match a save against their own copy. Absent on old saves and on
   *  imports; level identity never travels through files. */
  levelUuid?: string;
  createdAt: number;
  updatedAt: number;
  screenshotImage?: string;
};
