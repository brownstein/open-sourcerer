import { StoredEditorMap } from "src/api/editorMap";
import { levelLoaderContext } from "src/engine/level/LevelLoaderContext";
import { renderLevelScreenshotDataUrl } from "src/util/levelScreenshot";

import {
  buildLevelDefFromSavedMap,
  setEditorMapScreenshot
} from "./editorMaps";

// Map previews are rendered once on save/import and cached in localStorage,
// rather than re-rendered per card (each render spins up a WebGL context).
// A small JPEG keeps a library of maps within the localStorage budget; the ZIP
// export uses a larger PNG instead.
const THUMBNAIL_SIZE = 320;
const THUMBNAIL_QUALITY = 0.72;

// Transparent 1x1, shown when a render fails so it never blocks a save.
export const BLANK_THUMBNAIL =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

/** Render a map's preview, falling back to a blank image if rendering fails. */
export async function renderEditorMapThumbnail(
  map: StoredEditorMap
): Promise<string> {
  try {
    const def = buildLevelDefFromSavedMap(
      map,
      levelLoaderContext.hotLoaders.levels
    );
    return await renderLevelScreenshotDataUrl(def, {
      width: THUMBNAIL_SIZE,
      height: THUMBNAIL_SIZE,
      type: "image/jpeg",
      quality: THUMBNAIL_QUALITY
    });
  } catch (err) {
    console.warn(`Failed to render preview for map ${map.id}:`, err);
    return BLANK_THUMBNAIL;
  }
}

/** Render and store a map's preview. Safe to fire-and-forget: the map is
 *  already saved, so a failed preview never affects saved content. */
export async function regenerateEditorMapThumbnail(
  map: StoredEditorMap
): Promise<void> {
  const screenshotImage = await renderEditorMapThumbnail(map);
  setEditorMapScreenshot(map.id, screenshotImage);
}
