import {
  NavTerrainBlockType,
  ObstacleAABB,
  ObstaclePolygons
} from "src/api/navigation";

import { CenteredBBox } from "./CenteredBBox";
import {
  RawBlocks,
  ScaledTranslatedBlocks,
  TerrainWithObstacles
} from "./Terrain";

// Wraps a centered bbox as an AABB obstacle shape for updateObstacle.
function aabbFromBBox(bbox: CenteredBBox): ObstacleAABB {
  return {
    type: "aabb",
    x: bbox.x,
    y: bbox.y,
    width: bbox.width,
    height: bbox.height
  };
}

describe("RawBlocks", () => {
  it("stores and retrieves integers as expected", () => {
    const blocks = new RawBlocks(16, 16);
    expect(blocks.get(1, 1)).toEqual(0);
    expect(blocks.checkRegion(0, 0, 15, 15, 0)).toEqual(true);
    expect(blocks.checkRegionMulti(0, 0, 15, 15, { 0: true })).toEqual(true);
    expect(blocks.checkRegionContainsMulti(0, 0, 15, 15, { 1: true })).toEqual(
      false
    );
    blocks.mark(1, 1, 1);
    expect(blocks.get(1, 1)).toEqual(1);
    expect(blocks.checkRegion(0, 0, 15, 15, 0)).toEqual(false);
    expect(blocks.checkRegionMulti(0, 0, 15, 15, { 0: true })).toEqual(false);
    expect(blocks.checkRegionContainsMulti(0, 0, 15, 15, { 1: true })).toEqual(
      true
    );
  });
  it("does not throw an error when passed values that are out of bounds", () => {
    const blocks = new RawBlocks(16, 16);
    expect(blocks.get(25, 1)).toEqual(0);
  });
});

describe("ScaledTranslatedBlocks", () => {
  it("stores and retrieves integers as expected", () => {
    const blocks = new ScaledTranslatedBlocks(256, 256, 16, 16, -128, -128);
    blocks.mark(-100, -101, 1);
    expect(blocks.get(0, 0)).toEqual(0);
    expect(blocks.get(100, 100)).toEqual(0);
    expect(blocks.get(-100, -100)).toEqual(1);
    let sum = 0;
    let sumChecks = 0;
    for (let x = -128; x < 128; x++) {
      for (let y = -128; y < 128; y++) {
        sumChecks++;
        if (blocks.get(x, y) !== 0) sum++;
      }
    }
    expect(sum).toEqual(16 * 16);
    expect(sumChecks).toEqual(256 * 256);
  });
  it("performs well when checking large regions", () => {
    const blocks = new ScaledTranslatedBlocks(256, 256, 1, 1, -128, -128);
    expect(blocks.get(0, 0)).toEqual(0);
    expect(blocks.get(100, 100)).toEqual(0);
    expect(blocks.get(-100, -100)).toEqual(0);
    blocks.mark(100, 101, 1);
    expect(
      blocks.checkRegionContainsMulti(-1000, -1000, 1000, 1000, { 1: true })
    ).toEqual(true);
  });
  it("serializes and deserializes cleanly over JSON", () => {
    const blocks = new ScaledTranslatedBlocks(256, 256, 16, 16, -128, -128);
    blocks.mark(-100, -101, 1);
    const stringified = JSON.stringify(blocks.serialize());
    const parsed = ScaledTranslatedBlocks.parse(JSON.parse(stringified));
    expect(parsed.get(0, 0)).toEqual(0);
    expect(parsed.get(-100, -100)).toEqual(1);
  });
});

describe("TerrainWithObstacles", () => {
  const sampleMap = [
    [0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0],
    [2, 0, 0, 3, 3],
    [1, 4, 4, 1, 1],
    [1, 0, 0, 0, 1],
    [1, 1, 1, 1, 1]
  ];
  const sampleMapKey = {
    0: NavTerrainBlockType.Empty,
    1: NavTerrainBlockType.Solid,
    2: NavTerrainBlockType.SlopeRight,
    3: NavTerrainBlockType.SlopeLeft,
    4: NavTerrainBlockType.Platform
  };
  const sampleMapRes = 0.5;
  const sampleMapWidth = sampleMap[0].length * sampleMapRes;
  const sampleMapHeight = sampleMap.length * sampleMapRes;
  const sampleMapLinearData = sampleMap.reduce(
    (acc, arr) => acc.concat(arr),
    []
  );
  it("handles dumped tile data correctly", () => {
    const terrain = new TerrainWithObstacles(
      sampleMapWidth,
      sampleMapHeight,
      sampleMapRes,
      sampleMapRes,
      0,
      -sampleMapHeight
    );
    terrain.dumpTileData(
      sampleMapLinearData,
      sampleMap[0].length,
      sampleMapRes,
      -sampleMapRes,
      0.25,
      0.25,
      sampleMapKey
    );
    const characterBBox = new CenteredBBox(0.75, -1.25, 0.5, 0.5); // BBox is at 2, 2 on grid.
    expect(terrain.checkEmpty(characterBBox)).toEqual(true);
    expect(terrain.checkOnSurface(characterBBox, 0.5)).toEqual(true);
    expect(terrain.checkPassable(characterBBox.clone().add(0, -0.5))).toEqual(
      true
    );
    expect(terrain.checkPassable(characterBBox.clone().add(1, -1))).toEqual(
      false
    );
    expect(terrain.checkCanAscendLeft(characterBBox, 0.5)).toEqual(true);
    expect(terrain.checkCanAscendRight(characterBBox, 0.5)).toEqual(true);
  });
  it("handles obstacles correctly", () => {
    const terrain = new TerrainWithObstacles(
      sampleMapWidth,
      sampleMapHeight,
      sampleMapRes,
      sampleMapRes,
      0,
      -sampleMapHeight
    );
    terrain.dumpTileData(
      sampleMapLinearData,
      sampleMap[0].length,
      sampleMapRes,
      -sampleMapRes,
      0.25,
      0.25,
      sampleMapKey
    );
    const characterBBox = new CenteredBBox(0.75, -1.25, 0.5, 0.5); // BBox is at 2, 2 on grid.
    terrain.updateObstacle("inTheWay", aabbFromBBox(characterBBox));
    expect(terrain.checkEmpty(characterBBox)).toEqual(false);
    expect(terrain.checkPassable(characterBBox.clone().add(0, 1))).toEqual(
      true
    );
    terrain.updateObstacle(
      "inTheWay",
      aabbFromBBox(characterBBox.clone().add(-1, 0))
    );
    expect(terrain.checkEmpty(characterBBox)).toEqual(true);
    expect(terrain.checkPassable(characterBBox.clone().add(0, 1))).toEqual(
      true
    );
  });
  it("handles polygon obstacles correctly", () => {
    const terrain = new TerrainWithObstacles(
      sampleMapWidth,
      sampleMapHeight,
      sampleMapRes,
      sampleMapRes,
      0,
      -sampleMapHeight
    );
    terrain.dumpTileData(
      sampleMapLinearData,
      sampleMap[0].length,
      sampleMapRes,
      -sampleMapRes,
      0.25,
      0.25,
      sampleMapKey
    );
    const probeBBox = new CenteredBBox(0.75, -1.25, 0.5, 0.5);
    expect(terrain.checkEmpty(probeBBox)).toEqual(true);
    // A small triangle, stored in local space and offset to (0.75, -1.25), that
    // strictly contains that cell's center and no neighbor's.
    const obstacle: ObstaclePolygons = {
      type: "polygons",
      x: 0.75,
      y: -1.25,
      polygons: [
        [
          [0, -0.2],
          [-0.2, 0.2],
          [0.2, 0.2]
        ]
      ]
    };
    terrain.updateObstacle("triangle", obstacle);
    expect(terrain.checkEmpty(probeBBox)).toEqual(false);
    // Clearing must unmark exactly what was marked, restoring emptiness.
    terrain.clearObstacle("triangle");
    expect(terrain.checkEmpty(probeBBox)).toEqual(true);
  });
  it("performs well on dumped tile data", () => {
    const terrain = new TerrainWithObstacles(
      sampleMapWidth,
      sampleMapHeight,
      sampleMapRes,
      sampleMapRes,
      0,
      -sampleMapHeight
    );
    terrain.dumpTileData(
      sampleMapLinearData,
      sampleMap[0].length,
      sampleMapRes,
      -sampleMapRes,
      0.25,
      0.25,
      sampleMapKey
    );
    const characterBBox = new CenteredBBox(0, 0, 0.9, 0.9);
    let numEmpty = 0;
    let numChecked = 0;
    for (let x = 0; x < 128; x++) {
      for (let y = 0; y < 128; y++) {
        characterBBox.x = x / 32;
        characterBBox.y = -y / 32;
        if (terrain.checkEmpty(characterBBox)) numEmpty++;
        numChecked++;
      }
    }
    expect(numEmpty).toBeLessThan(numChecked);
  });
});
