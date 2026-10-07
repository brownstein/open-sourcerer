import shortid from "shortid";

import {
  LevelDefinitionAPI,
  TilesetDefinitionAPI
} from "src/engine/level/LevelLoaderAPI";
import { unwrapTiledList } from "src/engine/level/tiled/listProperty";
import { ITiledLevelJSON } from "src/engine/level/tiled/tiledJson";
import {
  DIAGONAL_FLIP_BIT,
  HORIZONTAL_FLIP_BIT,
  ITiledLevelJSONFiniteTileLayer,
  ITiledLevelJSONInfiniteTileLayer,
  TILE_ID_BITS,
  TiledLevelJSONLayer,
  VERTICAL_FLIP_BIT,
  isFiniteTileLayer,
  isGroupLayer,
  isImageLayer,
  isObjectLayer,
  isTileLayer
} from "src/engine/level/tiled/tiledJson";
import { allTilesets } from "src/levels/tilesets/allTilesets";

import { DEFAULT_ENTITY_SIZE, TILE_SIZE } from "./constants";
import { ENTITY_DEFAULTS } from "./entityDefaults";
import { normalizeEntityRefsAfterLoad } from "./entityRefs";
import {
  DEFAULT_MAP_BACKGROUND_COLOR,
  EditorLayer,
  EntityPlacement,
  ImageLayer,
  TileLayer,
  TiledProperty
} from "./levelEditorState";

type TilesetLookupEntry = {
  name: string;
  firstgid: number;
  tilecount: number;
};

/**
 * Resolve which tileset name a GID belongs to, given the TMJ tilesets array.
 * Returns { tilesetName, localTileId } or null. Tiles are never dropped for
 * pointing at an unresolvable or out-of-range tileset; they keep their
 * tileset reference (rendered as placeholders) so nothing is lost on save;
 * outOfRange flags ids past the tileset's declared tile count.
 */
function resolveGid(
  gid: number,
  tilesetEntries: TilesetLookupEntry[]
): {
  tilesetName: string;
  localTileId: number;
  flipH: boolean;
  flipV: boolean;
  flipD: boolean;
  outOfRange: boolean;
} | null {
  // Extract flip bits before stripping
  const flipH = !!(gid & HORIZONTAL_FLIP_BIT);
  const flipV = !!(gid & VERTICAL_FLIP_BIT);
  const flipD = !!(gid & DIAGONAL_FLIP_BIT);

  // Strip flip bits
  const cleanGid = gid & TILE_ID_BITS;
  if (cleanGid === 0) return null;

  // Find the tileset with the highest firstgid <= cleanGid
  let best: TilesetLookupEntry | null = null;
  for (const entry of tilesetEntries) {
    if (entry.firstgid <= cleanGid) {
      if (!best || entry.firstgid > best.firstgid) {
        best = entry;
      }
    }
  }

  if (!best) return null;
  const localTileId = cleanGid - best.firstgid;
  return {
    tilesetName: best.name,
    localTileId,
    flipH,
    flipV,
    flipD,
    outOfRange: localTileId >= best.tilecount
  };
}

/**
 * Normalize a string for fuzzy comparison: lowercase, strip spaces/hyphens/underscores.
 */
function normalizeForMatch(s: string): string {
  return s.toLowerCase().replace(/[\s\-_]/g, "");
}

/**
 * Extract a tileset base name from a raw source path.
 * Handles any OS path separators and strips common tileset extensions.
 */
export function extractBaseName(rawSource: string): string {
  const normalized = rawSource.replace(/\\/g, "/");
  const parts = normalized.split("/");
  const fileName = parts[parts.length - 1];
  return fileName.replace(/\.(tsj|tsx|json)$/i, "");
}

/**
 * Fuzzy-match a raw tileset source path against known tilesets.
 * Multi-tier resolution:
 * 1. Embedded tilesets: exact key -> case-insensitive key
 * 2. allTilesets: exact key -> case-insensitive key
 * 3. tileSetJson.name match: exact -> case-insensitive
 * 4. Normalized match (strip spaces/hyphens/underscores)
 * 5. Substring containment (normalized)
 */
export function fuzzyMatchTileset(
  rawSource: string,
  embeddedTilesets?: Record<string, TilesetDefinitionAPI>
): { name: string; def: TilesetDefinitionAPI } | null {
  const baseName = extractBaseName(rawSource);
  const baseNameLower = baseName.toLowerCase();
  const baseNameNorm = normalizeForMatch(baseName);

  // 1. Embedded tilesets
  if (embeddedTilesets) {
    if (embeddedTilesets[baseName]) {
      return { name: baseName, def: embeddedTilesets[baseName] };
    }
    for (const [key, def] of Object.entries(embeddedTilesets)) {
      if (key.toLowerCase() === baseNameLower) {
        return { name: key, def };
      }
    }
  }

  // 2. allTilesets exact key
  if (allTilesets[baseName]) {
    return { name: baseName, def: allTilesets[baseName] };
  }
  // allTilesets case-insensitive key
  for (const [key, def] of Object.entries(allTilesets)) {
    if (key.toLowerCase() === baseNameLower) {
      return { name: key, def };
    }
  }

  // 3. tileSetJson.name match (exact then case-insensitive)
  for (const [key, def] of Object.entries(allTilesets)) {
    if (def.tileSetJson.name === baseName) {
      return { name: key, def };
    }
  }
  for (const [key, def] of Object.entries(allTilesets)) {
    if (def.tileSetJson.name?.toLowerCase() === baseNameLower) {
      return { name: key, def };
    }
  }

  // 4. Normalized match (strip delimiters)
  if (embeddedTilesets) {
    for (const [key, def] of Object.entries(embeddedTilesets)) {
      if (normalizeForMatch(key) === baseNameNorm) {
        return { name: key, def };
      }
    }
  }
  for (const [key, def] of Object.entries(allTilesets)) {
    if (normalizeForMatch(key) === baseNameNorm) {
      return { name: key, def };
    }
  }
  for (const [key, def] of Object.entries(allTilesets)) {
    if (normalizeForMatch(def.tileSetJson.name || "") === baseNameNorm) {
      return { name: key, def };
    }
  }

  // 5. Substring containment (normalized) — catches "devtileset" matching "devtiles"
  if (embeddedTilesets) {
    for (const [key, def] of Object.entries(embeddedTilesets)) {
      const keyNorm = normalizeForMatch(key);
      if (keyNorm.includes(baseNameNorm) || baseNameNorm.includes(keyNorm)) {
        return { name: key, def };
      }
    }
  }
  for (const [key, def] of Object.entries(allTilesets)) {
    const keyNorm = normalizeForMatch(key);
    if (keyNorm.includes(baseNameNorm) || baseNameNorm.includes(keyNorm)) {
      return { name: key, def };
    }
  }
  for (const [key, def] of Object.entries(allTilesets)) {
    const nameNorm = normalizeForMatch(def.tileSetJson.name || "");
    if (
      nameNorm &&
      (nameNorm.includes(baseNameNorm) || baseNameNorm.includes(nameNorm))
    ) {
      return { name: key, def };
    }
  }

  return null;
}

/**
 * Build the tileset lookup table from TMJ tileset references.
 * Uses fuzzy matching to resolve arbitrary system paths.
 */
async function buildTilesetLookup(levelDef: LevelDefinitionAPI): Promise<{
  entries: TilesetLookupEntry[];
  missingTilesets: string[];
  unknownTilesetSources: Record<string, string>;
}> {
  const entries: TilesetLookupEntry[] = [];
  const missingTilesets: string[] = [];
  const unknownTilesetSources: Record<string, string> = {};

  let mapJson: ITiledLevelJSON;
  if (typeof levelDef.mapJson === "function") {
    mapJson = await levelDef.mapJson();
  } else {
    mapJson = levelDef.mapJson;
  }

  for (const tilesetRef of mapJson.tilesets) {
    const match = fuzzyMatchTileset(tilesetRef.source, levelDef.tileSets);
    if (match) {
      entries.push({
        name: match.name,
        firstgid: tilesetRef.firstgid,
        tilecount: match.def.tileSetJson.tilecount
      });
    } else {
      // Unresolvable tileset: keep its tiles anyway under the base name so
      // they render as placeholders and re-export intact. Distinct sources
      // sharing a basename each need their own name, or their tiles would
      // merge into one tileset on export.
      const baseName = extractBaseName(tilesetRef.source);
      let name = baseName;
      for (
        let suffix = 2;
        name in unknownTilesetSources &&
        unknownTilesetSources[name] !== tilesetRef.source;
        suffix++
      ) {
        name = `${baseName}-${suffix}`;
      }
      missingTilesets.push(name);
      unknownTilesetSources[name] = tilesetRef.source;
      entries.push({
        name,
        firstgid: tilesetRef.firstgid,
        tilecount: Infinity
      });
    }
  }

  return { entries, missingTilesets, unknownTilesetSources };
}

/**
 * Parse entities from a Tiled object layer into EntityPlacement array.
 */
function parseObjectLayer(
  objects: {
    id?: number;
    type?: string;
    class?: string;
    name: string;
    x: number;
    y: number;
    width?: number;
    height?: number;
    rotation?: number;
    properties?: {
      name: string;
      type?: string;
      value: unknown;
      propertytype?: string;
    }[];
    polyline?: { x: number; y: number }[];
    polygon?: { x: number; y: number }[];
  }[]
): EntityPlacement[] {
  const entities: EntityPlacement[] = [];
  for (const obj of objects) {
    const entityType = obj.type || obj.class || obj.name;
    if (!entityType) continue;

    const hasShape = obj.polyline || obj.polygon;

    const defaults = ENTITY_DEFAULTS[entityType] || DEFAULT_ENTITY_SIZE;
    const objW = hasShape ? 0 : obj.width ?? defaults.width;
    const objH = hasShape ? 0 : obj.height ?? defaults.height;

    // Convert Tiled pixel coords back to tile coords
    let tileX: number;
    let tileY: number;
    if (hasShape) {
      // Polyline/polygon entities: position is the origin point directly
      tileX = obj.x / TILE_SIZE;
      tileY = obj.y / TILE_SIZE;
    } else {
      tileX = (obj.x + objW / 2 - TILE_SIZE / 2) / TILE_SIZE;
      tileY = (obj.y + objH) / TILE_SIZE - 1;
    }

    // Tiled rotates objects around the top-left corner (obj.x, obj.y).
    // Compute the actual center after rotation and convert back to tile coords.
    if (obj.rotation && !hasShape) {
      const rad = (obj.rotation * Math.PI) / 180;
      const cosR = Math.cos(rad);
      const sinR = Math.sin(rad);
      const cx = obj.x + (objW / 2) * cosR - (objH / 2) * sinR;
      const cy = obj.y + (objW / 2) * sinR + (objH / 2) * cosR;
      tileX = (cx - TILE_SIZE / 2) / TILE_SIZE;
      tileY = (cy + objH / 2) / TILE_SIZE - 1;
    }

    let properties: Record<string, unknown> | undefined;
    let propertyClassNames: Record<string, string> | undefined;
    if (obj.properties && obj.properties.length > 0) {
      properties = {};
      for (const prop of obj.properties) {
        if (prop.type === "list") {
          properties[prop.name] = unwrapTiledList(prop.value);
        } else if (prop.type === "class") {
          properties[prop.name] = prop.value ?? {};
          if (prop.propertytype !== undefined) {
            if (!propertyClassNames) propertyClassNames = {};
            propertyClassNames[prop.name] = prop.propertytype;
          }
        } else {
          properties[prop.name] = prop.value;
        }
      }
    }

    // Capture Tiled object name as properties.name when it differs from the type
    if (obj.name && obj.name !== entityType) {
      if (!properties) properties = {};
      if (!properties.name) {
        properties.name = obj.name;
      }
    }

    // Preserve per-entity sizes when they differ from defaults
    const hasCustomWidth =
      !hasShape && obj.width !== undefined && obj.width !== defaults.width;
    const hasCustomHeight =
      !hasShape && obj.height !== undefined && obj.height !== defaults.height;

    const placement: EntityPlacement = {
      type: entityType,
      tileX,
      tileY,
      id: shortid(),
      ...(obj.id !== undefined ? { tiledObjectId: obj.id } : {}),
      ...(hasCustomWidth ? { width: obj.width } : {}),
      ...(hasCustomHeight ? { height: obj.height } : {}),
      ...(obj.rotation ? { angle: obj.rotation } : {}),
      properties,
      ...(propertyClassNames ? { propertyClassNames } : {})
    };

    if (obj.polyline && obj.polyline.length > 0) {
      placement.polyline = obj.polyline.map((p) => ({ x: p.x, y: p.y }));
    }
    if (obj.polygon && obj.polygon.length > 0) {
      placement.polygon = obj.polygon.map((p) => ({ x: p.x, y: p.y }));
    }

    entities.push(placement);
  }
  return entities;
}

/**
 * Recursively flatten group layers into a flat array of leaf layers.
 */
function expandLayerGroups(
  layers: TiledLevelJSONLayer[]
): TiledLevelJSONLayer[] {
  return layers.flatMap((layer) => {
    if (isGroupLayer(layer)) {
      return expandLayerGroups(layer.layers);
    }
    return [layer];
  });
}

/**
 * Extract a base name from an image/file path (without extension).
 */
function extractImageName(imagePath: string): string {
  const normalized = imagePath.replace(/\\/g, "/");
  const parts = normalized.split("/");
  const fileName = parts[parts.length - 1];
  return fileName.replace(/\.[^.]+$/, "");
}

/** Convert TMJ properties array to editor TiledProperty[], or undefined if empty. */
function parseTiledProperties(
  props?: {
    name: string;
    type: string;
    value: unknown;
    propertytype?: string;
  }[]
): TiledProperty[] | undefined {
  if (!props || props.length === 0) return undefined;
  return props.map((p) => ({
    name: p.name,
    type: p.type,
    value: p.value,
    ...(p.propertytype !== undefined ? { propertytype: p.propertytype } : {})
  }));
}

/**
 * Load a level definition into editor state (tile layers + entity layers).
 */
function normalizeTmjBackgroundColor(raw: string | undefined): string {
  if (!raw) return DEFAULT_MAP_BACKGROUND_COLOR;
  const hex = raw.replace(/^#/, "");
  const rgb = hex.length === 8 ? hex.slice(2) : hex;
  return /^[0-9a-fA-F]{6}$/.test(rgb)
    ? `#${rgb.toLowerCase()}`
    : DEFAULT_MAP_BACKGROUND_COLOR;
}

export async function loadLevelIntoEditor(
  levelDef: LevelDefinitionAPI
): Promise<{
  layers: EditorLayer[];
  levelId: string;
  levelName: string;
  backgroundColor: string;
  missingTilesets: string[];
  mapProperties?: TiledProperty[];
  nextObjectId?: number;
  unknownTilesetSources?: Record<string, string>;
}> {
  const {
    entries: tilesetLookup,
    missingTilesets,
    unknownTilesetSources
  } = await buildTilesetLookup(levelDef);
  const layers: EditorLayer[] = [];
  const outOfRangeCounts = new Map<string, number>();

  let mapJson: ITiledLevelJSON;
  if (typeof levelDef.mapJson === "function") {
    mapJson = await levelDef.mapJson();
  } else {
    mapJson = levelDef.mapJson;
  }

  const flatLayers = expandLayerGroups(mapJson.layers);

  for (const layer of flatLayers) {
    if (isTileLayer(layer)) {
      const editorLayer: TileLayer = {
        kind: "tile",
        id: shortid(),
        name: layer.name,
        tiles: new Map(),
        visible: layer.visible,
        opacity: layer.opacity ?? 1,
        parallaxx: layer.parallaxx,
        parallaxy: layer.parallaxy,
        tintcolor: layer.tintcolor,
        offsetx: layer.offsetx,
        offsety: layer.offsety,
        tiledProperties: parseTiledProperties(layer.properties)
      };

      if (isFiniteTileLayer(layer)) {
        // Finite tile layer
        const finiteLayer = layer as ITiledLevelJSONFiniteTileLayer;
        for (let y = 0; y < finiteLayer.height; y++) {
          for (let x = 0; x < finiteLayer.width; x++) {
            const idx = x + y * finiteLayer.width;
            const gid = finiteLayer.data[idx];
            if (!gid) continue;
            const resolved = resolveGid(gid, tilesetLookup);
            if (!resolved) continue;
            if (resolved.outOfRange) {
              outOfRangeCounts.set(
                resolved.tilesetName,
                (outOfRangeCounts.get(resolved.tilesetName) ?? 0) + 1
              );
            }
            const placement: import("./levelEditorState").TilePlacement = {
              gid: resolved.localTileId,
              tilesetName: resolved.tilesetName
            };
            if (resolved.flipH) placement.flipH = true;
            if (resolved.flipV) placement.flipV = true;
            if (resolved.flipD) placement.flipD = true;
            editorLayer.tiles.set(`${x},${y}`, placement);
          }
        }
      } else {
        // Infinite (chunk-based) tile layer
        const infiniteLayer = layer as ITiledLevelJSONInfiniteTileLayer;
        for (const chunk of infiniteLayer.chunks) {
          for (let ly = 0; ly < chunk.height; ly++) {
            for (let lx = 0; lx < chunk.width; lx++) {
              const gid = chunk.data[lx + ly * chunk.width];
              if (!gid) continue;
              const resolved = resolveGid(gid, tilesetLookup);
              if (!resolved) continue;
              if (resolved.outOfRange) {
                outOfRangeCounts.set(
                  resolved.tilesetName,
                  (outOfRangeCounts.get(resolved.tilesetName) ?? 0) + 1
                );
              }
              const tileX = chunk.x + lx;
              const tileY = chunk.y + ly;
              const placement: import("./levelEditorState").TilePlacement = {
                gid: resolved.localTileId,
                tilesetName: resolved.tilesetName
              };
              if (resolved.flipH) placement.flipH = true;
              if (resolved.flipV) placement.flipV = true;
              if (resolved.flipD) placement.flipD = true;
              editorLayer.tiles.set(`${tileX},${tileY}`, placement);
            }
          }
        }
      }

      // Skip empty border layers
      if (layer.name === "_Borders") continue;

      layers.push(editorLayer);
    } else if (isObjectLayer(layer)) {
      const entities = parseObjectLayer(layer.objects);
      layers.push({
        kind: "entity",
        id: shortid(),
        name: layer.name,
        entities,
        visible: layer.visible ?? true,
        opacity: layer.opacity,
        tiledProperties: parseTiledProperties(layer.properties)
      });
    } else if (isImageLayer(layer)) {
      const imagePath = layer.image || "";
      const imageName = extractImageName(imagePath);
      const imageUrl = levelDef.images?.[imageName];
      const imageLayer: ImageLayer = {
        kind: "image",
        id: shortid(),
        name: layer.name,
        visible: layer.visible,
        imagePath,
        imageName,
        imageUrl,
        offsetx: layer.offsetx ?? 0,
        offsety: layer.offsety ?? 0,
        opacity: layer.opacity ?? 1,
        parallaxx: layer.parallaxx,
        parallaxy: layer.parallaxy,
        repeatx: layer.repeatx,
        repeaty: layer.repeaty,
        tiledProperties: parseTiledProperties(layer.properties)
      };
      layers.push(imageLayer);
    } else {
      // Unknown layer type: never drop it. Carry the verbatim json through
      // the session and re-emit it in position on save.
      const rawLayer = layer as unknown as Record<string, unknown>;
      layers.push({
        kind: "unknown",
        id: shortid(),
        name: typeof rawLayer.name === "string" ? rawLayer.name : "Unknown",
        visible: rawLayer.visible !== false,
        raw: rawLayer
      });
    }
  }

  for (const [tilesetName, count] of outOfRangeCounts) {
    console.warn(
      `[tmjLoader] ${count} tile(s) reference ids past the end of tileset ` +
        `"${tilesetName}"; kept as-is (may render as placeholders)`
    );
  }

  // If no tile layers were found, create a default
  if (!layers.some((l) => l.kind === "tile")) {
    layers.unshift({
      kind: "tile",
      id: shortid(),
      name: "Main",
      tiles: new Map(),
      visible: true,
      opacity: 1
    });
  }

  // If no entity layers were found, create a default
  if (!layers.some((l) => l.kind === "entity")) {
    layers.push({
      kind: "entity",
      id: shortid(),
      name: "Entities",
      entities: [],
      visible: true
    });
  }

  const nextObjectId = normalizeEntityRefsAfterLoad(
    layers,
    mapJson.nextobjectid
  );

  return {
    layers,
    levelId: levelDef.id,
    levelName: levelDef.localizedName || levelDef.id,
    backgroundColor: normalizeTmjBackgroundColor(mapJson.backgroundcolor),
    missingTilesets,
    mapProperties: parseTiledProperties(mapJson.properties),
    nextObjectId,
    unknownTilesetSources:
      Object.keys(unknownTilesetSources).length > 0
        ? unknownTilesetSources
        : undefined
  };
}

/**
 * Load a raw TMJ JSON object (e.g. from a file picker) into editor state.
 * Optionally accepts embedded tilesets (e.g. from a zip file).
 */
export async function loadTmjJsonIntoEditor(
  tmjJson: ITiledLevelJSON,
  fileName: string,
  embeddedTilesets?: Record<string, TilesetDefinitionAPI>
): Promise<{
  layers: EditorLayer[];
  levelName: string;
  backgroundColor: string;
  missingTilesets: string[];
  mapProperties?: TiledProperty[];
  nextObjectId?: number;
  unknownTilesetSources?: Record<string, string>;
}> {
  const levelDef: LevelDefinitionAPI = {
    id: fileName,
    localizedName: fileName,
    mapJson: tmjJson,
    tileSets: embeddedTilesets
  };
  return loadLevelIntoEditor(levelDef);
}

/**
 * Compute a camera position that centers on the content bounding box.
 * Returns { x, y, zoom } suitable for levelEditorStore.setCamera().
 */
export function computeContentCamera(
  layers: EditorLayer[],
  viewportWidth: number,
  viewportHeight: number
): { x: number; y: number; zoom: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const layer of layers) {
    if (layer.kind === "tile") {
      for (const key of layer.tiles.keys()) {
        const [x, y] = key.split(",").map(Number);
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x + 1);
        maxY = Math.max(maxY, y + 1);
      }
    } else if (layer.kind === "entity") {
      for (const ent of layer.entities) {
        minX = Math.min(minX, ent.tileX);
        minY = Math.min(minY, ent.tileY);
        maxX = Math.max(maxX, ent.tileX + 1);
        maxY = Math.max(maxY, ent.tileY + 1);
      }
    }
    // Image layers don't contribute to content bounds
  }

  if (!isFinite(minX)) {
    return { x: 0, y: 0, zoom: 2 };
  }

  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  const contentWidthTiles = maxX - minX;
  const contentHeightTiles = maxY - minY;

  // Fit content to 80% of viewport
  const targetWidth = viewportWidth * 0.8;
  const targetHeight = viewportHeight * 0.8;

  const zoomX =
    contentWidthTiles > 0 ? targetWidth / (contentWidthTiles * TILE_SIZE) : 2;
  const zoomY =
    contentHeightTiles > 0
      ? targetHeight / (contentHeightTiles * TILE_SIZE)
      : 2;
  const zoom = Math.max(0.25, Math.min(16, Math.min(zoomX, zoomY)));

  return { x: centerX, y: centerY, zoom };
}
