import shortid from "shortid";

import { StoredEditorMap } from "src/api/editorMap";
import { GenericHotLoaderAPI } from "src/api/hotLoader";
import { createTypedEventEmitter } from "src/api/util";
import {
  LevelDefinitionAPI,
  TilesetDefinitionAPI
} from "src/engine/level/LevelLoaderAPI";
import { levelLoaderContext } from "src/engine/level/LevelLoaderContext";
import * as TiledFormat from "src/engine/level/tiled/tiledJson";

import { mintLevelUuid } from "./levelEditorDoc";

const EDITOR_MAPS_KEY = "open_sourcerer_editor_levels";
const EDITOR_MAP_ID_PREFIX = "editor-";

export const editorMapsEvents = createTypedEventEmitter<{ changed: void }>();

export function isEditorMapId(id: string): boolean {
  return id.startsWith(EDITOR_MAP_ID_PREFIX);
}

function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return slug || "map";
}

export function mintEditorMapId(name: string): string {
  return `${EDITOR_MAP_ID_PREFIX}${slugify(name)}-${shortid()}`;
}

type AuthorableLevelFields = {
  id: string;
  localizedName?: string;
  mapJson: TiledFormat.ITiledLevelJSON;
  tileSets?: Record<string, TilesetDefinitionAPI>;
  images?: Record<string, string>;
};

export function mergeAuthorableOverLink(
  base: Partial<LevelDefinitionAPI>,
  authorable: AuthorableLevelFields
): LevelDefinitionAPI {
  const images = { ...base.images, ...authorable.images };
  return {
    ...base,
    id: authorable.id,
    localizedName:
      authorable.localizedName as LevelDefinitionAPI["localizedName"],
    mapJson: authorable.mapJson,
    tileSets: authorable.tileSets ?? base.tileSets,
    images: Object.keys(images).length > 0 ? images : undefined,
    // WARN: coupled to the authored mapJson, so never inherited from the link:
    // background lives in mapJson, thumbnails render on demand, and a layer
    // allowlist is keyed to the source level's layer names.
    backgroundColor: undefined,
    screenshotImage: undefined,
    layers: undefined
  };
}

export function buildLevelDefFromSavedMap(
  map: StoredEditorMap,
  levelsLoader: GenericHotLoaderAPI<LevelDefinitionAPI>
): LevelDefinitionAPI {
  const base: Partial<LevelDefinitionAPI> = map.sourceLevelId
    ? levelsLoader.getResource(map.sourceLevelId) ?? {}
    : {};
  return mergeAuthorableOverLink(base, {
    id: map.id,
    localizedName: map.name,
    mapJson: map.mapJson,
    tileSets: map.tileSets,
    images: map.images
  });
}

function readRawMaps(): Record<string, unknown> {
  try {
    const raw = localStorage.getItem(EDITOR_MAPS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

// Rewrites the whole store, leaving entries other than the mutated one (and any
// unknown future fields) untouched. Returns false if the write did not land.
function mutateRawMaps(
  mutate: (maps: Record<string, unknown>) => void
): boolean {
  const maps = readRawMaps();
  mutate(maps);
  try {
    localStorage.setItem(EDITOR_MAPS_KEY, JSON.stringify(maps));
    return true;
  } catch {
    return false;
  }
}

// Tolerates older records (localizedName instead of name) and unknown fields.
// Fields from future builds are carried through (the leading spread) so a save
// on this build doesn't strip them. Null only when there is no usable map
// geometry.
function normalizeStoredMap(id: string, raw: unknown): StoredEditorMap | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (!r.mapJson || typeof r.mapJson !== "object") return null;
  const name =
    (typeof r.name === "string" && r.name) ||
    (typeof r.localizedName === "string" && r.localizedName) ||
    id;
  return {
    ...r,
    id,
    name,
    mapJson: r.mapJson as TiledFormat.ITiledLevelJSON,
    tileSets: (r.tileSets as StoredEditorMap["tileSets"]) ?? undefined,
    images: (r.images as StoredEditorMap["images"]) ?? undefined,
    sourceLevelId:
      typeof r.sourceLevelId === "string" ? r.sourceLevelId : undefined,
    levelUuid: typeof r.levelUuid === "string" ? r.levelUuid : undefined,
    createdAt: typeof r.createdAt === "number" ? r.createdAt : 0,
    updatedAt: typeof r.updatedAt === "number" ? r.updatedAt : 0,
    screenshotImage:
      typeof r.screenshotImage === "string" ? r.screenshotImage : undefined
  };
}

export function listEditorMaps(): StoredEditorMap[] {
  const out: StoredEditorMap[] = [];
  for (const [id, value] of Object.entries(readRawMaps())) {
    const map = normalizeStoredMap(id, value);
    if (map) out.push(map);
  }
  return out;
}

export function getEditorMap(id: string): StoredEditorMap | null {
  return normalizeStoredMap(id, readRawMaps()[id]);
}

// Registry update is unconditional (the live truth for the session); the
// boolean reports only whether the durable localStorage write succeeded.
function persistAndRegister(map: StoredEditorMap): boolean {
  const persisted = mutateRawMaps((maps) => {
    maps[map.id] = map;
  });
  const loader = levelLoaderContext.hotLoaders.levels;
  loader.updateResource(map.id, buildLevelDefFromSavedMap(map, loader));
  editorMapsEvents.emit("changed");
  return persisted;
}

export function saveEditorMap(map: StoredEditorMap): boolean {
  return persistAndRegister(map);
}

export function deleteEditorMap(id: string): void {
  mutateRawMaps((maps) => {
    delete maps[id];
  });
  levelLoaderContext.hotLoaders.levels.removeResource(id);
  editorMapsEvents.emit("changed");
}

export function renameEditorMap(id: string, name: string): void {
  const existing = getEditorMap(id);
  if (!existing || existing.name === name) return;
  persistAndRegister({ ...existing, name, updatedAt: Date.now() });
}

/** Update just the stored preview image, without bumping updatedAt. */
export function setEditorMapScreenshot(
  id: string,
  screenshotImage: string | undefined
): void {
  const existing = getEditorMap(id);
  if (!existing || existing.screenshotImage === screenshotImage) return;
  mutateRawMaps((maps) => {
    maps[id] = { ...existing, screenshotImage };
  });
  editorMapsEvents.emit("changed");
}

export function setEditorMapLink(
  id: string,
  sourceLevelId: string | undefined
): void {
  const existing = getEditorMap(id);
  if (!existing || existing.sourceLevelId === sourceLevelId) return;
  persistAndRegister({ ...existing, sourceLevelId, updatedAt: Date.now() });
}

export function duplicateEditorMap(id: string): StoredEditorMap | null {
  const existing = getEditorMap(id);
  if (!existing) return null;
  const now = Date.now();
  const name = `${existing.name} copy`;
  const copy: StoredEditorMap = {
    ...existing,
    id: mintEditorMapId(name),
    name,
    // A duplicate is a fork, not another copy of the same level: with a
    // shared uuid, in-room saves would match an arbitrary one of the two.
    levelUuid: mintLevelUuid(),
    createdAt: now,
    updatedAt: now
  };
  persistAndRegister(copy);
  return copy;
}

// Takes the loader as a parameter so it can run during LevelLoaderContext
// construction, before the levelLoaderContext singleton is assigned.
export function replayEditorMapsIntoRegistry(
  levelsLoader: GenericHotLoaderAPI<LevelDefinitionAPI>
): void {
  for (const map of listEditorMaps()) {
    levelsLoader.updateResource(
      map.id,
      buildLevelDefFromSavedMap(map, levelsLoader)
    );
  }
}
