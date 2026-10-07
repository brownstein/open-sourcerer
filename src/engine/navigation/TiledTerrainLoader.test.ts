import { Vector2 } from "three";

import { NavTerrainBlockType } from "src/api/navigation";
import { parseTileset } from "src/engine/level/tiled/parseTileset";

import { loadTerrainForTiledLevelWithTileDefs } from "./TiledTerrainLoader";
import devTiles from "./test-data/dev-tiles.tsj";
import testLevelInfinite from "./test-data/test-level-infinite.tmj";

describe("loadTerrainForTiledLevel", () => {
  test("Loads an infinite level as TerrainWithObstacles using scaled values.", () => {
    const tileDefs = {
      "dev-tiles": parseTileset(devTiles)
    };
    const terrain = loadTerrainForTiledLevelWithTileDefs(
      testLevelInfinite,
      tileDefs,
      new Vector2(1 / 32, -1 / 32)
    );
    expect(terrain).toBeTruthy();
    let str = "";
    const N = 4;
    for (let y = -N; y < N; y += 0.5) {
      for (let x = -N; x < N; x += 0.5) {
        str += ` ${terrain.getBlockAt(x, y)}`;
      }
      str += "\n";
    }
    expect(terrain.getBlockAt(0, 0.5)).toEqual(NavTerrainBlockType.Solid);
  });
});
