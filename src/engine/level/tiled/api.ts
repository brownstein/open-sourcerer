import { Box2, Color, Texture, Vector2 } from "three";

import { EntityProps } from "src/api/entity";

import {
  ITiledLevelJSON,
  ITiledLevelJSONImageLayer,
  ITiledTileSetJSON,
  ITiledTileSetJSONTile
} from "./tiledJson";

// Tile handling.

export enum TileType {
  ground = "ground",
  platform = "platform",
  decal = "decal",
  slopeLeft = "slopeLeft",
  slopeRight = "slopeRight",
  stairsLeft = "stairsLeft",
  stairsRight = "stairsRight",
  platformStairsLeft = "platformStairsLeft",
  platformStairsRight = "platformStairsRight",
  spikes = "spikes",
  water = "water",
  waterfall = "waterfall",
  ladder = "ladder",
  cracks = "cracks"
}

export enum TileModifier {
  cracked = "cracked"
}

export enum TileSides {
  top = "Top",
  left = "Left",
  bottom = "Bottom",
  right = "Right"
}

export type TiledJsonSheetSrcInfo = {
  name: string;
  src: ITiledTileSetJSON;
  // This should be populated by the loader.
  texture?: Texture;
  tileSize: Vector2;
  textureSize: Vector2;
};

export type TiledJsonTileSrcInfo = {
  id: number;
  src: ITiledTileSetJSONTile;
  sheet: TiledJsonSheetSrcInfo;
};

export type TileDefShape = {
  clippedPolygon: Vector2[];
  sidesClosed: Partial<Record<TileSides, boolean>>;
  sidesVertexIndices: Partial<Record<TileSides, Set<number>>>;
};

export type TileDef = {
  id: number;
  type?: TileType;
  rawTypeString?: string;
  src: TiledJsonTileSrcInfo;
  srcPos: Vector2;
  shape?: TileDefShape;
};

export type TilesetTileDefs = {
  sheetInfo: TiledJsonSheetSrcInfo;
  defs: Record<TileDef["id"], TileDef>;
  idToDefId: Record<number, TileDef["id"]>;
};

// Map handling.

export enum TileFlip {
  diagonal = "Diagonal",
  horizontal = "Horizontal",
  vertical = "Vertical"
}

export type TileFlipOptions = Partial<Record<TileFlip, boolean>>;

export type MapTile = {
  def: TileDef;
  pos: Vector2;
  flipOptions?: TileFlipOptions;

  // already flip corrected
  collisionPolygon?: Vector2[];
};

export type MapTerrain = {
  id: string;
  pos: Vector2;
  bbox: Box2;
  tileType?: TileType;
  tileModifier?: TileModifier;
  polygon: Vector2[];
  convexComponentPolygons: Vector2[][];
  decalTiles: MapTile[];
};

export type MapTileLayer = {
  type: "tiles";
  name: string;
  depth: number;
  terrain: MapTerrain[];
  properties?: Record<string, unknown>;
  parallax?: Vector2;
  offset?: Vector2;
  opacity?: number;
  tint?: Color;
};

export type MapObject = {
  type: string;
  props: EntityProps;
};

export type MapObjectLayer = {
  type: "entities";
  name: string;
  depth: number;
  visible: boolean;
  entities: MapObject[];
  expandBounds?: boolean;
};

export type MapImageLayer = {
  type: "image";
  name: string;
  depth: number;
  src: ITiledLevelJSONImageLayer;
  imageName?: string;
  texture?: Texture;
  size?: Vector2;
  offset: Vector2;
  parallax: Vector2;
  repeatX?: boolean;
  repeatY?: boolean;
  extendX?: boolean;
  extendY?: boolean;
};

export type MapLayer = MapTileLayer | MapObjectLayer | MapImageLayer;

export function isMapTileLayer(layer: MapLayer): layer is MapTileLayer {
  return layer.type === "tiles";
}

export function isMapObjectLayer(layer: MapLayer): layer is MapObjectLayer {
  return layer.type === "entities";
}

export type Map = {
  id: string;
  src: ITiledLevelJSON;
  layers: MapLayer[];
  bbox: Box2;
};
