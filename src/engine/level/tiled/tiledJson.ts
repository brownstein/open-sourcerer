// NOTE: Tiled maps a tile's flip/rotation with bit flags
//        32: horizontal flip
//        31: vertical flip
//        30: diagonal flip (swap x and y coordinates)
//        These 3 transformations can be combined to represent every state of a tile
export const HORIZONTAL_FLIP_BIT = 1 << 31;
export const VERTICAL_FLIP_BIT = 1 << 30;
export const DIAGONAL_FLIP_BIT = 1 << 29;
export const TILE_FLIP_BITS =
  HORIZONTAL_FLIP_BIT | VERTICAL_FLIP_BIT | DIAGONAL_FLIP_BIT;
export const TILE_ID_BITS = ~TILE_FLIP_BITS;

export type ITiledLevelJSONFiniteTileLayer = {
  data: number[];
  width: number;
  height: number;
  id: number;
  name: string;
  type: "tilelayer";
  visible: boolean;
  x: number;
  y: number;
  offsetx?: number;
  offsety?: number;
  parallaxx?: number;
  parallaxy?: number;
  opacity?: number;
  tintcolor?: string;
  properties?: ITiledLevelJSONObjectProperty[];
};

export type ITiledLevelJSONInfiniteTileLayer = {
  chunks: ITiledLevelJSONTileLayerChunk[];
  width: number;
  height: number;
  id: number;
  name: string;
  type: "tilelayer";
  visible: boolean;
  x: number;
  y: number;
  startx?: number;
  starty?: number;
  offsetx?: number;
  offsety?: number;
  parallaxx?: number;
  parallaxy?: number;
  opacity?: number;
  tintcolor?: string;
  properties?: ITiledLevelJSONObjectProperty[];
};

export type ITiledLevelJSONTileLayerChunk = {
  data: number[];
  height: number;
  width: number;
  x: number;
  y: number;
};

export type TiledLevelJSONTileLayer =
  | ITiledLevelJSONFiniteTileLayer
  | ITiledLevelJSONInfiniteTileLayer;

export type ITiledLevelJSONObjectProperty = {
  name: string;
  type: string;
  value: any;
  /** Tiled's class name for `type: "class"` properties. */
  propertytype?: string;
};

export type ITiledListElement = {
  type: string;
  value: any;
  propertytype?: string;
};

export type ITiledLevelJSONObjectText = {
  color?: string;
  fontfamily?: string;
  halign?: string;
  valign?: string;
  pixelsize: number;
  text: string;
  wrap: boolean;
};

export type ITiledLevelJSONObject = {
  id: number;
  name: string;
  x: number;
  y: number;
  height: number;
  width: number;
  point: boolean;
  ellipse?: boolean;
  polygon?: IPoint[];
  polyline?: IPoint[];
  rotation: number;
  type?: string;
  class?: string;
  visible: boolean;
  properties?: ITiledLevelJSONObjectProperty[];
  text?: ITiledLevelJSONObjectText;
};

export type ITiledLevelJSONObjectLayer = {
  id: number;
  name: string;
  type: "objectgroup";
  draworder: string;
  objects: ITiledLevelJSONObject[];
  opacity?: number;
  visible?: boolean;
  x?: number;
  y?: number;
  properties?: ITiledLevelJSONObjectProperty[];
};

export type ITiledLevelJSONImageLayer = {
  id: number;
  name: string;
  image?: string;
  offsetx: number;
  offsety: number;
  opacity: number;
  parallaxx?: number;
  parallaxy?: number;
  repeatx?: boolean;
  repeaty?: boolean;
  type: "imagelayer";
  visible: boolean;
  x: number;
  y: number;
  properties?: ITiledLevelJSONObjectProperty[];
};

export type ITiledLevelJSONGroupLayer = {
  id: number;
  name: string;
  layers: TiledLevelJSONLayer[];
  opacity?: number;
  type: "group";
  visible: boolean;
  x: number;
  y: number;
};

export type TiledLevelJSONLayer =
  | TiledLevelJSONTileLayer
  | ITiledLevelJSONObjectLayer
  | ITiledLevelJSONImageLayer
  | ITiledLevelJSONGroupLayer;

export type ITiledLevelJSONTileset = {
  firstgid: number;
  source: string;
};

export type ITiledLevelJSON = {
  width: number;
  height: number;
  infinite: boolean;
  layers: TiledLevelJSONLayer[];
  // Tiled writes these all-lowercase; any other casing is ignored on reload.
  nextlayerid?: number;
  nextobjectid?: number;
  orientation: string;
  renderorder: string;
  tiledversion: string;
  tilewidth: number;
  tileheight: number;
  tilesets: ITiledLevelJSONTileset[];
  type: string;
  version: number | string;
  backgroundcolor?: string;
  properties?: ITiledLevelJSONObjectProperty[];
};

export type IPoint = {
  x: number;
  y: number;
};

export type ITiledTileSetJSONTileObjectGroupObject = {
  id: number;
  width: number;
  height: number;
  name: string;
  polygon?: IPoint[];
  rotation: number;
  type?: string;
  class?: string;
  visible: boolean;
  x: number;
  y: number;
};

export type ITiledTileSetJSONTileObjectGroup = {
  draworder: string;
  id?: number;
  name: string;
  objects: ITiledTileSetJSONTileObjectGroupObject[];
  opacity: number;
  type: string;
  visible: boolean;
  x: number;
  y: number;
};

export type ITiledTileSetJSONTileProperty = {
  name: string;
  type: string;
  value: any;
};

export type ITiledTileSetJSONTile = {
  id: number;
  animation?: {
    duration?: number;
    tileid: number;
  }[];
  objectgroup?: ITiledTileSetJSONTileObjectGroup;
  properties?: ITiledTileSetJSONTileProperty[];
  type?: string;
  class?: string;
};

export type ITiledTileSetJSON = {
  columns: number;
  editorSettings?: {
    export: {
      format: string;
      target: string;
    };
  };
  image: string;
  imageheight: number;
  imagewidth: number;
  margin: number;
  name: string;
  spacing: number;
  tilecount: number;
  tiledversion: string;
  tileheight: number;
  tilewidth: number;
  tiles: ITiledTileSetJSONTile[];
  type?: string;
  class?: string;
  version: number | string;
};

export function isTileLayer(
  layer: TiledLevelJSONLayer
): layer is TiledLevelJSONTileLayer {
  return layer.type === "tilelayer";
}

export function isFiniteTileLayer(
  layer: TiledLevelJSONTileLayer
): layer is ITiledLevelJSONFiniteTileLayer {
  return !!(layer as ITiledLevelJSONFiniteTileLayer).data;
}

export function isObjectLayer(
  layer: TiledLevelJSONLayer
): layer is ITiledLevelJSONObjectLayer {
  return layer.type === "objectgroup";
}

export function isImageLayer(
  layer: TiledLevelJSONLayer
): layer is ITiledLevelJSONImageLayer {
  return layer.type === "imagelayer";
}

export function isGroupLayer(
  layer: TiledLevelJSONLayer
): layer is ITiledLevelJSONGroupLayer {
  return layer.type === "group";
}
