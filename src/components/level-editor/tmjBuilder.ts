import { TilesetDefinitionAPI } from "src/engine/level/LevelLoaderAPI";
import { wrapTiledList } from "src/engine/level/tiled/listProperty";
import * as TiledJson from "src/engine/level/tiled/tiledJson";
import {
  allTilesets,
  allTilesetsRegistry
} from "src/levels/tilesets/allTilesets";

import { DEFAULT_ENTITY_SIZE, TILE_SIZE } from "./constants";
import { ENTITY_DEFAULTS } from "./entityDefaults";
import { entityRefPropNames } from "./entityRefs";
import {
  EditorLayer,
  EntityPlacement,
  LevelEditorState,
  TiledProperty,
  flattenEntityLayers
} from "./levelEditorState";

// --- Constants ---

const BORDER_PADDING = 14;
const WALL_TILE_GID = 43; // solid ground tile in tiles16

// --- Chunk types ---

interface Chunk {
  data: number[];
  height: 16;
  width: 16;
  x: number;
  y: number;
}

/** Serialize an editor property to TMJ: arrays as Tiled lists, plain objects
 *  as classes, else a scalar. */
function toTmjObjectProperty(
  name: string,
  value: unknown,
  className?: string,
  entityRefValue?: number
): TiledJson.ITiledLevelJSONObjectProperty {
  // A numeric ref written as int/float still loads, but Tiled loses its object
  // picker and reference arrows for it.
  if (entityRefValue !== undefined) {
    return { name, type: "object", value: entityRefValue };
  }
  if (Array.isArray(value)) {
    return { name, type: "list", value: wrapTiledList(value) };
  }
  if (value !== null && typeof value === "object") {
    // Class values are plain JSON all the way down, nested arrays included.
    return {
      name,
      type: "class",
      ...(className !== undefined ? { propertytype: className } : {}),
      value
    };
  }
  return {
    name,
    type:
      typeof value === "boolean"
        ? "bool"
        : typeof value === "number"
          ? "float"
          : "string",
    value
  };
}

/** Convert editor TiledProperty[] back to TMJ properties format. */
function toTmjProperties(
  props?: TiledProperty[]
): TiledJson.ITiledLevelJSONObjectProperty[] | undefined {
  if (!props || props.length === 0) return undefined;
  return props.map((p) => ({
    name: p.name,
    type: p.type,
    value: p.value,
    ...(p.propertytype !== undefined ? { propertytype: p.propertytype } : {})
  }));
}

// --- Core functions ---

/**
 * Convert a sparse tile map to Tiled infinite chunk format.
 * GIDs in the map are already final (remapped with firstgid offsets).
 */
export function tilesToChunks(tiles: Map<string, number>): {
  chunks: Chunk[];
  startx: number;
  starty: number;
  width: number;
  height: number;
} {
  if (tiles.size === 0) {
    return { chunks: [], startx: 0, starty: 0, width: 16, height: 16 };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const key of tiles.keys()) {
    const [x, y] = key.split(",").map(Number);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }

  const chunkMinX = Math.floor(minX / 16) * 16;
  const chunkMinY = Math.floor(minY / 16) * 16;
  const chunkMaxX = Math.floor(maxX / 16) * 16;
  const chunkMaxY = Math.floor(maxY / 16) * 16;

  const chunks: Chunk[] = [];

  for (let cy = chunkMinY; cy <= chunkMaxY; cy += 16) {
    for (let cx = chunkMinX; cx <= chunkMaxX; cx += 16) {
      const data = new Array(256).fill(0);
      let hasData = false;

      for (let ly = 0; ly < 16; ly++) {
        for (let lx = 0; lx < 16; lx++) {
          const gid = tiles.get(`${cx + lx},${cy + ly}`);
          if (gid) {
            data[lx + ly * 16] = gid;
            hasData = true;
          }
        }
      }

      if (hasData) {
        chunks.push({ data, height: 16, width: 16, x: cx, y: cy });
      }
    }
  }

  return {
    chunks,
    startx: chunkMinX,
    starty: chunkMinY,
    width: chunkMaxX + 16 - chunkMinX,
    height: chunkMaxY + 16 - chunkMinY
  };
}

/** Every entity's exported object id, keyed by placement id. Assigned in
 *  document order; a placement whose stored id another placement already
 *  claimed (possible only in an unrepaired collaborative merge) gets a fresh
 *  id, so the written file never contains duplicate object ids. */
export function assignExportObjectIds(
  entities: EntityPlacement[],
  allocateObjectId: () => number
): Map<string, number> {
  const exportIds = new Map<string, number>();
  const usedObjectIds = new Set<number>();
  for (const ent of entities) {
    const stored = ent.tiledObjectId;
    const id =
      stored !== undefined && !usedObjectIds.has(stored)
        ? stored
        : allocateObjectId();
    usedObjectIds.add(id);
    exportIds.set(ent.id, id);
  }
  return exportIds;
}

/** An entityRef prop's exported Tiled object id: placement-id refs follow
 *  the target (0 when it no longer exists, Tiled's "no object"); legacy
 *  numeric refs pass through verbatim. */
function toExportedEntityRefValue(
  value: unknown,
  exportIds: Map<string, number>
): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return exportIds.get(value) ?? 0;
  return 0;
}

/**
 * Convert entity placements to Tiled object array.
 */
export function entitiesToObjects(
  entities: EntityPlacement[],
  exportIds: Map<string, number>
): TiledJson.ITiledLevelJSONObject[] {
  return entities.map((ent) => {
    const hasShape = ent.polyline || ent.polygon;
    const defaults = ENTITY_DEFAULTS[ent.type] || DEFAULT_ENTITY_SIZE;
    const w = hasShape ? 0 : ent.width ?? defaults.width;
    const h = hasShape ? 0 : ent.height ?? defaults.height;

    // Convert tile coords to Tiled pixel coords
    let objX: number;
    let objY: number;
    if (hasShape) {
      // Polyline/polygon entities: position is the origin point directly
      objX = ent.tileX * TILE_SIZE;
      objY = ent.tileY * TILE_SIZE;
    } else {
      // Entity bottom aligns with bottom of its tile cell
      objX = ent.tileX * TILE_SIZE + TILE_SIZE / 2 - w / 2;
      objY = (ent.tileY + 1) * TILE_SIZE - h;
    }

    // Tiled rotates objects around the top-left corner (x, y). When an entity
    // is rotated, we need to compute the pivot position that will produce the
    // correct center when parseMap applies rotation compensation on load.
    const rotation = ent.angle ?? 0;
    if (rotation !== 0 && !hasShape) {
      const rad = (rotation * Math.PI) / 180;
      const cosR = Math.cos(rad);
      const sinR = Math.sin(rad);
      const cx = objX + w / 2;
      const cy = objY + h / 2;
      objX = cx - (w / 2) * cosR + (h / 2) * sinR;
      objY = cy - (w / 2) * sinR - (h / 2) * cosR;
    }

    const obj: TiledJson.ITiledLevelJSONObject = {
      height: h,
      id: exportIds.get(ent.id)!,
      name: (ent.properties?.name as string) || ent.type,
      point: false,
      rotation: ent.angle ?? 0,
      type: ent.type,
      visible: true,
      width: w,
      x: objX,
      y: objY
    };
    if (ent.polyline && ent.polyline.length > 0) {
      obj.polyline = ent.polyline.map((p) => ({ x: p.x, y: p.y }));
    }
    if (ent.polygon && ent.polygon.length > 0) {
      obj.polygon = ent.polygon.map((p) => ({ x: p.x, y: p.y }));
    }
    if (ent.properties && Object.keys(ent.properties).length > 0) {
      // Filter out "name" — it's already stored in the Tiled object `name` field
      const propsToExport = Object.entries(ent.properties).filter(
        ([k]) => k !== "name"
      );
      if (propsToExport.length > 0) {
        const refPropNames = entityRefPropNames(ent.type);
        obj.properties = propsToExport.map(([name, value]) =>
          toTmjObjectProperty(
            name,
            value,
            ent.propertyClassNames?.[name],
            refPropNames?.has(name)
              ? toExportedEntityRefValue(value, exportIds)
              : undefined
          )
        );
      }
    }
    return obj;
  });
}

/**
 * Add border walls around all content for camera bounds.
 * Mutates the tiles map in place, using the "tiles16" tileset.
 */
const SMALL_LEVEL_THRESHOLD = 8; // tiles — only auto-add border walls for levels smaller than this

export function addBorderWalls(
  tiles: Map<string, number>,
  entities: EntityPlacement[],
  wallGid: number
): void {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const key of tiles.keys()) {
    const [x, y] = key.split(",").map(Number);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }

  for (const ent of entities) {
    const defaults = ENTITY_DEFAULTS[ent.type] || DEFAULT_ENTITY_SIZE;
    const ex = ent.tileX;
    const ey = ent.tileY;
    const ew = Math.ceil((ent.width ?? defaults.width) / TILE_SIZE);
    const eh = Math.ceil((ent.height ?? defaults.height) / TILE_SIZE);
    minX = Math.min(minX, ex);
    minY = Math.min(minY, ey);
    maxX = Math.max(maxX, ex + ew);
    maxY = Math.max(maxY, ey + eh);
  }

  if (!isFinite(minX)) return;

  // Skip border walls for levels that are large enough to have their own boundaries
  const contentWidth = maxX - minX + 1;
  const contentHeight = maxY - minY + 1;
  if (
    contentWidth >= SMALL_LEVEL_THRESHOLD &&
    contentHeight >= SMALL_LEVEL_THRESHOLD
  )
    return;

  const wallMinX = minX - BORDER_PADDING;
  const wallMaxX = maxX + BORDER_PADDING;
  const wallMinY = minY - BORDER_PADDING;
  const wallMaxY = maxY + BORDER_PADDING;

  for (let y = wallMinY; y <= wallMaxY; y++) {
    tiles.set(`${wallMinX},${y}`, wallGid);
  }
  for (let y = wallMinY; y <= wallMaxY; y++) {
    tiles.set(`${wallMaxX},${y}`, wallGid);
  }
  for (let x = wallMinX; x <= wallMaxX; x++) {
    tiles.set(`${x},${wallMinY}`, wallGid);
  }
  for (let x = wallMinX; x <= wallMaxX; x++) {
    tiles.set(`${x},${wallMaxY}`, wallGid);
  }
}

/**
 * Collect all unique tileset names used across all layers.
 * Assign sequential firstgid values.
 * Returns map of tilesetName -> firstgid and the tilesets array for the TMJ.
 */
function assignFirstGids(
  layers: EditorLayer[],
  externalTilesets?: Record<string, TilesetDefinitionAPI>,
  unknownTilesetSources?: Record<string, string>
): {
  firstGidMap: Map<string, number>;
  tmjTilesets: TiledJson.ITiledLevelJSONTileset[];
  usedTilesets: Record<string, TilesetDefinitionAPI>;
} {
  const usedNames = new Set<string>();

  // Always include tiles16 (needed for border walls)
  usedNames.add("tiles16");

  // Highest local tile id per tileset, to size the gid range of tilesets with
  // no known definition.
  const maxLocalId = new Map<string, number>();

  for (const layer of layers) {
    if (layer.kind === "tile") {
      for (const placement of layer.tiles.values()) {
        usedNames.add(placement.tilesetName);
        const prev = maxLocalId.get(placement.tilesetName) ?? 0;
        maxLocalId.set(placement.tilesetName, Math.max(prev, placement.gid));
      }
    }
  }

  // If there are entities, we need tiles16 for potential border walls
  const allEntities = flattenEntityLayers(layers);
  if (allEntities.length > 0) {
    usedNames.add("tiles16");
  }

  const firstGidMap = new Map<string, number>();
  const tmjTilesets: TiledJson.ITiledLevelJSONTileset[] = [];
  const usedTilesetsObj: Record<string, TilesetDefinitionAPI> = {};
  let nextFirstGid = 1;

  for (const name of usedNames) {
    const tilesetDef = allTilesets[name] ?? externalTilesets?.[name];
    firstGidMap.set(name, nextFirstGid);
    if (tilesetDef) {
      tmjTilesets.push({
        firstgid: nextFirstGid,
        source: `../../tilesets/${allTilesetsRegistry.getFilename(name)}.tsj`
      });
      usedTilesetsObj[name] = tilesetDef;
      nextFirstGid += Math.max(
        tilesetDef.tileSetJson.tilecount,
        (maxLocalId.get(name) ?? 0) + 1
      );
    } else {
      // No definition for this tileset on this build, so emit a reference (to
      // the original source path when known) sized to the ids actually used,
      // so the placements re-export intact.
      tmjTilesets.push({
        firstgid: nextFirstGid,
        source: unknownTilesetSources?.[name] ?? `../../tilesets/${name}.tsj`
      });
      nextFirstGid += (maxLocalId.get(name) ?? 0) + 1;
    }
  }

  return { firstGidMap, tmjTilesets, usedTilesets: usedTilesetsObj };
}

/**
 * Build a complete TMJ JSON from the editor state.
 * Handles multi-layer, multi-tileset output.
 */
export function buildTMJFromState(state: LevelEditorState): {
  tiledJson: TiledJson.ITiledLevelJSON;
  usedTilesets: Record<string, TilesetDefinitionAPI>;
} {
  const allEntities = flattenEntityLayers(state.layers);

  const { firstGidMap, tmjTilesets, usedTilesets } = assignFirstGids(
    state.layers,
    state.externalTilesets,
    state.unknownTilesetSources
  );

  const wallGid = (firstGidMap.get("tiles16") ?? 1) + WALL_TILE_GID - 1;

  const tmjLayers: TiledJson.TiledLevelJSONLayer[] = [];
  let nextLayerId = 1;

  // Ids for editor-added objects come from above every id the map has ever
  // handed out, so a deleted object's id can't be reused under a live ref.
  let highestObjectIdInUse = 0;
  for (const entity of allEntities) {
    if (entity.tiledObjectId !== undefined) {
      highestObjectIdInUse = Math.max(
        highestObjectIdInUse,
        entity.tiledObjectId
      );
    }
  }
  let nextObjectId = Math.max(
    state.nextObjectId ?? 1,
    highestObjectIdInUse + 1
  );
  const allocateObjectId = () => nextObjectId++;
  const exportObjectIds = assignExportObjectIds(allEntities, allocateObjectId);

  // Pre-compute tile GIDs for border calculation
  const allTilesForBorder = new Map<string, number>();
  for (const layer of state.layers) {
    if (layer.kind !== "tile") continue;
    for (const [key, placement] of layer.tiles) {
      const firstGid = firstGidMap.get(placement.tilesetName) ?? 1;
      allTilesForBorder.set(key, placement.gid + firstGid);
    }
  }

  addBorderWalls(allTilesForBorder, allEntities, wallGid);

  // Create a border wall layer with just the border walls
  const borderTiles = new Map<string, number>();
  for (const [key, gid] of allTilesForBorder) {
    let inEditor = false;
    for (const layer of state.layers) {
      if (layer.kind === "tile" && layer.tiles.has(key)) {
        inEditor = true;
        break;
      }
    }
    if (!inEditor) {
      borderTiles.set(key, gid);
    }
  }

  if (borderTiles.size > 0) {
    const { chunks, startx, starty, width, height } =
      tilesToChunks(borderTiles);
    if (chunks.length > 0) {
      tmjLayers.push({
        chunks,
        height,
        id: nextLayerId++,
        name: "_Borders",
        type: "tilelayer",
        visible: true,
        width,
        x: 0,
        y: 0,
        startx: startx,
        starty: starty,
        opacity: 1
      });
    }
  }

  // Build TMJ layers in unified order
  for (const layer of state.layers) {
    if (layer.kind === "tile") {
      const gidMap = new Map<string, number>();
      for (const [key, placement] of layer.tiles) {
        const firstGid = firstGidMap.get(placement.tilesetName) ?? 1;
        let gid = placement.gid + firstGid;
        if (placement.flipH) gid = (gid | TiledJson.HORIZONTAL_FLIP_BIT) >>> 0;
        if (placement.flipV) gid = (gid | TiledJson.VERTICAL_FLIP_BIT) >>> 0;
        if (placement.flipD) gid = (gid | TiledJson.DIAGONAL_FLIP_BIT) >>> 0;
        gidMap.set(key, gid);
      }
      // Empty layers are still written (with no chunks) so their name and
      // properties survive the round trip — e.g. after a rect erase.
      const { chunks, startx, starty, width, height } = tilesToChunks(gidMap);

      const tileLayer: TiledJson.ITiledLevelJSONInfiniteTileLayer = {
        chunks,
        height,
        id: nextLayerId++,
        name: layer.name,
        type: "tilelayer",
        visible: layer.visible,
        width,
        x: 0,
        y: 0,
        startx: startx,
        starty: starty,
        opacity: layer.opacity
      };

      if (layer.parallaxx !== undefined) tileLayer.parallaxx = layer.parallaxx;
      if (layer.parallaxy !== undefined) tileLayer.parallaxy = layer.parallaxy;
      if (layer.tintcolor !== undefined) tileLayer.tintcolor = layer.tintcolor;
      if (layer.offsetx !== undefined) tileLayer.offsetx = layer.offsetx;
      if (layer.offsety !== undefined) tileLayer.offsety = layer.offsety;
      const tileProps = toTmjProperties(layer.tiledProperties);
      if (tileProps) tileLayer.properties = tileProps;

      tmjLayers.push(tileLayer);
    } else if (layer.kind === "image") {
      const imageLayer: TiledJson.ITiledLevelJSONImageLayer = {
        id: nextLayerId++,
        name: layer.name,
        image: layer.imagePath || undefined,
        offsetx: layer.offsetx,
        offsety: layer.offsety,
        opacity: layer.opacity,
        type: "imagelayer",
        visible: layer.visible,
        x: 0,
        y: 0
      };
      if (layer.parallaxx !== undefined) imageLayer.parallaxx = layer.parallaxx;
      if (layer.parallaxy !== undefined) imageLayer.parallaxy = layer.parallaxy;
      if (layer.repeatx !== undefined) imageLayer.repeatx = layer.repeatx;
      if (layer.repeaty !== undefined) imageLayer.repeaty = layer.repeaty;
      const imgProps = toTmjProperties(layer.tiledProperties);
      if (imgProps) imageLayer.properties = imgProps;
      tmjLayers.push(imageLayer);
    } else if (layer.kind === "unknown") {
      // Re-emit the verbatim layer json in its original position. The id is
      // reassigned to keep the TMJ's id sequence coherent; name and
      // visibility write back so panel edits aren't silently dropped.
      tmjLayers.push({
        ...layer.raw,
        id: nextLayerId++,
        name: layer.name,
        visible: layer.visible
      } as unknown as TiledJson.TiledLevelJSONLayer);
    } else {
      const objects = entitiesToObjects(layer.entities, exportObjectIds);
      const objLayer: TiledJson.ITiledLevelJSONObjectLayer = {
        draworder: "topdown",
        id: nextLayerId++,
        name: layer.name,
        objects,
        opacity: layer.opacity ?? 1,
        type: "objectgroup",
        visible: layer.visible,
        x: 0,
        y: 0
      };
      const objProps = toTmjProperties(layer.tiledProperties);
      if (objProps) objLayer.properties = objProps;
      tmjLayers.push(objLayer);
    }
  }

  // Calculate overall dimensions
  let overallWidth = 16;
  let overallHeight = 16;
  for (const layer of tmjLayers) {
    if (layer.type === "tilelayer") {
      const tl = layer as TiledJson.ITiledLevelJSONInfiniteTileLayer;
      overallWidth = Math.max(overallWidth, tl.width);
      overallHeight = Math.max(overallHeight, tl.height);
    }
  }

  const tiledJson: TiledJson.ITiledLevelJSON = {
    backgroundcolor: state.backgroundColor,
    compressionlevel: -1,
    height: overallHeight,
    infinite: true,
    layers: tmjLayers,
    nextlayerid: nextLayerId,
    nextobjectid: nextObjectId,
    orientation: "orthogonal",
    renderorder: "right-down",
    tiledversion: "1.11.0",
    tileheight: TILE_SIZE,
    tilesets: tmjTilesets,
    tilewidth: TILE_SIZE,
    type: "map",
    version: "1.10",
    width: overallWidth
  } as TiledJson.ITiledLevelJSON;

  const mapProps = toTmjProperties(state.mapProperties);
  if (mapProps) tiledJson.properties = mapProps;

  return { tiledJson, usedTilesets };
}
