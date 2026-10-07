import { StoredEditorMap } from "src/api/editorMap";
import { levelLoaderContext } from "src/engine/level/LevelLoaderContext";

import { levelEditorStore } from "./LevelEditorStore";
import { buildStoredMapFromEditorState } from "./editorMapIO";
import { regenerateEditorMapThumbnail } from "./editorMapThumbnails";
import {
  buildLevelDefFromSavedMap,
  getEditorMap,
  mintEditorMapId,
  saveEditorMap
} from "./editorMaps";
import { mintLevelUuid } from "./levelEditorDoc";
import { EditorLayer } from "./levelEditorState";
import { computeContentCamera, loadLevelIntoEditor } from "./tmjLoader";

/** Off-screen viewport used to frame the camera on a freshly loaded map. */
export const AUTO_CENTER_VIEWPORT = { width: 800, height: 600 };

/** Frame the editor camera on the loaded map's content. */
export function recenterOnContent(layers: EditorLayer[]): void {
  levelEditorStore.setCamera(
    computeContentCamera(
      layers,
      AUTO_CENTER_VIEWPORT.width,
      AUTO_CENTER_VIEWPORT.height
    )
  );
}

/** Open a saved map for editing. It becomes the open map, so Save overwrites
 *  it in place rather than prompting for a new name. */
export async function openSavedMapInEditor(
  map: StoredEditorMap
): Promise<void> {
  // Lazy UUID backfill for pre-UUID saves: the doc must carry the record's
  // identity, or in-room saves can never match this slot again.
  let levelUuid = map.levelUuid;
  if (!levelUuid) {
    levelUuid = mintLevelUuid();
    saveEditorMap({ ...map, levelUuid });
  }
  const def = buildLevelDefFromSavedMap(
    map,
    levelLoaderContext.hotLoaders.levels
  );
  const loaded = await loadLevelIntoEditor(def);
  levelEditorStore.loadState({
    layers: loaded.layers,
    levelName: map.name,
    backgroundColor: loaded.backgroundColor,
    externalTilesets: map.tileSets,
    sourceLevelId: map.sourceLevelId,
    savedMapId: map.id,
    levelUuid,
    mapProperties: loaded.mapProperties,
    nextObjectId: loaded.nextObjectId,
    unknownTilesetSources: loaded.unknownTilesetSources
  });
  recenterOnContent(loaded.layers);
  if (loaded.missingTilesets.length > 0) {
    levelEditorStore.setMissingTilesets(loaded.missingTilesets);
  }
}

/** Load a registered (e.g. built-in) level as a NEW, never-saved map linked to
 *  it. Save will fall back to a Save As naming flow. */
export async function openLevelInEditorAsNew(levelId: string): Promise<void> {
  const def = levelLoaderContext.hotLoaders.levels.getResource(levelId);
  if (!def) return;
  const loaded = await loadLevelIntoEditor(def);
  levelEditorStore.loadState({
    layers: loaded.layers,
    levelName: loaded.levelName,
    backgroundColor: loaded.backgroundColor,
    sourceLevelId: levelId,
    mapProperties: loaded.mapProperties,
    nextObjectId: loaded.nextObjectId,
    unknownTilesetSources: loaded.unknownTilesetSources
  });
  recenterOnContent(loaded.layers);
  if (loaded.missingTilesets.length > 0) {
    levelEditorStore.setMissingTilesets(loaded.missingTilesets);
  }
}

/** Start a fresh blank, never-saved map. */
export function newBlankMapInEditor(): void {
  levelEditorStore.clearAll("Untitled");
}

/** Overwrite an existing saved slot with the current editor state and make it
 *  the open map. The existing record is spread first so fields this build
 *  doesn't know about survive the save. */
export function saveEditorStateOverExisting(
  existing: StoredEditorMap
): boolean {
  const state = levelEditorStore.getState();
  const map = {
    ...existing,
    ...buildStoredMapFromEditorState(state, {
      id: existing.id,
      name: state.levelName,
      createdAt: existing.createdAt
    })
  };
  const ok = saveEditorMap(map);
  void regenerateEditorMapThumbnail(map);
  levelEditorStore.setSavedMapId(existing.id);
  if (ok) levelEditorStore.markSaved();
  levelEditorStore.notifySaveResult(ok);
  return ok;
}

/** Save wherever the open map already lives: its saved slot when it has one,
 *  a fresh slot named after the level otherwise. */
export function saveCurrentEditorState(): boolean {
  const state = levelEditorStore.getState();
  const existing = state.savedMapId ? getEditorMap(state.savedMapId) : null;
  if (existing) return saveEditorStateOverExisting(existing);
  return saveEditorStateAsNewSlot(state.levelName || "Untitled");
}

/** Save the current editor state to a freshly minted slot and make it the
 *  open map. */
export function saveEditorStateAsNewSlot(name: string): boolean {
  const state = levelEditorStore.getState();
  const id = mintEditorMapId(name);
  const map = buildStoredMapFromEditorState(state, { id, name });
  const ok = saveEditorMap(map);
  void regenerateEditorMapThumbnail(map);
  levelEditorStore.setSavedMapId(id);
  if (ok) levelEditorStore.markSaved();
  levelEditorStore.notifySaveResult(ok);
  return ok;
}
