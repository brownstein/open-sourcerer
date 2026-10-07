import JSZip from "jszip";

import { StoredEditorMap } from "src/api/editorMap";
import { TilesetDefinitionAPI } from "src/engine/level/LevelLoaderAPI";
import { levelLoaderContext } from "src/engine/level/LevelLoaderContext";
import * as TiledFormat from "src/engine/level/tiled/tiledJson";
import { allTilesets } from "src/levels/tilesets/allTilesets";
import { renderLevelScreenshot } from "src/util/levelScreenshot";

import { buildLevelDefFromSavedMap } from "./editorMaps";
import { LevelEditorState } from "./levelEditorState";
import { buildTMJFromState } from "./tmjBuilder";
import { extractBaseName, fuzzyMatchTileset } from "./tmjLoader";

// Disk interchange for saved maps. The zip is the canonical shareable form:
// TMJ + tilesets + a small link sidecar, so a designer can hand off a zip and
// the recipient imports the exact same map — link included. Import is the
// inverse of export.

/** Filename of the zip entry that carries the (non-TMJ-representable) link. */
const ZIP_LINK_SIDECAR = "level-manager.json";

const THUMBNAIL_SIZE = 512;

export type ParsedMapFile = {
  name: string;
  mapJson: TiledFormat.ITiledLevelJSON;
  embeddedTilesets: Record<string, TilesetDefinitionAPI>;
  sourceLevelId?: string;
};

function isJunkZipPath(path: string): boolean {
  return (
    path.startsWith("__MACOSX/") ||
    path.includes("/__MACOSX/") ||
    path.split("/").some((seg) => seg.startsWith("._"))
  );
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function parseZipFile(file: File): Promise<ParsedMapFile> {
  const zip = await JSZip.loadAsync(file);

  let tmjPath: string | null = null;
  let mapJson: TiledFormat.ITiledLevelJSON | null = null;
  for (const [path, entry] of Object.entries(zip.files)) {
    if (entry.dir || !path.endsWith(".tmj") || isJunkZipPath(path)) continue;
    tmjPath = path;
    mapJson = JSON.parse(await entry.async("text"));
    break;
  }
  if (!mapJson || !tmjPath) {
    throw new Error("No .tmj file found in zip");
  }

  const embeddedTilesets: Record<string, TilesetDefinitionAPI> = {};
  for (const [path, entry] of Object.entries(zip.files)) {
    if (entry.dir || !path.endsWith(".tsj") || isJunkZipPath(path)) continue;
    const tsjJson = JSON.parse(await entry.async("text"));
    const tilesetName = (path.split("/").pop() || path).replace(/\.tsj$/i, "");
    const imageName: string = tsjJson.image || "";
    const imageDir = path.substring(0, path.lastIndexOf("/") + 1);
    const imageFile = zip.file(imageDir + imageName);
    const tileSetImage = imageFile
      ? URL.createObjectURL(await imageFile.async("blob"))
      : "";
    embeddedTilesets[tilesetName] = { tileSetJson: tsjJson, tileSetImage };
  }

  let name = (tmjPath.split("/").pop() || "Untitled").replace(/\.tmj$/i, "");
  let sourceLevelId: string | undefined;
  const sidecar = zip.file(ZIP_LINK_SIDECAR);
  if (sidecar) {
    try {
      const meta = JSON.parse(await sidecar.async("text"));
      if (typeof meta?.name === "string" && meta.name) name = meta.name;
      if (typeof meta?.sourceLevelId === "string") {
        sourceLevelId = meta.sourceLevelId;
      }
    } catch {
      // Malformed sidecar — fall back to a plain TMJ import.
    }
  }

  return { name, mapJson, embeddedTilesets, sourceLevelId };
}

/** Parse a .tmj/.json/.zip file into the pieces needed to load or save it.
 *  Plain Tiled files (no sidecar) import fine, just without a link. */
export async function parseMapFile(file: File): Promise<ParsedMapFile> {
  if (file.name.toLowerCase().endsWith(".zip")) {
    return parseZipFile(file);
  }
  const mapJson = JSON.parse(await file.text());
  return {
    name: file.name.replace(/\.(tmj|json)$/i, ""),
    mapJson,
    embeddedTilesets: {}
  };
}

function persistableTilesets(
  used: Record<string, TilesetDefinitionAPI>
): Record<string, TilesetDefinitionAPI> | undefined {
  const out: Record<string, TilesetDefinitionAPI> = {};
  for (const [name, def] of Object.entries(used)) {
    // Built-in tilesets resolve globally by name; no need to store them.
    // Inline/ephemeral image bytes are never persisted (uploads are out of
    // scope and would not survive a reload anyway).
    if (allTilesets[name]) continue;
    const url = def.tileSetImage;
    if (url?.startsWith("blob:") || url?.startsWith("data:")) continue;
    out[name] = def;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Serialize the live editor state into a canonical saved map record. Image
 *  layers are intentionally not persisted: their bytes are out of scope and
 *  link-provided background images flow back in from the source on load. */
export function buildStoredMapFromEditorState(
  state: LevelEditorState,
  opts: { id: string; name?: string; createdAt?: number }
): StoredEditorMap {
  const { tiledJson, usedTilesets } = buildTMJFromState(state);
  const now = Date.now();
  return {
    id: opts.id,
    name: opts.name ?? state.levelName,
    mapJson: tiledJson,
    tileSets: persistableTilesets(usedTilesets),
    sourceLevelId: state.sourceLevelId,
    levelUuid: state.levelUuid,
    createdAt: opts.createdAt ?? now,
    updatedAt: now
  };
}

/** Build a saved record from an imported file. Inverse of export: restores the
 *  link from a zip sidecar. Embedded blob-backed tilesets aren't persistable
 *  (uploaded tilesets are out of scope), so they resolve globally at play. */
export function buildStoredMapFromImport(
  parsed: ParsedMapFile,
  id: string
): StoredEditorMap {
  const now = Date.now();
  return {
    id,
    name: parsed.name,
    mapJson: parsed.mapJson,
    tileSets: persistableTilesets(parsed.embeddedTilesets),
    sourceLevelId: parsed.sourceLevelId,
    createdAt: now,
    updatedAt: now
  };
}

export function exportMapAsTmj(map: StoredEditorMap): void {
  const blob = new Blob([JSON.stringify(map.mapJson, null, 2)], {
    type: "application/json"
  });
  downloadBlob(blob, `${map.name}.tmj`);
}

/** Export a self-contained zip: TMJ + tilesets (.tsj + image) + screenshot +
 *  link sidecar. The sidecar makes the link round-trip through import. */
export async function exportMapAsZip(map: StoredEditorMap): Promise<void> {
  const zip = new JSZip();

  // Resolve each referenced tileset the way the importer does, and key both the
  // rewritten TMJ source and the bundled .tsj off the same basename, so the
  // exported map can never point at a tileset file the zip doesn't contain.
  const tmjCopy = JSON.parse(
    JSON.stringify(map.mapJson)
  ) as TiledFormat.ITiledLevelJSON & { tilesets?: { source?: string }[] };
  const tilesetsFolder = zip.folder("tilesets")!;
  const bundled = new Set<string>();
  for (const tsRef of tmjCopy.tilesets ?? []) {
    if (!tsRef.source) continue;
    const base = extractBaseName(tsRef.source);
    const match = fuzzyMatchTileset(tsRef.source, map.tileSets);
    tsRef.source = `tilesets/${base}.tsj`;
    if (!match) {
      console.warn(`Tileset "${base}" not found; export omits its files`);
      continue;
    }
    if (bundled.has(base)) continue;
    bundled.add(base);
    tilesetsFolder.file(
      `${base}.tsj`,
      JSON.stringify(match.def.tileSetJson, null, 2)
    );
    if (match.def.tileSetImage) {
      try {
        const blob = await (await fetch(match.def.tileSetImage)).blob();
        const imageName = match.def.tileSetJson.image || `${base}.png`;
        tilesetsFolder.file(imageName, blob);
      } catch (err) {
        console.warn(`Failed to fetch image for tileset ${base}:`, err);
      }
    }
  }
  zip.file(`${map.name}.tmj`, JSON.stringify(tmjCopy, null, 2));

  zip.file(
    ZIP_LINK_SIDECAR,
    JSON.stringify(
      {
        name: map.name,
        sourceLevelId: map.sourceLevelId
      },
      null,
      2
    )
  );

  // Bundle a 512x512 screenshot to match built-in thumbnails. Non-fatal.
  try {
    const def = buildLevelDefFromSavedMap(
      map,
      levelLoaderContext.hotLoaders.levels
    );
    const png = await renderLevelScreenshot(def, {
      width: THUMBNAIL_SIZE,
      height: THUMBNAIL_SIZE
    });
    zip.file(`${map.name}.png`, png);
  } catch (err) {
    console.warn("Failed to render level screenshot for zip:", err);
  }

  downloadBlob(await zip.generateAsync({ type: "blob" }), `${map.name}.zip`);
}
