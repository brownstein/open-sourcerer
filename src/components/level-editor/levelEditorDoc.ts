import * as Y from "yjs";

import { TilesetDefinitionAPI } from "src/engine/level/LevelLoaderAPI";
import { allTilesets } from "src/levels/tilesets/allTilesets";

import {
  EditorLayer,
  EntityLayer,
  EntityPlacement,
  ImageLayer,
  TileLayer,
  TilePlacement,
  TiledProperty,
  UnknownLayer
} from "./levelEditorState";

// The Y.Doc is the single source of truth for document (shared, undoable)
// state. It is ephemeral: populated from parsed TMJ on load, read back through
// the existing TMJ builder on save, and never persisted in binary form.
//
// Layout:
//   meta       Y.Map    levelName, backgroundColor, sourceLevelId, levelUuid
//   layerOrder Y.Array  layer ids, bottom to top
//   layers     Y.Map    layerId -> Y.Map of layer fields; tile layers hold a
//                       "tiles" Y.Map ("x,y" -> TilePlacement, replaced whole),
//                       entity layers hold an "entities" Y.Map (id ->
//                       EntityPlacement, replaced whole) plus an "entityOrder"
//                       Y.Array of entity ids
//   tilesets   Y.Map    tilesetName -> TilesetDefinitionAPI for every tileset
//                       the level uses, built-ins included, so peers whose
//                       build lacks a tileset can still round-trip its tiles

/** Origin tag for local user edits, the only origin the UndoManager tracks. */
export const LOCAL_EDIT_ORIGIN = "level-editor-local";

/** Origin tag for wholesale document (re)population; never undoable. */
export const DOC_LOAD_ORIGIN = "level-editor-load";

/** Origin tag for updates applied from remote peers. */
export const REMOTE_ORIGIN = "level-editor-remote";

/** Origin tag for automatic integrity repairs (duplicate Tiled object ids,
 *  legacy numeric entityRefs). Synced to peers like a local edit, but never
 *  undoable: undoing a repair would reintroduce the corruption. */
export const REPAIR_ORIGIN = "level-editor-repair";

export function getDocMeta(doc: Y.Doc): Y.Map<unknown> {
  return doc.getMap("meta");
}

export function getDocLayerOrder(doc: Y.Doc): Y.Array<string> {
  return doc.getArray("layerOrder");
}

export function getDocLayers(doc: Y.Doc): Y.Map<Y.Map<unknown>> {
  return doc.getMap("layers");
}

export function getDocTilesets(doc: Y.Doc): Y.Map<TilesetDefinitionAPI> {
  return doc.getMap("tilesets");
}

export function mintLevelUuid(): string {
  return crypto.randomUUID();
}

// ---------------------------------------------------------------------------
// EditorLayer to doc
// ---------------------------------------------------------------------------

function setIfDefined(target: Y.Map<unknown>, key: string, value: unknown) {
  if (value !== undefined) target.set(key, value);
}

function tileLayerToDoc(layer: TileLayer): Y.Map<unknown> {
  const yLayer = new Y.Map<unknown>();
  yLayer.set("kind", "tile");
  yLayer.set("name", layer.name);
  yLayer.set("visible", layer.visible);
  yLayer.set("opacity", layer.opacity);
  setIfDefined(yLayer, "parallaxx", layer.parallaxx);
  setIfDefined(yLayer, "parallaxy", layer.parallaxy);
  setIfDefined(yLayer, "tintcolor", layer.tintcolor);
  setIfDefined(yLayer, "offsetx", layer.offsetx);
  setIfDefined(yLayer, "offsety", layer.offsety);
  setIfDefined(yLayer, "tiledProperties", layer.tiledProperties);
  const yTiles = new Y.Map<TilePlacement>();
  for (const [key, placement] of layer.tiles) {
    yTiles.set(key, placement);
  }
  yLayer.set("tiles", yTiles);
  return yLayer;
}

function entityLayerToDoc(layer: EntityLayer): Y.Map<unknown> {
  const yLayer = new Y.Map<unknown>();
  yLayer.set("kind", "entity");
  yLayer.set("name", layer.name);
  yLayer.set("visible", layer.visible);
  setIfDefined(yLayer, "opacity", layer.opacity);
  setIfDefined(yLayer, "tiledProperties", layer.tiledProperties);
  const yEntities = new Y.Map<EntityPlacement>();
  const yOrder = new Y.Array<string>();
  for (const entity of layer.entities) {
    yEntities.set(entity.id, entity);
  }
  yOrder.insert(
    0,
    layer.entities.map((e) => e.id)
  );
  yLayer.set("entities", yEntities);
  yLayer.set("entityOrder", yOrder);
  return yLayer;
}

function imageLayerToDoc(layer: ImageLayer): Y.Map<unknown> {
  const yLayer = new Y.Map<unknown>();
  yLayer.set("kind", "image");
  yLayer.set("name", layer.name);
  yLayer.set("visible", layer.visible);
  yLayer.set("imagePath", layer.imagePath);
  yLayer.set("imageName", layer.imageName);
  setIfDefined(yLayer, "imageUrl", layer.imageUrl);
  yLayer.set("offsetx", layer.offsetx);
  yLayer.set("offsety", layer.offsety);
  yLayer.set("opacity", layer.opacity);
  setIfDefined(yLayer, "parallaxx", layer.parallaxx);
  setIfDefined(yLayer, "parallaxy", layer.parallaxy);
  setIfDefined(yLayer, "repeatx", layer.repeatx);
  setIfDefined(yLayer, "repeaty", layer.repeaty);
  setIfDefined(yLayer, "tiledProperties", layer.tiledProperties);
  return yLayer;
}

function unknownLayerToDoc(layer: UnknownLayer): Y.Map<unknown> {
  const yLayer = new Y.Map<unknown>();
  yLayer.set("kind", "unknown");
  yLayer.set("name", layer.name);
  yLayer.set("visible", layer.visible);
  yLayer.set("raw", layer.raw);
  return yLayer;
}

export function editorLayerToDoc(layer: EditorLayer): Y.Map<unknown> {
  if (layer.kind === "tile") return tileLayerToDoc(layer);
  if (layer.kind === "image") return imageLayerToDoc(layer);
  if (layer.kind === "unknown") return unknownLayerToDoc(layer);
  return entityLayerToDoc(layer);
}

// ---------------------------------------------------------------------------
// doc to EditorLayer
// ---------------------------------------------------------------------------

function get<T>(yLayer: Y.Map<unknown>, key: string): T | undefined {
  return yLayer.get(key) as T | undefined;
}

export function readDocTiles(
  yLayer: Y.Map<unknown>
): Map<string, TilePlacement> {
  const tiles = new Map<string, TilePlacement>();
  const yTiles = get<Y.Map<TilePlacement>>(yLayer, "tiles");
  if (yTiles) {
    yTiles.forEach((placement, key) => tiles.set(key, placement));
  }
  return tiles;
}

export function readDocEntities(yLayer: Y.Map<unknown>): EntityPlacement[] {
  const yEntities = get<Y.Map<EntityPlacement>>(yLayer, "entities");
  if (!yEntities) return [];
  const yOrder = get<Y.Array<string>>(yLayer, "entityOrder");
  const ordered: EntityPlacement[] = [];
  const seen = new Set<string>();
  if (yOrder) {
    for (const id of yOrder.toArray()) {
      const entity = yEntities.get(id);
      if (entity && !seen.has(id)) {
        ordered.push(entity);
        seen.add(id);
      }
    }
  }
  // Defensive: entities missing from the order array still render and save.
  yEntities.forEach((entity, id) => {
    if (!seen.has(id)) ordered.push(entity);
  });
  return ordered;
}

export function docLayerToEditorLayer(
  id: string,
  yLayer: Y.Map<unknown>,
  tilesView?: Map<string, TilePlacement>
): EditorLayer {
  const kind = get<string>(yLayer, "kind");
  const name = get<string>(yLayer, "name") ?? "";
  const visible = get<boolean>(yLayer, "visible") ?? true;
  const tiledProperties = get<TiledProperty[]>(yLayer, "tiledProperties");

  if (kind === "tile") {
    const layer: TileLayer = {
      kind: "tile",
      id,
      name,
      visible,
      tiles: tilesView ?? readDocTiles(yLayer),
      opacity: get<number>(yLayer, "opacity") ?? 1
    };
    const parallaxx = get<number>(yLayer, "parallaxx");
    const parallaxy = get<number>(yLayer, "parallaxy");
    const tintcolor = get<string>(yLayer, "tintcolor");
    const offsetx = get<number>(yLayer, "offsetx");
    const offsety = get<number>(yLayer, "offsety");
    if (parallaxx !== undefined) layer.parallaxx = parallaxx;
    if (parallaxy !== undefined) layer.parallaxy = parallaxy;
    if (tintcolor !== undefined) layer.tintcolor = tintcolor;
    if (offsetx !== undefined) layer.offsetx = offsetx;
    if (offsety !== undefined) layer.offsety = offsety;
    if (tiledProperties !== undefined) layer.tiledProperties = tiledProperties;
    return layer;
  }

  if (kind === "image") {
    const layer: ImageLayer = {
      kind: "image",
      id,
      name,
      visible,
      imagePath: get<string>(yLayer, "imagePath") ?? "",
      imageName: get<string>(yLayer, "imageName") ?? "",
      offsetx: get<number>(yLayer, "offsetx") ?? 0,
      offsety: get<number>(yLayer, "offsety") ?? 0,
      opacity: get<number>(yLayer, "opacity") ?? 1
    };
    const imageUrl = get<string>(yLayer, "imageUrl");
    const parallaxx = get<number>(yLayer, "parallaxx");
    const parallaxy = get<number>(yLayer, "parallaxy");
    const repeatx = get<boolean>(yLayer, "repeatx");
    const repeaty = get<boolean>(yLayer, "repeaty");
    if (imageUrl !== undefined) layer.imageUrl = imageUrl;
    if (parallaxx !== undefined) layer.parallaxx = parallaxx;
    if (parallaxy !== undefined) layer.parallaxy = parallaxy;
    if (repeatx !== undefined) layer.repeatx = repeatx;
    if (repeaty !== undefined) layer.repeaty = repeaty;
    if (tiledProperties !== undefined) layer.tiledProperties = tiledProperties;
    return layer;
  }

  if (kind === "entity") {
    const layer: EntityLayer = {
      kind: "entity",
      id,
      name,
      visible,
      entities: readDocEntities(yLayer)
    };
    const opacity = get<number>(yLayer, "opacity");
    if (opacity !== undefined) layer.opacity = opacity;
    if (tiledProperties !== undefined) layer.tiledProperties = tiledProperties;
    return layer;
  }

  return {
    kind: "unknown",
    id,
    name,
    visible,
    raw: get<Record<string, unknown>>(yLayer, "raw") ?? {}
  };
}

/** Layer ids in render order: the order array filtered to live layers, plus
 *  any stragglers missing from the order (defensive) appended. */
export function readDocLayerOrder(doc: Y.Doc): string[] {
  const yLayers = getDocLayers(doc);
  const ordered: string[] = [];
  const seen = new Set<string>();
  for (const id of getDocLayerOrder(doc).toArray()) {
    if (yLayers.has(id) && !seen.has(id)) {
      ordered.push(id);
      seen.add(id);
    }
  }
  yLayers.forEach((_, id) => {
    if (!seen.has(id)) ordered.push(id);
  });
  return ordered;
}

export function readDocLayersAsEditorLayers(doc: Y.Doc): EditorLayer[] {
  const yLayers = getDocLayers(doc);
  return readDocLayerOrder(doc).map((id) =>
    docLayerToEditorLayer(id, yLayers.get(id)!)
  );
}

// ---------------------------------------------------------------------------
// Population
// ---------------------------------------------------------------------------

/** Collect the tileset definitions for every tileset the layers reference,
 *  built-ins included, resolving from allTilesets first and then the provided
 *  external tilesets. Unresolvable names are skipped (the placements still
 *  carry their tileset name and survive save). */
export function collectUsedTilesets(
  layers: EditorLayer[],
  externalTilesets?: Record<string, TilesetDefinitionAPI>
): Record<string, TilesetDefinitionAPI> {
  const used: Record<string, TilesetDefinitionAPI> = {};
  for (const layer of layers) {
    if (layer.kind !== "tile") continue;
    for (const placement of layer.tiles.values()) {
      const name = placement.tilesetName;
      if (used[name]) continue;
      const def = allTilesets[name] ?? externalTilesets?.[name];
      if (def) used[name] = def;
    }
  }
  return used;
}

export type PopulateDocArgs = {
  layers: EditorLayer[];
  levelName: string;
  backgroundColor: string;
  sourceLevelId?: string;
  levelUuid?: string;
  tilesets?: Record<string, TilesetDefinitionAPI>;
  mapProperties?: TiledProperty[];
  nextObjectId?: number;
  unknownTilesetSources?: Record<string, string>;
};

/** Replace the doc's entire contents. Must be called inside a transaction. */
export function populateDoc(doc: Y.Doc, args: PopulateDocArgs): void {
  const meta = getDocMeta(doc);
  const yLayers = getDocLayers(doc);
  const yOrder = getDocLayerOrder(doc);
  const yTilesets = getDocTilesets(doc);

  for (const key of [...yLayers.keys()]) yLayers.delete(key);
  if (yOrder.length > 0) yOrder.delete(0, yOrder.length);
  for (const key of [...yTilesets.keys()]) yTilesets.delete(key);

  meta.set("levelName", args.levelName);
  meta.set("backgroundColor", args.backgroundColor);
  if (args.sourceLevelId !== undefined) {
    meta.set("sourceLevelId", args.sourceLevelId);
  } else {
    meta.delete("sourceLevelId");
  }
  meta.set("levelUuid", args.levelUuid ?? mintLevelUuid());
  // Lets peers distinguish a wholesale repopulation from ordinary edits even
  // when the level identity is unchanged (re-opening a save of this level).
  meta.set("loadStamp", crypto.randomUUID());
  if (args.mapProperties !== undefined) {
    meta.set("mapProperties", args.mapProperties);
  } else {
    meta.delete("mapProperties");
  }
  if (args.nextObjectId !== undefined) {
    meta.set("nextObjectId", args.nextObjectId);
  } else {
    meta.delete("nextObjectId");
  }
  if (args.unknownTilesetSources !== undefined) {
    meta.set("unknownTilesetSources", args.unknownTilesetSources);
  } else {
    meta.delete("unknownTilesetSources");
  }

  for (const layer of args.layers) {
    yLayers.set(layer.id, editorLayerToDoc(layer));
    yOrder.push([layer.id]);
  }

  const tilesets = args.tilesets ?? collectUsedTilesets(args.layers);
  for (const [name, def] of Object.entries(tilesets)) {
    yTilesets.set(name, def);
  }
}
