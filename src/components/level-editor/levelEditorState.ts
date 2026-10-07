import type { TilesetDefinitionAPI } from "src/engine/level/LevelLoaderAPI";

// Matches the engine's fallback clear color so editor and play view agree.
export const DEFAULT_MAP_BACKGROUND_COLOR = "#112233";

// --- Types ---

export type TilePlacement = {
  gid: number; // LOCAL tile id within tilesetName (firstgid is added on export)
  tilesetName: string; // Which tileset this tile is from
  flipH?: boolean; // Horizontal flip
  flipV?: boolean; // Vertical flip
  flipD?: boolean; // Diagonal flip (swap x and y)
};

export function tilePlacementsEqual(
  a?: TilePlacement,
  b?: TilePlacement
): boolean {
  if (!a || !b) return !a && !b;
  return (
    a.tilesetName === b.tilesetName &&
    a.gid === b.gid &&
    !!a.flipH === !!b.flipH &&
    !!a.flipV === !!b.flipV &&
    !!a.flipD === !!b.flipD
  );
}

/** Arbitrary Tiled layer property (from the TMJ `properties` array). */
export type TiledProperty = {
  name: string;
  type: string;
  value: unknown;
  /** Tiled's class name, present only on `type: "class"` properties. */
  propertytype?: string;
};

export type TileLayer = {
  kind: "tile";
  id: string;
  name: string;
  tiles: Map<string, TilePlacement>; // key: "tileX,tileY" (Tiled coords, Y-down)
  visible: boolean;
  opacity: number;
  parallaxx?: number;
  parallaxy?: number;
  tintcolor?: string;
  offsetx?: number;
  offsety?: number;
  tiledProperties?: TiledProperty[];
};

export type EntityPlacement = {
  type: string;
  tileX: number; // Tile position (Tiled coords, Y-down)
  tileY: number;
  id: string;
  width?: number; // Override width in pixels (uses ENTITY_DEFAULTS if absent)
  height?: number; // Override height in pixels
  angle?: number; // Rotation in degrees (Tiled convention, clockwise)
  /** Tiled object id this placement came in with. Kept verbatim through the
   *  round trip so entityRef properties pointing at it stay valid. */
  tiledObjectId?: number;
  properties?: Record<string, unknown>;
  /** Tiled class name per object-valued property, kept so they re-export
   *  with their original label. */
  propertyClassNames?: Record<string, string>;
  polyline?: { x: number; y: number }[]; // Open polyline points in Tiled pixels, relative to entity origin
  polygon?: { x: number; y: number }[]; // Closed polygon points in Tiled pixels, relative to entity origin
};

export type EntityLayer = {
  kind: "entity";
  id: string;
  name: string;
  entities: EntityPlacement[];
  visible: boolean;
  opacity?: number;
  tiledProperties?: TiledProperty[];
};

export type ImageLayer = {
  kind: "image";
  id: string;
  name: string;
  visible: boolean;
  /** The raw image source path from the TMJ (e.g. "../../backgrounds/caves/cave-bg-0.png") */
  imagePath: string;
  /** Resolved image name (e.g. "cave-bg-0") for matching against levelDef.images */
  imageName: string;
  /** The image URL (data URL or blob URL) if available */
  imageUrl?: string;
  offsetx: number;
  offsety: number;
  opacity: number;
  parallaxx?: number;
  parallaxy?: number;
  repeatx?: boolean;
  repeaty?: boolean;
  tiledProperties?: TiledProperty[];
};

/** A layer of a type the editor doesn't understand. Carried inert: shown in
 *  the layer panel, never edited, re-emitted verbatim (in position) on save. */
export type UnknownLayer = {
  kind: "unknown";
  id: string;
  name: string;
  visible: boolean;
  /** The verbatim TMJ layer json. */
  raw: Record<string, unknown>;
};

export type EditorLayer = TileLayer | EntityLayer | ImageLayer | UnknownLayer;

export type EditorTool =
  | "paint"
  | "erase"
  | "fill"
  | "entity"
  | "select"
  | "polyline";

/** A rectangular region selected from a tileset palette. */
export type TileRegion = {
  startId: number; // top-left tile ID in the tileset
  width: number; // width in tiles
  height: number; // height in tiles
};

/** One cell of a paint stamp, offset from the stamp's top-left corner. */
export type TileStamp = { dx: number; dy: number; tile: TilePlacement };

/** The entityRef prop waiting for a picked target. */
export type EntityRefPick = { entityId: string; propName: string };

export type LevelEditorState = {
  layers: EditorLayer[];
  activeLayerId: string;

  selectedTool: EditorTool;
  selectedTilesetName: string;
  selectedTileId: number | null; // local tile ID within the tileset
  selectedTileRegion: TileRegion | null; // multi-tile rectangle selection from palette
  /** Brush captured from the canvas via right-drag (Tiled-style clone brush).
   *  Takes precedence over the palette selection; may span tilesets and carry
   *  per-cell flips. Editor-session only — never serialized. */
  capturedBrush: TileStamp[] | null;
  flipH: boolean; // Paint with horizontal flip
  flipV: boolean; // Paint with vertical flip
  flipD: boolean; // Paint with diagonal flip
  selectedEntityType: string | null;
  selectedEntityIds: string[]; // entity ids (for select tool)
  selectedTileKeys: string[]; // tile keys "x,y" (for select tool on tile layers)
  /** Pick mode overlays the current tool, leaving it and the selection alone.
   *  Session-only, like the tool itself — never enters the shared doc. */
  entityRefPick: EntityRefPick | null;
  /** Entity a hovered properties-panel ref chip points at, highlighted in the
   *  viewport. Session-only. */
  entityRefHoverEntityId: string | null;

  camera: { x: number; y: number; zoom: number };
  gridVisible: boolean;
  /** Highlight the active layer by strongly dimming everything else. */
  highlightActiveLayer: boolean;

  levelName: string;
  backgroundColor: string;
  /** Shared identity of the level itself, minted at creation and carried in
   *  the doc, used to match saves across peers. Never derived from files. */
  levelUuid?: string;
  /** Map-level Tiled custom properties, preserved through the round trip. */
  mapProperties?: TiledProperty[];
  /** The map's Tiled `nextobjectid`. Object ids are never reused, so new
   *  objects allocate from here rather than from the highest id in use. */
  nextObjectId?: number;
  /** Original TMJ source paths of tilesets this build couldn't resolve, keyed
   *  by base name, so re-export points at the same files. */
  unknownTilesetSources?: Record<string, string>;
  /** ID of the built-in level this map is linked to, if any. Non-authorable
   *  parts (setup/teardown, music, demo items, …) merge from it on load/play. */
  sourceLevelId?: string;
  /** ID of the saved map currently open, if it has been saved. Undefined means
   *  a never-saved map, so Save falls back to a Save As naming flow. */
  savedMapId?: string;

  // Tilesets loaded from external files (zip) that aren't in allTilesets
  externalTilesets?: Record<string, TilesetDefinitionAPI>;

  liveMode: boolean;

  snapEnabled: boolean;
};

// --- Utility functions ---

/** Find an entity by ID across all layers. */
export function findEntityInLayers(
  layers: EditorLayer[],
  entityId: string
): EntityPlacement | null {
  for (const layer of layers) {
    if (layer.kind !== "entity") continue;
    const entity = layer.entities.find((e) => e.id === entityId);
    if (entity) return entity;
  }
  return null;
}

/** Flatten all entity layers into a single array. */
export function flattenEntityLayers(layers: EditorLayer[]): EntityPlacement[] {
  const result: EntityPlacement[] = [];
  for (const layer of layers) {
    if (layer.kind === "entity") {
      result.push(...layer.entities);
    }
  }
  return result;
}
