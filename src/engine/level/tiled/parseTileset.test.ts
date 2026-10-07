import { TileType } from "./api";
import { parseTileset } from "./parseTileset";
import adveTiles from "./test-data/tiles16.tsj";

describe("parseTileset", () => {
  test("Parses the ADVE tileset.", () => {
    const parsed = parseTileset(adveTiles);
    let hasGroundTile = false;
    let hasShapeTile = false;
    for (const tileDef of Object.values(parsed.defs)) {
      if (tileDef.type === TileType.ground) hasGroundTile = true;
      if (tileDef.shape) {
        hasShapeTile = true;
        expect(tileDef.shape.clippedPolygon.length).toBeGreaterThan(0);
      }
    }
    expect(hasGroundTile).toBeTruthy();
    expect(hasShapeTile).toBeTruthy();
  });
});
