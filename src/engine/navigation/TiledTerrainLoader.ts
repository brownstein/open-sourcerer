import path from "path-browserify";

import { NavTerrainBlockType } from "src/api/navigation";
import { TileType, TilesetTileDefs } from "src/engine/level/tiled/api";
import {
  ITiledLevelJSON,
  isFiniteTileLayer,
  isTileLayer
} from "src/engine/level/tiled/tiledJson";

import { IVector2 } from "../util/vecTypes";
import { TerrainWithObstacles } from "./Terrain";

export function loadTerrainForTiledLevelWithTileDefs(
  levelJSON: ITiledLevelJSON,
  tileDefs: Record<string, TilesetTileDefs>,
  dataScale: IVector2
) {
  if (dataScale.x === 0 || dataScale.y === 0)
    throw new Error("[loadTerrainForTiledLevel] Invalid data scale.");
  const valueMap: Record<number, NavTerrainBlockType> = {};
  for (const tsRaw of levelJSON.tilesets) {
    const firstGid = tsRaw.firstgid;
    const sourceName = path.parse(tsRaw.source).name;
    const sourceTileDefs = tileDefs[sourceName];
    if (sourceTileDefs === undefined)
      throw new Error(
        `[loadTerrainForTiledLevelWithTileDefs]: tileset "${sourceName}" not provided.`
      );
    for (const tileDef of Object.values(sourceTileDefs.defs)) {
      const tileId = tileDef.id;
      let blockType: NavTerrainBlockType = NavTerrainBlockType.Empty;
      switch (tileDef.type) {
        case TileType.ground:
          blockType = NavTerrainBlockType.Solid;
          break;
        case TileType.platformStairsLeft:
        case TileType.slopeLeft:
        case TileType.stairsLeft:
          blockType = NavTerrainBlockType.SlopeLeft;
          break;
        case TileType.platformStairsRight:
        case TileType.slopeRight:
        case TileType.stairsRight:
          blockType = NavTerrainBlockType.SlopeRight;
          break;
        case TileType.platform:
          blockType = NavTerrainBlockType.Platform;
          break;
        case TileType.decal:
          blockType = NavTerrainBlockType.Empty;
          break;
        default:
          break;
      }
      valueMap[firstGid + tileId] = blockType;
    }
  }
  return loadTerrainForTiledLevelWithValueMap(levelJSON, valueMap, dataScale);
}

export function loadTerrainForTiledLevelWithValueMap(
  levelJSON: ITiledLevelJSON,
  valueMap: Record<number, NavTerrainBlockType>,
  dataScale: IVector2
) {
  if (dataScale.x === 0 || dataScale.y === 0)
    throw new Error("[loadTerrainForTiledLevel] Invalid data scale.");
  let dataWidth = levelJSON.width * levelJSON.tilewidth * Math.abs(dataScale.x);
  let dataHeight =
    levelJSON.height * levelJSON.tileheight * Math.abs(dataScale.y);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  if (levelJSON.infinite) {
    for (const layer of levelJSON.layers) {
      if (!isTileLayer(layer) || isFiniteTileLayer(layer)) continue;
      minX = Math.min(minX, (layer.startx ?? 0) * levelJSON.tilewidth);
      minY = Math.min(minY, (layer.starty ?? 0) * levelJSON.tileheight);
      maxX = Math.max(
        maxX,
        ((layer.startx ?? 0) + layer.width) * levelJSON.tilewidth
      );
      maxY = Math.max(
        maxY,
        ((layer.starty ?? 0) + layer.height) * levelJSON.tileheight
      );
    }
  } else {
    minX = 0;
    minY = 0;
    maxX = levelJSON.width * levelJSON.tilewidth;
    maxY = levelJSON.height * levelJSON.tileheight;
  }
  dataWidth = (maxX - minX) * Math.abs(dataScale.x);
  dataHeight = (maxY - minY) * Math.abs(dataScale.y);
  const terrain = new TerrainWithObstacles(
    dataWidth,
    dataHeight,
    levelJSON.tilewidth * Math.abs(dataScale.x),
    levelJSON.tileheight * Math.abs(dataScale.y),
    minX * dataScale.x,
    dataScale.y > 0 ? minY * dataScale.y : maxY * dataScale.y
  );
  if (levelJSON.infinite) {
    for (const layer of levelJSON.layers) {
      if (!isTileLayer(layer) || isFiniteTileLayer(layer)) continue;
      // TODO: find a better home for this bypass logic.
      if (layer.properties?.find((p) => p.name === "npcBypass" && !!p.value))
        continue;
      for (const chunk of layer.chunks) {
        terrain.dumpTileData(
          chunk.data,
          chunk.width,
          levelJSON.tilewidth * dataScale.x,
          levelJSON.tileheight * dataScale.y,
          chunk.x + 0.5,
          chunk.y + 0.5,
          valueMap
        );
      }
    }
  } else {
    for (const layer of levelJSON.layers) {
      if (!isTileLayer(layer) || !isFiniteTileLayer(layer)) continue;
      // TODO: find a better home for this bypass logic.
      if (layer.properties?.find((p) => p.name === "npcBypass" && !!p.value))
        continue;
      terrain.dumpTileData(
        layer.data,
        layer.width,
        levelJSON.tilewidth * dataScale.x,
        levelJSON.tileheight * dataScale.y,
        0.5,
        0.5,
        valueMap
      );
    }
  }

  return terrain;
}
