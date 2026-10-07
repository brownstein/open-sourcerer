import { Box, Typography } from "@mui/material";
import {
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { LinearSRGBColorSpace, NearestFilter, Texture } from "three";

import { GameControllerContext } from "src/components/context/GameControllerContext";
import { TilesetDefinitionAPI } from "src/engine/level/LevelLoaderAPI";
import entityMetadataRaw from "src/entities/metadata/allEntitiesMetadata.json";
import { EntityTypeSignature } from "src/entities/metadata/metadataTypes";
import { allTilesets } from "src/levels/tilesets/allTilesets";
import { useAppDispatch, useAppStore } from "src/redux/hooks";

import {
  LevelEditorRenderer,
  RefArrowLink,
  TilesetTextureCache,
  getEntityPixelSize
} from "./LevelEditorRenderer";
import { levelEditorStore } from "./LevelEditorStore";
import { playEditorLevel } from "./LevelEditorToolbar";
import {
  currentBrushStamps,
  lineTiles,
  patternLookup,
  stampsAlongLine
} from "./brushStamps";
import { PresenceOverlay } from "./collab/PresenceOverlay";
import { PresenceGhost } from "./collab/collabTypes";
import { presencePublisher } from "./collab/presencePublisher";
import { levelEditorSession } from "./collab/session";
import { HANDLE_SIZE, SNAP_GRID, TILE_SIZE } from "./constants";
import { editorOwnsKeyboard } from "./editorKeyboard";
import { collectEntityRefLinks, remapPastedEntityRefs } from "./entityRefs";
import { computeFillCells } from "./fillRegion";
import {
  EditorTool,
  EntityPlacement,
  TilePlacement,
  TileStamp,
  findEntityInLayers,
  flattenEntityLayers
} from "./levelEditorState";
import { useLevelEditorState } from "./useLevelEditorStore";

const entityMetadata = entityMetadataRaw as EntityTypeSignature[];

/** Snap a value to the nearest multiple of snapSize. */
function snapToGrid(value: number, snapSize: number): number {
  return Math.round(value / snapSize) * snapSize;
}

/** Canvas-pixel (device-pixel-ratio scaled) position to fractional tile
 *  coordinates. The single camera projection shared by the pointer helpers
 *  and the presence gesture snapshot. */
function canvasPixelToTile(
  px: number,
  py: number,
  camera: { x: number; y: number; zoom: number },
  canvasSize: { width: number; height: number }
): { tileX: number; tileY: number } {
  const scale = camera.zoom * TILE_SIZE;
  return {
    tileX: (px - canvasSize.width / 2) / scale + camera.x,
    tileY: (py - canvasSize.height / 2) / scale + camera.y
  };
}

/** True when the element is a text/form field that should own its own keystrokes. */
function isEditableTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return (
    el instanceof HTMLInputElement ||
    el instanceof HTMLTextAreaElement ||
    el instanceof HTMLSelectElement ||
    el.isContentEditable
  );
}

/** Snap pixel value (polyline coordinates) to half-tile increments. */
const SNAP_PX = SNAP_GRID * TILE_SIZE;

// Base EntityProps fields that should not be shown as custom properties
const BASE_PROP_NAMES = new Set([
  "id",
  "name",
  "inLevelDef",
  "angle",
  "opacity",
  "layerName",
  "position",
  "size",
  "polygon",
  "polyline"
]);

/** Build default custom properties for an entity type from metadata. */
function getDefaultEntityProperties(
  entityType: string
): Record<string, unknown> | undefined {
  const meta = entityMetadata.find((m) => m.name === entityType);
  if (!meta) return undefined;
  const props: Record<string, unknown> = {};
  // Only values the entity itself declares. Inventing an empty stand-in for a
  // required prop would read as filled in and hide that it still needs one.
  for (const arg of meta.args) {
    if (BASE_PROP_NAMES.has(arg.name)) continue;
    if (arg.defaultValue !== undefined) props[arg.name] = arg.defaultValue;
  }
  return Object.keys(props).length > 0 ? props : undefined;
}

type ResizeHandle = "nw" | "ne" | "sw" | "se";

/** Polyline create/edit session. Placing and inserting points runs through
 *  one state machine: `committed` holds the real points, the cursor marks
 *  where the next point goes, and a transient point follows the mouse for
 *  live preview. One undo snapshot is taken at session start, so the whole
 *  session reverts as a single step once finished. */
type PolylineSession = {
  entityId: string;
  mode: "create" | "edit";
  closed: boolean;
  committed: { x: number; y: number }[];
  cursorIndex: number;
  insertAfter: boolean;
  placedCount: number;
  origin: { tileX: number; tileY: number };
};

/** True when the session extends an endpoint of an open polyline (and can
 *  therefore be closed by clicking the opposite endpoint). */
function isEndpointSession(s: PolylineSession): boolean {
  return (
    !s.closed &&
    ((s.insertAfter && s.cursorIndex === s.committed.length - 1) ||
      (!s.insertAfter && s.cursorIndex === 0))
  );
}

/** Index of the close-target endpoint within the session's points. */
function sessionCloseStoreIndex(s: PolylineSession): number {
  return s.insertAfter ? 0 : s.committed.length - 1;
}

// --- Geometry helpers ---

/** Distance from point (px,py) to line segment (ax,ay)-(bx,by). */
function distToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) {
    const ex = px - ax;
    const ey = py - ay;
    return Math.sqrt(ex * ex + ey * ey);
  }
  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const closestX = ax + t * dx;
  const closestY = ay + t * dy;
  const ex = px - closestX;
  const ey = py - closestY;
  return Math.sqrt(ex * ex + ey * ey);
}

/** Find the closest edge of a polyline/polygon to the given point.
 *  Returns the segment index and the projected point (in Tiled pixels relative to entity origin). */
function projectOntoPolylineEdge(
  px: number,
  py: number,
  entity: EntityPlacement,
  tilePixels: number,
  offX: number,
  offY: number,
  hitDist: number
): { segmentIndex: number; point: { x: number; y: number } } | null {
  const points = entity.polyline || entity.polygon;
  if (!points || points.length < 2) return null;

  const originX = entity.tileX * tilePixels + offX;
  const originY = entity.tileY * tilePixels + offY;
  const TILE_SZ = TILE_SIZE;

  let bestDist = Infinity;
  let bestIdx = -1;
  let bestT = 0;

  const segCount = entity.polygon ? points.length : points.length - 1;
  for (let j = 0; j < segCount; j++) {
    const nextJ = (j + 1) % points.length;
    const ax = originX + (points[j].x / TILE_SZ) * tilePixels;
    const ay = originY + (points[j].y / TILE_SZ) * tilePixels;
    const bx = originX + (points[nextJ].x / TILE_SZ) * tilePixels;
    const by = originY + (points[nextJ].y / TILE_SZ) * tilePixels;
    const dist = distToSegment(px, py, ax, ay, bx, by);
    if (dist < bestDist) {
      bestDist = dist;
      bestIdx = j;
      // compute t
      const dx = bx - ax;
      const dy = by - ay;
      const lenSq = dx * dx + dy * dy;
      bestT =
        lenSq === 0
          ? 0
          : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
    }
  }
  if (bestDist > hitDist || bestIdx < 0) return null;

  const nextIdx = (bestIdx + 1) % points.length;
  const insertX =
    points[bestIdx].x + bestT * (points[nextIdx].x - points[bestIdx].x);
  const insertY =
    points[bestIdx].y + bestT * (points[nextIdx].y - points[bestIdx].y);
  return { segmentIndex: bestIdx, point: { x: insertX, y: insertY } };
}

// --- Hit-testing helpers (screen-space, used by mouse handlers) ---

function getEntityScreenRect(
  entity: EntityPlacement,
  tilePixels: number,
  offsetX: number,
  offsetY: number
): { x: number; y: number; w: number; h: number; cx: number; cy: number } {
  const { width, height } = getEntityPixelSize(entity);
  const screenX = entity.tileX * tilePixels + offsetX;
  const screenY = entity.tileY * tilePixels + offsetY;
  const w = (width / TILE_SIZE) * tilePixels;
  const h = (height / TILE_SIZE) * tilePixels;
  const entityScreenX = screenX + (tilePixels - w) / 2;
  const entityScreenY = screenY + tilePixels - h;
  const cx = entityScreenX + w / 2;
  const cy = entityScreenY + h / 2;
  return { x: entityScreenX, y: entityScreenY, w, h, cx, cy };
}

function getEntityCenterPixel(
  entity: EntityPlacement,
  tilePixels: number,
  offsetX: number,
  offsetY: number
): { cx: number; cy: number } {
  const rect = getEntityScreenRect(entity, tilePixels, offsetX, offsetY);
  return { cx: rect.cx, cy: rect.cy };
}

function pointInEntity(
  px: number,
  py: number,
  rect: { cx: number; cy: number; w: number; h: number },
  angleDeg: number
): boolean {
  let dx = px - rect.cx;
  let dy = py - rect.cy;
  if (angleDeg !== 0) {
    const rad = -(angleDeg * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const rx = dx * cos - dy * sin;
    const ry = dx * sin + dy * cos;
    dx = rx;
    dy = ry;
  }
  return Math.abs(dx) <= rect.w / 2 && Math.abs(dy) <= rect.h / 2;
}

function rotatePointToLocal(
  px: number,
  py: number,
  centerX: number,
  centerY: number,
  angleDeg: number
): { lx: number; ly: number } {
  let dx = px - centerX;
  let dy = py - centerY;
  if (angleDeg !== 0) {
    const rad = -(angleDeg * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const rx = dx * cos - dy * sin;
    const ry = dx * sin + dy * cos;
    dx = rx;
    dy = ry;
  }
  return { lx: centerX + dx, ly: centerY + dy };
}

function hitTestResizeHandle(
  px: number,
  py: number,
  rect: { x: number; y: number; w: number; h: number; cx: number; cy: number },
  angleDeg: number
): ResizeHandle | null {
  const { lx, ly } = rotatePointToLocal(px, py, rect.cx, rect.cy, angleDeg);
  const hs = HANDLE_SIZE;
  const corners: { handle: ResizeHandle; cx: number; cy: number }[] = [
    { handle: "nw", cx: rect.x, cy: rect.y },
    { handle: "ne", cx: rect.x + rect.w, cy: rect.y },
    { handle: "sw", cx: rect.x, cy: rect.y + rect.h },
    { handle: "se", cx: rect.x + rect.w, cy: rect.y + rect.h }
  ];
  for (const { handle, cx, cy } of corners) {
    if (Math.abs(lx - cx) <= hs && Math.abs(ly - cy) <= hs) {
      return handle;
    }
  }
  return null;
}

function hitTestRotationHandle(
  px: number,
  py: number,
  rect: { x: number; y: number; w: number; h: number; cx: number; cy: number },
  angleDeg: number
): boolean {
  const { lx, ly } = rotatePointToLocal(px, py, rect.cx, rect.cy, angleDeg);
  const hs = HANDLE_SIZE;
  const handleCx = rect.x + rect.w / 2;
  const handleCy = rect.y - hs * 2;
  return Math.abs(lx - handleCx) <= hs && Math.abs(ly - handleCy) <= hs;
}

// --- Tileset texture loading hook ---

function useTilesetTextures(
  externalTilesets?: Record<string, TilesetDefinitionAPI>
): { cache: TilesetTextureCache; loadCount: number } {
  const [cache] = useState<TilesetTextureCache>(() => new Map());
  const [loadCount, setLoadCount] = useState(0);

  useEffect(() => {
    for (const [name, tileset] of Object.entries(allTilesets)) {
      if (cache.has(name)) continue;
      const img = new Image();
      img.src = tileset.tileSetImage;
      img.onload = () => {
        const tex = new Texture(img);
        tex.flipY = false;
        tex.magFilter = NearestFilter;
        tex.minFilter = NearestFilter;
        tex.colorSpace = LinearSRGBColorSpace;
        tex.needsUpdate = true;
        cache.set(name, { texture: tex, img });
        setLoadCount((c) => c + 1);
      };
    }
  }, [cache]);

  useEffect(() => {
    if (!externalTilesets) return;
    for (const [name, tileset] of Object.entries(externalTilesets)) {
      if (cache.has(name)) continue;
      const img = new Image();
      img.src = tileset.tileSetImage;
      img.onload = () => {
        const tex = new Texture(img);
        tex.flipY = false;
        tex.magFilter = NearestFilter;
        tex.minFilter = NearestFilter;
        tex.colorSpace = LinearSRGBColorSpace;
        tex.needsUpdate = true;
        cache.set(name, { texture: tex, img });
        setLoadCount((c) => c + 1);
      };
    }
  }, [cache, externalTilesets]);

  return { cache, loadCount };
}

// =============================================================================
// Component
// =============================================================================

export function LevelEditorCanvas() {
  const state = useLevelEditorState();
  const reduxStore = useAppStore();
  const dispatch = useAppDispatch();
  const controller = useContext(GameControllerContext);
  const webglCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 });
  const { cache: tilesetTextures, loadCount: tilesetLoadCount } =
    useTilesetTextures(state.externalTilesets);

  // Pan state
  const isPanningRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0 });
  const cameraStartRef = useRef({ x: 0, y: 0 });

  // Paint stroke tracking
  const strokeTilesRef = useRef<Set<string>>(new Set());
  const isPaintingRef = useRef(false);
  const undoPushedRef = useRef(false);

  // Entity dragging state
  const isDraggingEntityRef = useRef(false);
  const dragEntityIdRef = useRef<string | null>(null);
  const dragStartTileRef = useRef({ x: 0, y: 0 });
  const dragStartExactRef = useRef({ x: 0, y: 0 });
  const dragEntityStartRef = useRef({ x: 0, y: 0 });

  // Resize state
  const isResizingRef = useRef(false);
  const resizeHandleRef = useRef<ResizeHandle | null>(null);
  const resizeStartRef = useRef({
    width: 0,
    height: 0,
    screenX: 0,
    screenY: 0,
    tileX: 0,
    tileY: 0
  });
  const resizeEntityIdRef = useRef<string | null>(null);

  // Rotation state
  const isRotatingRef = useRef(false);
  const rotateEntityIdRef = useRef<string | null>(null);
  const rotateCenterRef = useRef({ px: 0, py: 0 });
  const rotateStartAngleRef = useRef(0);

  // Image layer load trigger
  const [imageLoadCount, setImageLoadCount] = useState(0);

  // Mouse tile position
  const [mouseTile, setMouseTile] = useState<{ x: number; y: number } | null>(
    null
  );
  const [cursor, setCursor] = useState("crosshair");

  // Entity under the cursor while picking an entityRef target.
  const [pickHoverEntityId, setPickHoverEntityId] = useState<string | null>(
    null
  );

  // Renderer instance
  const rendererRef = useRef<LevelEditorRenderer | null>(null);
  const [levelReady, setLevelReady] = useState(false);

  // Store latest camera/canvasSize/state in refs for render loop
  const cameraRef = useRef(state.camera);
  cameraRef.current = state.camera;
  const canvasSizeRef = useRef(canvasSize);
  canvasSizeRef.current = canvasSize;
  const stateRef = useRef(state);
  stateRef.current = state;
  const mouseTileRef = useRef(mouseTile);
  mouseTileRef.current = mouseTile;

  // Ref for getCurrentTileStamp (used by render loop without re-registration)
  const getCurrentTileStampRef = useRef<
    () => { dx: number; dy: number; tile: TilePlacement }[] | null
  >(() => null);

  // Clipboard for entity copy/paste (supports multiple entities)
  const clipboardEntitiesRef = useRef<
    { dx: number; dy: number; entity: EntityPlacement }[] | null
  >(null);

  // Clipboard for tile copy/paste (array of {dx, dy, tile} relative offsets)
  const clipboardTilesRef = useRef<
    { dx: number; dy: number; tile: TilePlacement }[] | null
  >(null);

  // Pending tile click info for deferred click-vs-boxselect resolution
  const pendingTileClickRef = useRef<{
    key: string;
    tileExists: boolean;
    shiftKey: boolean;
  } | null>(null);

  // Tile drag state
  const isDraggingTilesRef = useRef(false);
  const tileDragStartRef = useRef({ x: 0, y: 0 });
  const tileDragOffsetRef = useRef({ dx: 0, dy: 0 });

  // Box-select state
  const isBoxSelectingRef = useRef(false);
  const boxSelectStartRef = useRef({ x: 0, y: 0 });
  const boxSelectEndRef = useRef({ x: 0, y: 0 });
  const [boxSelectRect, setBoxSelectRect] = useState<{
    x: number;
    y: number;
    w: number;
    h: number;
  } | null>(null);

  // Right-drag marquee for brush capture (paint tool) / rect erase (erase
  // tool). Shares the box-select start/end refs and overlay rect.
  const marqueeToolRef = useRef<"paint" | "erase" | null>(null);

  // Multi-entity drag state
  const isDraggingMultiRef = useRef(false);
  const multiDragStartTileRef = useRef({ x: 0, y: 0 });
  const multiDragStartPositionsRef = useRef<
    { id: string; tileX: number; tileY: number }[]
  >([]);

  const polylineSessionRef = useRef<PolylineSession | null>(null);
  // Rubber-band strip (absolute Tiled pixels) for the render loop.
  const sessionPreviewRef = useRef<{ x: number; y: number }[] | null>(null);
  const [sessionHotPoint, setSessionHotPoint] = useState<{
    entityId: string;
    pointIndex: number;
  } | null>(null);
  // Finishing a session by re-clicking the cursor point emits a dblclick
  // right after — ignore it so it doesn't instantly reopen an edit session.
  const sessionEndedAtRef = useRef(0);
  const [sessionCloseTarget, setSessionCloseTarget] = useState<{
    entityId: string;
    pointIndex: number;
  } | null>(null);

  // Drag gestures defer their undo snapshot until actual movement so the
  // constituent clicks of a double-click don't deposit stray undo entries.
  const pendingDragUndoRef = useRef(false);

  // Snapped fractional cursor position for the placement ghost (must match
  // the exact math used when the entity is actually placed).
  const ghostTileRef = useRef<{ tileX: number; tileY: number } | null>(null);

  // Shift-line painting: the anchor of the pending straight line, and whether
  // the mouse button is still down (drag variant confirms on release).
  const lineAnchorRef = useRef<{ x: number; y: number } | null>(null);
  const lineButtonDownRef = useRef(false);

  // Brush/fill preview for the render loop, cached so the renderer can skip
  // rebuilding its meshes (fill previews can span thousands of cells).
  const previewCacheRef = useRef<{
    state: unknown;
    key: string;
    tiles: TileStamp[] | null;
  } | null>(null);

  // Polyline point dragging state (select tool)
  const isDraggingPolyPointRef = useRef(false);
  const polyPointEntityIdRef = useRef<string | null>(null);
  const polyPointIndexRef = useRef(-1);
  // Track last-interacted polyline point for deletion and rendering
  const selectedPolyPointEntityIdRef = useRef<string | null>(null);
  const selectedPolyPointIndexRef = useRef(-1);
  const [selectedPolyPoint, setSelectedPolyPoint] = useState<{
    entityId: string;
    pointIndex: number;
  } | null>(null);
  const polyPointStartScreenRef = useRef({ x: 0, y: 0 });
  const polyPointStartValueRef = useRef({ x: 0, y: 0 });

  // Whether the select tool is operating on tiles (active layer is tile) vs entities
  const activeLayer = state.layers.find((l) => l.id === state.activeLayerId);
  const isTileSelectMode =
    state.selectedTool === "select" && activeLayer?.kind === "tile";

  // Resize observer
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setCanvasSize({
          width: Math.floor(width * window.devicePixelRatio),
          height: Math.floor(height * window.devicePixelRatio)
        });
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // --- Renderer init / dispose ---
  useEffect(() => {
    const canvas = webglCanvasRef.current;
    if (!canvas) return;

    const r = new LevelEditorRenderer();
    rendererRef.current = r;
    (window as any).__editorRenderer = r;

    r.init(canvas, () => setImageLoadCount((c) => c + 1))
      .then(() => {
        if (rendererRef.current === r) setLevelReady(true);
      })
      .catch((e) => {
        console.warn("[LevelEditor] Failed to init WebGL preview:", e);
      });

    return () => {
      r.dispose();
      if (rendererRef.current === r) {
        rendererRef.current = null;
      }
      setLevelReady(false);
    };
  }, []);

  // --- Sync editor entities → Level (entity sprite previews) ---
  useEffect(() => {
    rendererRef.current?.syncEntities(state.layers);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.layers, levelReady]);

  // --- Sync map background color → canvas clear color + grid contrast ---
  useEffect(() => {
    rendererRef.current?.setBackgroundColor(state.backgroundColor);
  }, [state.backgroundColor, levelReady]);

  // --- Dim entity sprites on inactive layers (highlight mode) ---
  useEffect(() => {
    rendererRef.current?.applySpriteDimming(
      state.layers,
      state.activeLayerId,
      state.highlightActiveLayer
    );
  }, [
    state.layers,
    state.activeLayerId,
    state.highlightActiveLayer,
    levelReady
  ]);

  // --- Placement ghost follows the selected entity type ---
  useEffect(() => {
    if (!levelReady) return;
    const type =
      state.selectedTool === "entity" ? state.selectedEntityType : null;
    rendererRef.current?.setPlacementGhost(
      type,
      type ? getDefaultEntityProperties(type) : undefined
    );
  }, [state.selectedTool, state.selectedEntityType, levelReady]);

  // --- Live mode toggle ---
  useEffect(() => {
    const r = rendererRef.current;
    if (!r || !levelReady) return;
    r.setLiveMode(state.liveMode);
    // Sync terrain (adds on live=true, removes on live=false)
    r.syncTerrainEntities(state);
    // After setLiveMode(false), spawned is cleared — trigger entity re-sync
    if (!state.liveMode) {
      r.syncEntities(state.layers);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.liveMode, levelReady]);

  // --- Rebuild terrain entities when tiles change in live mode ---
  useEffect(() => {
    const r = rendererRef.current;
    if (!r || !levelReady || !state.liveMode) return;
    r.syncTerrainEntities(state);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.layers, levelReady]);

  // Memoize tileset metadata for tile rendering
  const tilesetMeta = useMemo(() => {
    const meta = new Map<
      string,
      {
        columns: number;
        tileWidth: number;
        tileHeight: number;
        tilecount: number;
      }
    >();
    for (const [name, ts] of Object.entries(allTilesets)) {
      meta.set(name, {
        columns: ts.tileSetJson.columns,
        tileWidth: ts.tileSetJson.tilewidth,
        tileHeight: ts.tileSetJson.tileheight,
        tilecount: ts.tileSetJson.tilecount
      });
    }
    if (state.externalTilesets) {
      for (const [name, ts] of Object.entries(state.externalTilesets)) {
        if (!meta.has(name)) {
          meta.set(name, {
            columns: ts.tileSetJson.columns,
            tileWidth: ts.tileSetJson.tilewidth,
            tileHeight: ts.tileSetJson.tileheight,
            tilecount: ts.tileSetJson.tilecount
          });
        }
      }
    }
    return meta;
  }, [state.externalTilesets]);

  // --- Sync tile layers ---
  useEffect(() => {
    rendererRef.current?.syncTileLayers(
      state.layers,
      state.activeLayerId,
      state.highlightActiveLayer,
      tilesetTextures,
      tilesetMeta
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    state.layers,
    state.activeLayerId,
    state.highlightActiveLayer,
    tilesetTextures,
    tilesetMeta,
    tilesetLoadCount,
    levelReady
  ]);

  // --- Sync image layers ---
  useEffect(() => {
    rendererRef.current?.syncImageLayers(
      state.layers,
      state.activeLayerId,
      state.highlightActiveLayer
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    state.layers,
    state.activeLayerId,
    state.highlightActiveLayer,
    imageLoadCount,
    levelReady
  ]);

  // --- Sync entity overlays ---
  useEffect(() => {
    rendererRef.current?.syncEntityOverlays(
      state.layers,
      state.activeLayerId,
      state.highlightActiveLayer,
      new Set(state.selectedEntityIds),
      state.camera.zoom,
      selectedPolyPoint,
      sessionCloseTarget,
      sessionHotPoint
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    state.layers,
    state.activeLayerId,
    state.highlightActiveLayer,
    state.selectedEntityIds,
    state.camera.zoom,
    selectedPolyPoint,
    sessionCloseTarget,
    sessionHotPoint,
    levelReady
  ]);

  // --- Reference arrows: only for refs with a selected endpoint, plus the
  // transient one the picker and a hovered properties-panel chip draw ---
  useEffect(() => {
    const r = rendererRef.current;
    if (!r || !levelReady) return;
    const selected = new Set(state.selectedEntityIds);
    const links: RefArrowLink[] = [];
    for (const link of collectEntityRefLinks(state.layers)) {
      const isOutgoing = selected.has(link.from.id);
      if (!isOutgoing && !selected.has(link.to.id)) continue;
      links.push({ from: link.from, to: link.to, dimmed: !isOutgoing });
    }
    const pickSource = state.entityRefPick
      ? findEntityInLayers(state.layers, state.entityRefPick.entityId)
      : null;
    const pickHovered = pickHoverEntityId
      ? findEntityInLayers(state.layers, pickHoverEntityId)
      : null;
    if (pickSource && pickHovered) {
      links.push({ from: pickSource, to: pickHovered, dimmed: false });
    }
    const chipHovered = state.entityRefHoverEntityId
      ? findEntityInLayers(state.layers, state.entityRefHoverEntityId)
      : null;
    r.syncRefArrows(links, chipHovered ?? pickHovered);
  }, [
    state.layers,
    state.selectedEntityIds,
    state.entityRefPick,
    state.entityRefHoverEntityId,
    pickHoverEntityId,
    levelReady
  ]);

  useEffect(() => {
    if (!state.entityRefPick) setPickHoverEntityId(null);
  }, [state.entityRefPick]);

  // --- Render loop ---
  useEffect(() => {
    const r = rendererRef.current;
    if (!r || !levelReady) return;

    r.startRenderLoop(() => {
      const st = stateRef.current;
      const mt = mouseTileRef.current;
      let previewTiles:
        | { dx: number; dy: number; tile: TilePlacement }[]
        | null = null;
      const brushReady = st.selectedTileId !== null || !!st.capturedBrush;
      if (
        mt &&
        brushReady &&
        (st.selectedTool === "paint" || st.selectedTool === "fill")
      ) {
        const lineAnchor = lineAnchorRef.current;
        const key =
          st.selectedTool === "fill"
            ? `fill|${mt.x},${mt.y}`
            : `paint|${mt.x},${mt.y}|${
                lineAnchor ? `${lineAnchor.x},${lineAnchor.y}` : ""
              }`;
        const cache = previewCacheRef.current;
        if (cache && cache.state === st && cache.key === key) {
          previewTiles = cache.tiles;
        } else {
          previewTiles = getCurrentTileStampRef.current();
          if (previewTiles) {
            if (st.selectedTool === "fill") {
              const layer = st.layers.find((l) => l.id === st.activeLayerId);
              if (layer?.kind === "tile") {
                const cells = computeFillCells(layer.tiles, mt.x, mt.y);
                if (cells) {
                  const lookup = patternLookup(previewTiles);
                  const filled: TileStamp[] = [];
                  for (const c of cells) {
                    const tile = lookup(c.x - mt.x, c.y - mt.y);
                    if (tile) {
                      filled.push({ dx: c.x - mt.x, dy: c.y - mt.y, tile });
                    }
                  }
                  previewTiles = filled;
                } else {
                  previewTiles = null;
                }
              } else {
                previewTiles = null;
              }
            } else if (lineAnchor) {
              previewTiles = stampsAlongLine(
                lineAnchor,
                { x: mt.x, y: mt.y },
                previewTiles
              );
            }
          }
          previewCacheRef.current = { state: st, key, tiles: previewTiles };
        }
      }
      return {
        camera: cameraRef.current,
        canvasSize: canvasSizeRef.current,
        state: st,
        mouseTile: mt,
        tileDragOffset: isDraggingTilesRef.current
          ? tileDragOffsetRef.current
          : undefined,
        previewTiles,
        polylinePreview: sessionPreviewRef.current,
        ghostPosition:
          st.selectedTool === "entity" && !st.liveMode
            ? ghostTileRef.current
            : null
      };
    });

    return () => r.stopRenderLoop();
  }, [levelReady]);

  // --- Screen coordinate helpers ---

  const screenToTile = useCallback(
    (screenX: number, screenY: number) => {
      const canvas = webglCanvasRef.current;
      if (!canvas) return { tileX: 0, tileY: 0 };

      const rect = canvas.getBoundingClientRect();
      const pixelX = (screenX - rect.left) * window.devicePixelRatio;
      const pixelY = (screenY - rect.top) * window.devicePixelRatio;

      let { tileX: worldX, tileY: worldY } = canvasPixelToTile(
        pixelX,
        pixelY,
        state.camera,
        canvasSize
      );

      // Compensate for parallax offset on the active layer so painting hits the
      // correct data coordinate rather than the visually-shifted position.
      const activeLayer = state.layers.find(
        (l) => l.id === state.activeLayerId
      );
      if (
        activeLayer &&
        (activeLayer.kind === "tile" || activeLayer.kind === "image")
      ) {
        const px = (activeLayer as { parallaxx?: number }).parallaxx;
        const py = (activeLayer as { parallaxy?: number }).parallaxy;
        if (px !== undefined && px !== 1) {
          worldX -= (1 - px) * state.camera.x;
        }
        if (py !== undefined && py !== 1) {
          worldY -= (1 - py) * state.camera.y;
        }
      }

      return {
        tileX: Math.floor(worldX),
        tileY: Math.floor(worldY)
      };
    },
    [state.camera, canvasSize, state.layers, state.activeLayerId]
  );

  /** Like screenToTile but returns fractional tile coordinates for sub-tile precision. */
  const screenToTileExact = useCallback(
    (screenX: number, screenY: number) => {
      const canvas = webglCanvasRef.current;
      if (!canvas) return { tileX: 0, tileY: 0 };

      const rect = canvas.getBoundingClientRect();
      const pixelX = (screenX - rect.left) * window.devicePixelRatio;
      const pixelY = (screenY - rect.top) * window.devicePixelRatio;

      return canvasPixelToTile(pixelX, pixelY, state.camera, canvasSize);
    },
    [state.camera, canvasSize]
  );

  const screenToCanvasPixel = useCallback(
    (screenX: number, screenY: number) => {
      const canvas = webglCanvasRef.current;
      if (!canvas) return { px: 0, py: 0 };
      const rect = canvas.getBoundingClientRect();
      return {
        px: (screenX - rect.left) * window.devicePixelRatio,
        py: (screenY - rect.top) * window.devicePixelRatio
      };
    },
    []
  );

  const hitTestEntity = useCallback(
    (
      screenX: number,
      screenY: number,
      excludeEntityId?: string
    ): string | null => {
      const { px, py } = screenToCanvasPixel(screenX, screenY);
      const zoom = state.camera.zoom;
      const tilePixels = TILE_SIZE * zoom;
      const offsetX = canvasSize.width / 2 - state.camera.x * tilePixels;
      const offsetY = canvasSize.height / 2 - state.camera.y * tilePixels;

      for (let li = state.layers.length - 1; li >= 0; li--) {
        const layer = state.layers[li];
        if (layer.kind !== "entity" || !layer.visible) continue;
        for (let i = layer.entities.length - 1; i >= 0; i--) {
          const entity = layer.entities[i];
          if (entity.id === excludeEntityId) continue;
          const points = entity.polyline || entity.polygon;
          if (points && points.length > 0) {
            // Hit-test polyline/polygon entities: check proximity to line segments
            const originX = entity.tileX * tilePixels + offsetX;
            const originY = entity.tileY * tilePixels + offsetY;
            const hitDist = Math.max(8, 6 * zoom);
            for (let j = 0; j < points.length; j++) {
              const nextJ = (j + 1) % points.length;
              if (!entity.polygon && nextJ === 0 && j > 0) break; // open polyline: don't check closing segment
              const ax = originX + (points[j].x / TILE_SIZE) * tilePixels;
              const ay = originY + (points[j].y / TILE_SIZE) * tilePixels;
              const bx = originX + (points[nextJ].x / TILE_SIZE) * tilePixels;
              const by = originY + (points[nextJ].y / TILE_SIZE) * tilePixels;
              const dist = distToSegment(px, py, ax, ay, bx, by);
              if (dist <= hitDist) return entity.id;
            }
            // Also check proximity to individual points (for single-point entities)
            for (const pt of points) {
              const ptX = originX + (pt.x / TILE_SIZE) * tilePixels;
              const ptY = originY + (pt.y / TILE_SIZE) * tilePixels;
              const dx = px - ptX;
              const dy = py - ptY;
              if (dx * dx + dy * dy <= hitDist * hitDist) return entity.id;
            }
          } else {
            const rect = getEntityScreenRect(
              entity,
              tilePixels,
              offsetX,
              offsetY
            );
            if (pointInEntity(px, py, rect, entity.angle ?? 0)) {
              return entity.id;
            }
          }
        }
      }
      return null;
    },
    [state.layers, state.camera, canvasSize, screenToCanvasPixel]
  );

  /** Hit-test polyline/polygon control points for a selected entity.
   *  Returns the point index or -1 if no point was hit. */
  const hitTestPolylinePoint = useCallback(
    (screenX: number, screenY: number, entity: EntityPlacement): number => {
      const points = entity.polyline || entity.polygon;
      if (!points || points.length === 0) return -1;

      const { px, py } = screenToCanvasPixel(screenX, screenY);
      const zoom = state.camera.zoom;
      const tilePixels = TILE_SIZE * zoom;
      const offX = canvasSize.width / 2 - state.camera.x * tilePixels;
      const offY = canvasSize.height / 2 - state.camera.y * tilePixels;

      // Entity origin in screen space (polyline entities use tileX/Y directly as pixel origin)
      const originScreenX = entity.tileX * tilePixels + offX;
      const originScreenY = entity.tileY * tilePixels + offY;

      const hitRadius = Math.max(8, 6 * zoom); // pixels

      for (let i = 0; i < points.length; i++) {
        const ptScreenX =
          originScreenX + (points[i].x / TILE_SIZE) * tilePixels;
        const ptScreenY =
          originScreenY + (points[i].y / TILE_SIZE) * tilePixels;
        const dx = px - ptScreenX;
        const dy = py - ptScreenY;
        if (dx * dx + dy * dy <= hitRadius * hitRadius) {
          return i;
        }
      }
      return -1;
    },
    [state.camera, canvasSize, screenToCanvasPixel]
  );

  // --- Polyline session helpers ---

  /** Convert a screen position to Tiled pixels relative to the session origin. */
  const sessionPointAt = useCallback(
    (screenX: number, screenY: number) => {
      const s = polylineSessionRef.current!;
      const exact = screenToTileExact(screenX, screenY);
      let dx = (exact.tileX - s.origin.tileX) * TILE_SIZE;
      let dy = (exact.tileY - s.origin.tileY) * TILE_SIZE;
      if (state.snapEnabled) {
        dx = snapToGrid(dx, SNAP_PX);
        dy = snapToGrid(dy, SNAP_PX);
      }
      return { x: dx, y: dy };
    },
    [screenToTileExact, state.snapEnabled]
  );

  /** Write the committed points to the store entity and refresh the
   *  emphasized cursor / close-target dots. */
  const syncSessionToStore = useCallback(() => {
    const s = polylineSessionRef.current;
    if (!s) return;
    levelEditorStore.updateEntityPolyline(
      s.entityId,
      [...s.committed],
      s.closed
    );

    setSelectedPolyPoint({
      entityId: s.entityId,
      pointIndex: s.cursorIndex
    });
    if (isEndpointSession(s) && s.committed.length >= 3) {
      setSessionCloseTarget({
        entityId: s.entityId,
        pointIndex: sessionCloseStoreIndex(s)
      });
    } else {
      setSessionCloseTarget(null);
    }
  }, []);

  /** Finish (optionally closing the shape) or cancel the active session. */
  const endPolylineSession = useCallback(
    (options: { cancel?: boolean; close?: boolean } = {}) => {
      const s = polylineSessionRef.current;
      if (!s) return;
      polylineSessionRef.current = null;
      sessionPreviewRef.current = null;
      setSessionHotPoint(null);
      sessionEndedAtRef.current = performance.now();
      selectedPolyPointEntityIdRef.current = null;
      selectedPolyPointIndexRef.current = -1;
      setSelectedPolyPoint(null);
      setSessionCloseTarget(null);
      const tooFewPoints = s.committed.length < (s.closed ? 3 : 2);
      if (options.cancel || tooFewPoints) {
        levelEditorStore.cancelToLastUndoPoint();
        return;
      }
      levelEditorStore.updateEntityPolyline(
        s.entityId,
        s.committed,
        options.close ? true : s.closed
      );
      if (s.mode === "create") {
        levelEditorStore.selectTool("select");
      }
      levelEditorStore.selectEntity(s.entityId);
    },
    []
  );

  /** Ctrl+Z during a session: remove the last point placed this session;
   *  popping the final one cancels the whole session. */
  const popSessionPoint = useCallback(() => {
    const s = polylineSessionRef.current;
    if (!s) return;
    if (s.placedCount === 0) {
      endPolylineSession({ cancel: true });
      return;
    }
    s.committed.splice(s.cursorIndex, 1);
    if (s.insertAfter) s.cursorIndex--;
    s.placedCount--;
    if (s.committed.length === 0) {
      endPolylineSession({ cancel: true });
      return;
    }
    syncSessionToStore();
  }, [endPolylineSession, syncSessionToStore]);

  /** Which interactive session point (if any) is under the cursor. */
  const hitSessionSpecialPoint = useCallback(
    (clientX: number, clientY: number): "close" | "cursor" | null => {
      const s = polylineSessionRef.current;
      if (!s) return null;
      const { px, py } = screenToCanvasPixel(clientX, clientY);
      const zoom = state.camera.zoom;
      const tilePixels = TILE_SIZE * zoom;
      const offX = canvasSize.width / 2 - state.camera.x * tilePixels;
      const offY = canvasSize.height / 2 - state.camera.y * tilePixels;
      const originX = s.origin.tileX * tilePixels + offX;
      const originY = s.origin.tileY * tilePixels + offY;
      const hitRadius = Math.max(8, 6 * zoom);
      const hitsPoint = (pt: { x: number; y: number }) => {
        const sx = originX + (pt.x / TILE_SIZE) * tilePixels;
        const sy = originY + (pt.y / TILE_SIZE) * tilePixels;
        const ddx = px - sx;
        const ddy = py - sy;
        return ddx * ddx + ddy * ddy <= hitRadius * hitRadius;
      };

      if (isEndpointSession(s) && s.committed.length >= 3) {
        const closeTarget = s.insertAfter
          ? s.committed[0]
          : s.committed[s.committed.length - 1];
        if (hitsPoint(closeTarget)) return "close";
      }
      const cursorPoint = s.committed[s.cursorIndex];
      if (cursorPoint && hitsPoint(cursorPoint)) return "cursor";
      return null;
    },
    [state.camera, canvasSize, screenToCanvasPixel]
  );

  /** Handle a left click while a session is active: finish on the cursor
   *  point, close on the opposite endpoint, otherwise place a point. */
  const handleSessionClick = useCallback(
    (e: React.MouseEvent) => {
      const s = polylineSessionRef.current;
      if (!s) return;

      const special = hitSessionSpecialPoint(e.clientX, e.clientY);
      if (special === "close") {
        endPolylineSession({ close: true });
        return;
      }
      if (special === "cursor") {
        if (s.committed.length >= (s.closed ? 3 : 2)) {
          endPolylineSession();
        }
        return;
      }

      const point = sessionPointAt(e.clientX, e.clientY);
      const insertionIndex = s.insertAfter ? s.cursorIndex + 1 : s.cursorIndex;
      s.committed.splice(insertionIndex, 0, point);
      if (s.insertAfter) s.cursorIndex = insertionIndex;
      s.placedCount++;
      syncSessionToStore();
    },
    [
      hitSessionSpecialPoint,
      sessionPointAt,
      syncSessionToStore,
      endPolylineSession
    ]
  );

  /** Build the stamp pattern for the current tile/region selection, applying flip flags. */
  const getCurrentTileStamp = useCallback(
    (): TileStamp[] | null => currentBrushStamps(state),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      state.capturedBrush,
      state.selectedTileId,
      state.selectedTileRegion,
      state.selectedTilesetName,
      state.flipH,
      state.flipV,
      state.flipD
    ]
  );

  getCurrentTileStampRef.current = getCurrentTileStamp;

  const applyToolAt = useCallback(
    (tileX: number, tileY: number, tool: EditorTool) => {
      const key = `${tileX},${tileY}`;

      if (tool === "paint") {
        const stamps = getCurrentTileStamp();
        if (!stamps) return;
        // Track by mouse tile position to prevent re-stamping during drag
        if (strokeTilesRef.current.has(key)) return;
        strokeTilesRef.current.add(key);
        if (stamps.length === 1 && stamps[0].dx === 0 && stamps[0].dy === 0) {
          levelEditorStore.paintTile(
            state.activeLayerId,
            tileX,
            tileY,
            stamps[0].tile
          );
        } else {
          const tiles = stamps.map((s) => ({
            tileX: tileX + s.dx,
            tileY: tileY + s.dy,
            tile: s.tile
          }));
          levelEditorStore.paintTiles(state.activeLayerId, tiles);
        }
      } else if (tool === "erase") {
        if (strokeTilesRef.current.has(key)) return;
        strokeTilesRef.current.add(key);
        levelEditorStore.eraseTile(state.activeLayerId, tileX, tileY);
      } else if (tool === "entity") {
        if (!state.selectedEntityType) return;
        levelEditorStore.addEntity({
          type: state.selectedEntityType,
          tileX,
          tileY,
          id: levelEditorStore.mintEditorId(),
          properties: getDefaultEntityProperties(state.selectedEntityType)
        });
      }
    },
    [state.activeLayerId, state.selectedEntityType, getCurrentTileStamp]
  );

  /** Stamp the brush along a straight line of tiles as one undo step. */
  const paintLine = useCallback(
    (from: { x: number; y: number }, to: { x: number; y: number }) => {
      const stamps = getCurrentTileStamp();
      if (!stamps) return;
      levelEditorStore.pushUndo();
      const byCell = new Map<
        string,
        { tileX: number; tileY: number; tile: TilePlacement }
      >();
      for (const p of lineTiles(from, to)) {
        for (const s of stamps) {
          const tileX = p.x + s.dx;
          const tileY = p.y + s.dy;
          byCell.set(`${tileX},${tileY}`, { tileX, tileY, tile: s.tile });
        }
      }
      levelEditorStore.paintTiles(state.activeLayerId, [...byCell.values()]);
    },
    [getCurrentTileStamp, state.activeLayerId]
  );

  /** Bucket-fill the connected region under (tileX, tileY) with the brush
   *  pattern, tiled periodically from the click point. */
  const doFillAt = useCallback(
    (tileX: number, tileY: number) => {
      const stamps = getCurrentTileStamp();
      if (!stamps) return;
      const layer = state.layers.find((l) => l.id === state.activeLayerId);
      if (!layer || layer.kind !== "tile") return;
      const cells = computeFillCells(layer.tiles, tileX, tileY);
      if (!cells || cells.length === 0) return;
      const lookup = patternLookup(stamps);
      const tiles: { tileX: number; tileY: number; tile: TilePlacement }[] = [];
      for (const c of cells) {
        const tile = lookup(c.x - tileX, c.y - tileY);
        if (tile) tiles.push({ tileX: c.x, tileY: c.y, tile });
      }
      if (tiles.length === 0) return;
      levelEditorStore.pushUndo();
      levelEditorStore.paintTiles(state.activeLayerId, tiles);
    },
    [getCurrentTileStamp, state.layers, state.activeLayerId]
  );

  // --- Mouse handlers ---

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // Picking an entityRef target overlays the active tool: it claims the
      // plain left click (choose) and the right click (cancel), leaving the
      // pan and zoom bindings live.
      const refPick = state.entityRefPick;
      if (refPick && (e.button === 2 || (e.button === 0 && !e.ctrlKey))) {
        e.preventDefault();
        if (e.button === 2) {
          levelEditorStore.setEntityRefPick(null);
          return;
        }
        const targetId = hitTestEntity(e.clientX, e.clientY, refPick.entityId);
        // Clicking empty space stays in pick mode.
        if (!targetId) return;
        // The ref stores the placement id, not the Tiled object id, so the
        // link survives any object id repair or renumbering.
        levelEditorStore.pushUndo();
        levelEditorStore.updateEntityProperties(refPick.entityId, {
          [refPick.propName]: targetId
        });
        levelEditorStore.setEntityRefPick(null);
        return;
      }

      // Right-drag under paint/erase selects a rectangle (Tiled-style brush
      // capture / rect erase); middle mouse and Ctrl+Left still pan everywhere.
      if (
        e.button === 2 &&
        (state.selectedTool === "paint" || state.selectedTool === "erase")
      ) {
        const { px, py } = screenToCanvasPixel(e.clientX, e.clientY);
        marqueeToolRef.current = state.selectedTool;
        boxSelectStartRef.current = { x: px, y: py };
        boxSelectEndRef.current = { x: px, y: py };
        setBoxSelectRect(null);
        e.preventDefault();
        return;
      }

      if (e.button === 1 || e.button === 2 || (e.button === 0 && e.ctrlKey)) {
        isPanningRef.current = true;
        panStartRef.current = { x: e.clientX, y: e.clientY };
        cameraStartRef.current = { x: state.camera.x, y: state.camera.y };
        setCursor("grabbing");
        e.preventDefault();
        return;
      }

      if (e.button === 0) {
        // An active polyline session swallows clicks for point placement.
        if (polylineSessionRef.current) {
          handleSessionClick(e);
          e.preventDefault();
          return;
        }

        const { tileX, tileY } = screenToTile(e.clientX, e.clientY);

        if (state.selectedTool === "paint" || state.selectedTool === "erase") {
          // Shift draws straight lines: the first click anchors, the next
          // click (or drag release) confirms, and the endpoint chains as the
          // new anchor while shift stays held.
          if (state.selectedTool === "paint" && e.shiftKey) {
            const anchor = lineAnchorRef.current;
            if (anchor && (anchor.x !== tileX || anchor.y !== tileY)) {
              paintLine(anchor, { x: tileX, y: tileY });
            }
            lineAnchorRef.current = { x: tileX, y: tileY };
            lineButtonDownRef.current = true;
            return;
          }
          lineAnchorRef.current = null;
          if (!undoPushedRef.current) {
            levelEditorStore.pushUndo();
            undoPushedRef.current = true;
          }
          isPaintingRef.current = true;
          strokeTilesRef.current.clear();
          applyToolAt(tileX, tileY, state.selectedTool);
        } else if (state.selectedTool === "fill") {
          doFillAt(tileX, tileY);
        } else if (state.selectedTool === "entity") {
          levelEditorStore.pushUndo();
          if (state.snapEnabled) {
            const exact = screenToTileExact(e.clientX, e.clientY);
            applyToolAt(
              snapToGrid(exact.tileX, SNAP_GRID),
              snapToGrid(exact.tileY, SNAP_GRID),
              "entity"
            );
          } else {
            const exact = screenToTileExact(e.clientX, e.clientY);
            applyToolAt(exact.tileX, exact.tileY, "entity");
          }
        } else if (state.selectedTool === "polyline") {
          if (!state.selectedEntityType) return;
          const exact = screenToTileExact(e.clientX, e.clientY);
          const snappedExact = state.snapEnabled
            ? {
                tileX: snapToGrid(exact.tileX, SNAP_GRID),
                tileY: snapToGrid(exact.tileY, SNAP_GRID)
              }
            : exact;

          // First click creates the entity and starts a session; later clicks
          // are handled by handleSessionClick above.
          levelEditorStore.pushUndo();
          const entityId = levelEditorStore.mintEditorId();
          const entity: EntityPlacement = {
            type: state.selectedEntityType,
            tileX: snappedExact.tileX,
            tileY: snappedExact.tileY,
            id: entityId,
            properties: getDefaultEntityProperties(state.selectedEntityType)
          };
          levelEditorStore.addEntity(entity);
          polylineSessionRef.current = {
            entityId,
            mode: "create",
            closed: false,
            committed: [{ x: 0, y: 0 }],
            cursorIndex: 0,
            insertAfter: true,
            placedCount: 1,
            origin: { tileX: snappedExact.tileX, tileY: snappedExact.tileY }
          };
          levelEditorStore.selectEntity(entityId);
          syncSessionToStore();
        } else if (state.selectedTool === "select") {
          if (isTileSelectMode) {
            // --- Tile selection mode ---
            const key = `${tileX},${tileY}`;
            const clickedOnSelected = state.selectedTileKeys.includes(key);
            const tileLayer = state.layers.find(
              (l) => l.id === state.activeLayerId && l.kind === "tile"
            );
            const tileExists = !!(
              tileLayer &&
              tileLayer.kind === "tile" &&
              tileLayer.tiles.has(key)
            );

            if (clickedOnSelected && !e.shiftKey) {
              // Start dragging selected tiles
              isDraggingTilesRef.current = true;
              tileDragStartRef.current = { x: tileX, y: tileY };
              tileDragOffsetRef.current = { dx: 0, dy: 0 };
              pendingDragUndoRef.current = true;
              setCursor("move");
            } else {
              // Could be click-to-select OR start of box-select — defer to mouseup
              const { px, py } = screenToCanvasPixel(e.clientX, e.clientY);
              isBoxSelectingRef.current = true;
              boxSelectStartRef.current = { x: px, y: py };
              boxSelectEndRef.current = { x: px, y: py };
              setBoxSelectRect(null);
              pendingTileClickRef.current = {
                key,
                tileExists,
                shiftKey: e.shiftKey
              };
            }
          } else {
            // --- Entity selection mode ---
            // Clear any previously selected polyline point
            selectedPolyPointEntityIdRef.current = null;
            selectedPolyPointIndexRef.current = -1;
            setSelectedPolyPoint(null);
            // Check polyline point drag on single-selected entity
            if (state.selectedEntityIds.length === 1) {
              const selectedEntity = findEntityInLayers(
                state.layers,
                state.selectedEntityIds[0]
              );
              if (selectedEntity) {
                const points =
                  selectedEntity.polyline || selectedEntity.polygon;
                if (points && points.length > 0) {
                  const ptIdx = hitTestPolylinePoint(
                    e.clientX,
                    e.clientY,
                    selectedEntity
                  );
                  if (ptIdx >= 0) {
                    isDraggingPolyPointRef.current = true;
                    polyPointEntityIdRef.current = selectedEntity.id;
                    polyPointIndexRef.current = ptIdx;
                    selectedPolyPointEntityIdRef.current = selectedEntity.id;
                    selectedPolyPointIndexRef.current = ptIdx;
                    setSelectedPolyPoint({
                      entityId: selectedEntity.id,
                      pointIndex: ptIdx
                    });
                    polyPointStartScreenRef.current = {
                      x: e.clientX,
                      y: e.clientY
                    };
                    polyPointStartValueRef.current = {
                      x: points[ptIdx].x,
                      y: points[ptIdx].y
                    };
                    pendingDragUndoRef.current = true;
                    setCursor("move");
                    e.preventDefault();
                    return;
                  }
                }
              }
            }
            // Check resize/rotate handles on single-selected entity
            if (state.selectedEntityIds.length === 1) {
              const selectedEntity = findEntityInLayers(
                state.layers,
                state.selectedEntityIds[0]
              );
              if (selectedEntity) {
                const { px, py } = screenToCanvasPixel(e.clientX, e.clientY);
                const zoom = state.camera.zoom;
                const tilePixels = TILE_SIZE * zoom;
                const offX = canvasSize.width / 2 - state.camera.x * tilePixels;
                const offY =
                  canvasSize.height / 2 - state.camera.y * tilePixels;
                const rect = getEntityScreenRect(
                  selectedEntity,
                  tilePixels,
                  offX,
                  offY
                );
                const entityAngle = selectedEntity.angle ?? 0;

                if (hitTestRotationHandle(px, py, rect, entityAngle)) {
                  isRotatingRef.current = true;
                  rotateEntityIdRef.current = selectedEntity.id;
                  rotateCenterRef.current = { px: rect.cx, py: rect.cy };
                  rotateStartAngleRef.current = entityAngle;
                  pendingDragUndoRef.current = true;
                  setCursor("crosshair");
                  e.preventDefault();
                  return;
                }

                const handle = hitTestResizeHandle(px, py, rect, entityAngle);
                if (handle) {
                  const size = getEntityPixelSize(selectedEntity);
                  isResizingRef.current = true;
                  resizeHandleRef.current = handle;
                  resizeEntityIdRef.current = selectedEntity.id;
                  resizeStartRef.current = {
                    width: size.width,
                    height: size.height,
                    screenX: e.clientX,
                    screenY: e.clientY,
                    tileX: selectedEntity.tileX,
                    tileY: selectedEntity.tileY
                  };
                  pendingDragUndoRef.current = true;
                  e.preventDefault();
                  return;
                }
              }
            }

            const entityId = hitTestEntity(e.clientX, e.clientY);

            if (e.shiftKey && entityId) {
              // Shift+click: toggle entity in selection
              levelEditorStore.toggleEntitySelection(entityId);
            } else if (entityId) {
              // If clicking an already-selected entity in a multi-select, start drag
              const alreadySelected =
                state.selectedEntityIds.includes(entityId);
              if (!alreadySelected) {
                levelEditorStore.selectEntity(entityId);
              }

              // Switch active layer to the one containing the clicked entity
              for (const layer of state.layers) {
                if (
                  layer.kind === "entity" &&
                  layer.entities.some((ent) => ent.id === entityId)
                ) {
                  if (layer.id !== state.activeLayerId) {
                    levelEditorStore.setActiveLayer(layer.id);
                  }
                  break;
                }
              }

              const entity = findEntityInLayers(state.layers, entityId);
              if (entity) {
                if (e.altKey) {
                  // Alt+click: start rotation (single entity only)
                  const zoom = state.camera.zoom;
                  const tilePixels = TILE_SIZE * zoom;
                  const offX =
                    canvasSize.width / 2 - state.camera.x * tilePixels;
                  const offY =
                    canvasSize.height / 2 - state.camera.y * tilePixels;
                  const center = getEntityCenterPixel(
                    entity,
                    tilePixels,
                    offX,
                    offY
                  );
                  isRotatingRef.current = true;
                  rotateEntityIdRef.current = entityId;
                  rotateCenterRef.current = { px: center.cx, py: center.cy };
                  rotateStartAngleRef.current = entity.angle ?? 0;
                  pendingDragUndoRef.current = true;
                  setCursor("crosshair");
                } else {
                  // Start dragging — either single or multi
                  const selectedIds = alreadySelected
                    ? state.selectedEntityIds
                    : [entityId];
                  if (selectedIds.length > 1) {
                    // Multi-drag
                    isDraggingMultiRef.current = true;
                    multiDragStartTileRef.current = { x: tileX, y: tileY };
                    const exactStart = screenToTileExact(e.clientX, e.clientY);
                    dragStartExactRef.current = {
                      x: exactStart.tileX,
                      y: exactStart.tileY
                    };
                    multiDragStartPositionsRef.current = selectedIds.map(
                      (id) => {
                        const ent = findEntityInLayers(state.layers, id)!;
                        return { id, tileX: ent.tileX, tileY: ent.tileY };
                      }
                    );
                    pendingDragUndoRef.current = true;
                    setCursor("move");
                  } else {
                    isDraggingEntityRef.current = true;
                    dragEntityIdRef.current = entityId;
                    dragStartTileRef.current = { x: tileX, y: tileY };
                    const exactStart = screenToTileExact(e.clientX, e.clientY);
                    dragStartExactRef.current = {
                      x: exactStart.tileX,
                      y: exactStart.tileY
                    };
                    dragEntityStartRef.current = {
                      x: entity.tileX,
                      y: entity.tileY
                    };
                    pendingDragUndoRef.current = true;
                    setCursor("move");
                  }
                }
              }
            } else {
              // Clicked empty space — start box select for entities
              if (!e.shiftKey) {
                levelEditorStore.selectEntity(null);
              }
              const { px, py } = screenToCanvasPixel(e.clientX, e.clientY);
              isBoxSelectingRef.current = true;
              boxSelectStartRef.current = { x: px, y: py };
              boxSelectEndRef.current = { x: px, y: py };
              setBoxSelectRect(null);
            }
          }
        }
      }
    },
    [
      state.camera,
      state.selectedTool,
      state.selectedEntityIds,
      state.selectedTileKeys,
      state.activeLayerId,
      state.layers,
      state.selectedEntityType,
      state.snapEnabled,
      state.entityRefPick,
      isTileSelectMode,
      canvasSize,
      screenToTile,
      screenToTileExact,
      screenToCanvasPixel,
      hitTestEntity,
      hitTestPolylinePoint,
      handleSessionClick,
      syncSessionToStore,
      applyToolAt,
      paintLine,
      doFillAt
    ]
  );

  /** Take the deferred drag undo snapshot on the first actual movement. */
  const consumePendingDragUndo = () => {
    if (pendingDragUndoRef.current) {
      pendingDragUndoRef.current = false;
      levelEditorStore.pushUndo();
    }
  };

  const onMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const { tileX, tileY } = screenToTile(e.clientX, e.clientY);
      setMouseTile({ x: tileX, y: tileY });

      {
        const exact = screenToTileExact(e.clientX, e.clientY);
        presencePublisher.setCursor(exact.tileX, exact.tileY);
      }

      if (state.selectedTool === "entity" && state.selectedEntityType) {
        const exact = screenToTileExact(e.clientX, e.clientY);
        ghostTileRef.current = state.snapEnabled
          ? {
              tileX: snapToGrid(exact.tileX, SNAP_GRID),
              tileY: snapToGrid(exact.tileY, SNAP_GRID)
            }
          : exact;
      } else {
        ghostTileRef.current = null;
      }

      if (isPanningRef.current) {
        const dx =
          (e.clientX - panStartRef.current.x) * window.devicePixelRatio;
        const dy =
          (e.clientY - panStartRef.current.y) * window.devicePixelRatio;
        levelEditorStore.setCamera({
          x: cameraStartRef.current.x - dx / (state.camera.zoom * TILE_SIZE),
          y: cameraStartRef.current.y - dy / (state.camera.zoom * TILE_SIZE)
        });
        return;
      }

      if (state.entityRefPick) {
        const hovered = hitTestEntity(
          e.clientX,
          e.clientY,
          state.entityRefPick.entityId
        );
        setPickHoverEntityId((prev) => (prev === hovered ? prev : hovered));
        setCursor("crosshair");
        return;
      }

      // Active polyline session: rubber-band preview + throttled live update
      // of the real entity so sprite-rendered shapes track the cursor.
      const session = polylineSessionRef.current;
      if (session) {
        const point = sessionPointAt(e.clientX, e.clientY);
        const insertionIndex = session.insertAfter
          ? session.cursorIndex + 1
          : session.cursorIndex;
        const prev = session.committed[insertionIndex - 1];
        const next = session.closed
          ? session.committed[insertionIndex % session.committed.length]
          : session.committed[insertionIndex];
        const originPxX = session.origin.tileX * TILE_SIZE;
        const originPxY = session.origin.tileY * TILE_SIZE;
        const strip: { x: number; y: number }[] = [];
        if (prev) strip.push({ x: originPxX + prev.x, y: originPxY + prev.y });
        strip.push({ x: originPxX + point.x, y: originPxY + point.y });
        if (next) strip.push({ x: originPxX + next.x, y: originPxY + next.y });
        sessionPreviewRef.current = strip.length >= 2 ? strip : null;

        const special = hitSessionSpecialPoint(e.clientX, e.clientY);
        const hot = special
          ? {
              entityId: session.entityId,
              pointIndex:
                special === "close"
                  ? sessionCloseStoreIndex(session)
                  : session.cursorIndex
            }
          : null;
        setSessionHotPoint((prev) =>
          prev?.entityId === hot?.entityId &&
          prev?.pointIndex === hot?.pointIndex
            ? prev
            : hot
        );
        setCursor(special ? "pointer" : "crosshair");
        return;
      }

      if (isResizingRef.current && resizeEntityIdRef.current) {
        consumePendingDragUndo();
        const handle = resizeHandleRef.current!;
        const start = resizeStartRef.current;
        const dxScreen = (e.clientX - start.screenX) * window.devicePixelRatio;
        const dyScreen = (e.clientY - start.screenY) * window.devicePixelRatio;
        const dxPixels = dxScreen / state.camera.zoom;
        const dyPixels = dyScreen / state.camera.zoom;

        let newWidth = start.width;
        let newHeight = start.height;
        const snapPxSize = state.snapEnabled ? SNAP_PX : 1;

        if (handle === "se" || handle === "ne") {
          newWidth = Math.max(
            TILE_SIZE,
            Math.round((start.width + dxPixels) / snapPxSize) * snapPxSize
          );
        } else {
          newWidth = Math.max(
            TILE_SIZE,
            Math.round((start.width - dxPixels) / snapPxSize) * snapPxSize
          );
        }
        if (handle === "se" || handle === "sw") {
          newHeight = Math.max(
            TILE_SIZE,
            Math.round((start.height + dyPixels) / snapPxSize) * snapPxSize
          );
        } else {
          newHeight = Math.max(
            TILE_SIZE,
            Math.round((start.height - dyPixels) / snapPxSize) * snapPxSize
          );
        }

        const dw = newWidth - start.width;
        const dh = newHeight - start.height;

        // Compensate position so the opposite edge stays fixed.
        // Entity rendering is center-X anchored, bottom-Y anchored.
        let tileX = start.tileX;
        let tileY = start.tileY;

        // Horizontal: shift by half the width change to keep the opposite edge fixed
        if (handle === "se" || handle === "ne") {
          tileX = start.tileX + dw / (2 * TILE_SIZE);
        } else {
          tileX = start.tileX - dw / (2 * TILE_SIZE);
        }

        // Vertical: for bottom handles (se/sw), shift down to keep top edge fixed
        // For top handles (ne/nw), bottom anchor is natural — no shift needed
        if (handle === "se" || handle === "sw") {
          tileY = start.tileY + dh / TILE_SIZE;
        }

        levelEditorStore.resizeEntity(
          resizeEntityIdRef.current,
          newWidth,
          newHeight
        );
        levelEditorStore.moveEntity(resizeEntityIdRef.current, tileX, tileY);
        return;
      }

      if (isRotatingRef.current && rotateEntityIdRef.current) {
        consumePendingDragUndo();
        const { px, py } = screenToCanvasPixel(e.clientX, e.clientY);
        const center = rotateCenterRef.current;
        const dx = px - center.px;
        const dy = py - center.py;
        let angleDeg = Math.atan2(dx, -dy) * (180 / Math.PI);
        if (!e.shiftKey) {
          angleDeg = Math.round(angleDeg / 15) * 15;
        }
        angleDeg = ((angleDeg % 360) + 360) % 360;
        levelEditorStore.rotateEntity(rotateEntityIdRef.current, angleDeg);
        return;
      }

      if (isDraggingPolyPointRef.current && polyPointEntityIdRef.current) {
        consumePendingDragUndo();
        // Compute pixel delta in Tiled-space from screen movement
        const dxScreen =
          (e.clientX - polyPointStartScreenRef.current.x) *
          window.devicePixelRatio;
        const dyScreen =
          (e.clientY - polyPointStartScreenRef.current.y) *
          window.devicePixelRatio;
        const dxPixels = dxScreen / state.camera.zoom;
        const dyPixels = dyScreen / state.camera.zoom;
        let newX = polyPointStartValueRef.current.x + dxPixels;
        let newY = polyPointStartValueRef.current.y + dyPixels;
        if (state.snapEnabled) {
          newX = snapToGrid(newX, SNAP_PX);
          newY = snapToGrid(newY, SNAP_PX);
        }
        levelEditorStore.movePolylinePoint(
          polyPointEntityIdRef.current,
          polyPointIndexRef.current,
          newX,
          newY
        );
        return;
      }

      if (isDraggingEntityRef.current && dragEntityIdRef.current) {
        consumePendingDragUndo();
        const exact = screenToTileExact(e.clientX, e.clientY);
        const dx = exact.tileX - dragStartExactRef.current.x;
        const dy = exact.tileY - dragStartExactRef.current.y;
        let newTileX = dragEntityStartRef.current.x + dx;
        let newTileY = dragEntityStartRef.current.y + dy;
        if (state.snapEnabled) {
          newTileX = snapToGrid(newTileX, SNAP_GRID);
          newTileY = snapToGrid(newTileY, SNAP_GRID);
        }
        levelEditorStore.moveEntity(
          dragEntityIdRef.current,
          newTileX,
          newTileY
        );
        return;
      }

      if (isDraggingMultiRef.current) {
        consumePendingDragUndo();
        const exact = screenToTileExact(e.clientX, e.clientY);
        const dx = exact.tileX - dragStartExactRef.current.x;
        const dy = exact.tileY - dragStartExactRef.current.y;
        levelEditorStore.moveEntities(
          multiDragStartPositionsRef.current.map((p) => {
            let newX = p.tileX + dx;
            let newY = p.tileY + dy;
            if (state.snapEnabled) {
              newX = snapToGrid(newX, SNAP_GRID);
              newY = snapToGrid(newY, SNAP_GRID);
            }
            return { entityId: p.id, tileX: newX, tileY: newY };
          })
        );
        return;
      }

      if (isDraggingTilesRef.current) {
        const dx = tileX - tileDragStartRef.current.x;
        const dy = tileY - tileDragStartRef.current.y;
        tileDragOffsetRef.current = { dx, dy };
        setCursor("move");
        return;
      }

      if (isBoxSelectingRef.current || marqueeToolRef.current) {
        const { px, py } = screenToCanvasPixel(e.clientX, e.clientY);
        boxSelectEndRef.current = { x: px, y: py };
        const sx = boxSelectStartRef.current.x;
        const sy = boxSelectStartRef.current.y;
        setBoxSelectRect({
          x: Math.min(sx, px),
          y: Math.min(sy, py),
          w: Math.abs(px - sx),
          h: Math.abs(py - sy)
        });
        return;
      }

      if (isPaintingRef.current) {
        applyToolAt(tileX, tileY, state.selectedTool);
        return;
      }

      if (state.selectedTool === "select") {
        if (isTileSelectMode) {
          // Tile select cursor: show move cursor when hovering selected tiles
          const key = `${tileX},${tileY}`;
          setCursor(
            state.selectedTileKeys.includes(key) ? "move" : "crosshair"
          );
        } else {
          if (state.selectedEntityIds.length === 1) {
            const selectedEntity = findEntityInLayers(
              state.layers,
              state.selectedEntityIds[0]
            );
            if (selectedEntity) {
              // Check polyline point hover
              const points = selectedEntity.polyline || selectedEntity.polygon;
              if (points && points.length > 0) {
                const ptIdx = hitTestPolylinePoint(
                  e.clientX,
                  e.clientY,
                  selectedEntity
                );
                if (ptIdx >= 0) {
                  setCursor("move");
                  return;
                }
              }
              const { px, py } = screenToCanvasPixel(e.clientX, e.clientY);
              const zoom = state.camera.zoom;
              const tilePixels = TILE_SIZE * zoom;
              const offX = canvasSize.width / 2 - state.camera.x * tilePixels;
              const offY = canvasSize.height / 2 - state.camera.y * tilePixels;
              const rect = getEntityScreenRect(
                selectedEntity,
                tilePixels,
                offX,
                offY
              );
              const entityAngle = selectedEntity.angle ?? 0;
              if (hitTestRotationHandle(px, py, rect, entityAngle)) {
                setCursor("grab");
                return;
              }
              const handle = hitTestResizeHandle(px, py, rect, entityAngle);
              if (handle) {
                setCursor(
                  handle === "nw" || handle === "se"
                    ? "nwse-resize"
                    : "nesw-resize"
                );
                return;
              }
            }
          }
          const entityId = hitTestEntity(e.clientX, e.clientY);
          setCursor(entityId ? "pointer" : "crosshair");
        }
      } else {
        setCursor("crosshair");
      }
    },
    [
      state.camera.zoom,
      state.camera.x,
      state.camera.y,
      state.selectedTool,
      state.selectedEntityType,
      state.selectedEntityIds,
      state.selectedTileKeys,
      state.snapEnabled,
      state.layers,
      state.entityRefPick,
      isTileSelectMode,
      canvasSize,
      screenToTile,
      screenToTileExact,
      screenToCanvasPixel,
      sessionPointAt,
      hitSessionSpecialPoint,
      hitTestEntity,
      hitTestPolylinePoint,
      applyToolAt
    ]
  );

  const finishMarquee = useCallback(() => {
    const marqueeTool = marqueeToolRef.current;
    if (!marqueeTool) return;
    marqueeToolRef.current = null;
    setBoxSelectRect(null);

    const tileLayer = state.layers.find(
      (l) => l.id === state.activeLayerId && l.kind === "tile"
    );
    if (!tileLayer || tileLayer.kind !== "tile") return;

    const zoom = state.camera.zoom;
    const tilePixels = TILE_SIZE * zoom;
    const offX = canvasSize.width / 2 - state.camera.x * tilePixels;
    const offY = canvasSize.height / 2 - state.camera.y * tilePixels;
    const minX = Math.min(
      boxSelectStartRef.current.x,
      boxSelectEndRef.current.x
    );
    const maxX = Math.max(
      boxSelectStartRef.current.x,
      boxSelectEndRef.current.x
    );
    const minY = Math.min(
      boxSelectStartRef.current.y,
      boxSelectEndRef.current.y
    );
    const maxY = Math.max(
      boxSelectStartRef.current.y,
      boxSelectEndRef.current.y
    );
    const minTileX = Math.floor((minX - offX) / tilePixels);
    const maxTileX = Math.floor((maxX - offX) / tilePixels);
    const minTileY = Math.floor((minY - offY) / tilePixels);
    const maxTileY = Math.floor((maxY - offY) / tilePixels);

    if (marqueeTool === "erase") {
      const keys: string[] = [];
      for (let ty = minTileY; ty <= maxTileY; ty++) {
        for (let tx = minTileX; tx <= maxTileX; tx++) {
          const key = `${tx},${ty}`;
          if (tileLayer.tiles.has(key)) keys.push(key);
        }
      }
      if (keys.length > 0) {
        levelEditorStore.pushUndo();
        levelEditorStore.eraseTiles(state.activeLayerId, keys);
      }
      return;
    }

    // Paint tool: capture the rectangle as the brush. Empty cells become
    // holes, and the brush is trimmed to the bounding box of actual tiles so
    // a sloppy big selection doesn't offset the stamp.
    const found: { tx: number; ty: number; tile: TilePlacement }[] = [];
    let foundMinX = Infinity;
    let foundMinY = Infinity;
    for (let ty = minTileY; ty <= maxTileY; ty++) {
      for (let tx = minTileX; tx <= maxTileX; tx++) {
        const tile = tileLayer.tiles.get(`${tx},${ty}`);
        if (tile) {
          found.push({ tx, ty, tile });
          foundMinX = Math.min(foundMinX, tx);
          foundMinY = Math.min(foundMinY, ty);
        }
      }
    }
    if (found.length > 0) {
      levelEditorStore.setCapturedBrush(
        found.map((f) => ({
          dx: f.tx - foundMinX,
          dy: f.ty - foundMinY,
          tile: { ...f.tile }
        }))
      );
    }
  }, [state.camera, state.layers, state.activeLayerId, canvasSize]);

  const finishBoxSelect = useCallback(() => {
    if (!isBoxSelectingRef.current) return;
    isBoxSelectingRef.current = false;

    const sx = boxSelectStartRef.current.x;
    const sy = boxSelectStartRef.current.y;
    const ex = boxSelectEndRef.current.x;
    const ey = boxSelectEndRef.current.y;
    const minX = Math.min(sx, ex);
    const maxX = Math.max(sx, ex);
    const minY = Math.min(sy, ey);
    const maxY = Math.max(sy, ey);

    const hasMeaningfulDrag = maxX - minX > 4 || maxY - minY > 4;

    if (!hasMeaningfulDrag) {
      // Resolve as a click — check pending tile click
      const pending = pendingTileClickRef.current;
      pendingTileClickRef.current = null;
      if (pending && isTileSelectMode) {
        if (pending.tileExists && pending.shiftKey) {
          // Shift+click: toggle tile
          const already = state.selectedTileKeys.includes(pending.key);
          if (already) {
            levelEditorStore.selectTileKeys(
              state.selectedTileKeys.filter((k) => k !== pending.key)
            );
          } else {
            levelEditorStore.selectTileKeys([
              ...state.selectedTileKeys,
              pending.key
            ]);
          }
        } else if (pending.tileExists) {
          // Click on tile: select it
          levelEditorStore.selectTileKeys([pending.key]);
        } else if (!pending.shiftKey) {
          // Click on empty: clear selection
          levelEditorStore.selectTileKeys([]);
        }
      }
      setBoxSelectRect(null);
      return;
    }

    // Meaningful drag — perform box select
    pendingTileClickRef.current = null;

    const zoom = state.camera.zoom;
    const tilePixels = TILE_SIZE * zoom;
    const offX = canvasSize.width / 2 - state.camera.x * tilePixels;
    const offY = canvasSize.height / 2 - state.camera.y * tilePixels;

    if (isTileSelectMode) {
      // Select tiles within the box region
      const tileLayer = state.layers.find(
        (l) => l.id === state.activeLayerId && l.kind === "tile"
      );
      if (tileLayer && tileLayer.kind === "tile") {
        const minTileX = Math.floor((minX - offX) / tilePixels);
        const maxTileX = Math.floor((maxX - offX) / tilePixels);
        const minTileY = Math.floor((minY - offY) / tilePixels);
        const maxTileY = Math.floor((maxY - offY) / tilePixels);

        const keys: string[] = [];
        for (let ty = minTileY; ty <= maxTileY; ty++) {
          for (let tx = minTileX; tx <= maxTileX; tx++) {
            const key = `${tx},${ty}`;
            if (tileLayer.tiles.has(key)) {
              keys.push(key);
            }
          }
        }
        levelEditorStore.selectTileKeys(keys);
      }
    } else {
      const allEntities = flattenEntityLayers(state.layers);
      const hitIds: string[] = [];
      for (const entity of allEntities) {
        const rect = getEntityScreenRect(entity, tilePixels, offX, offY);
        if (
          rect.cx >= minX &&
          rect.cx <= maxX &&
          rect.cy >= minY &&
          rect.cy <= maxY
        ) {
          hitIds.push(entity.id);
        }
      }
      if (hitIds.length > 0) {
        levelEditorStore.selectEntities(hitIds);
      }
    }
    setBoxSelectRect(null);
  }, [
    state.camera,
    state.layers,
    state.activeLayerId,
    state.selectedTileKeys,
    isTileSelectMode,
    canvasSize
  ]);

  const onMouseUp = useCallback(
    (e?: React.MouseEvent | MouseEvent) => {
      if (lineButtonDownRef.current) {
        lineButtonDownRef.current = false;
        const anchor = lineAnchorRef.current;
        if (anchor && e && "clientX" in e) {
          const { tileX, tileY } = screenToTile(e.clientX, e.clientY);
          if (tileX !== anchor.x || tileY !== anchor.y) {
            paintLine(anchor, { x: tileX, y: tileY });
            lineAnchorRef.current = { x: tileX, y: tileY };
          }
        }
      }
      if (isPanningRef.current) {
        isPanningRef.current = false;
        setCursor("crosshair");
      }
      if (isPaintingRef.current) {
        isPaintingRef.current = false;
        undoPushedRef.current = false;
        strokeTilesRef.current.clear();
      }
      if (isDraggingPolyPointRef.current) {
        isDraggingPolyPointRef.current = false;
        polyPointEntityIdRef.current = null;
        polyPointIndexRef.current = -1;
        setCursor("crosshair");
      }
      if (isDraggingEntityRef.current) {
        isDraggingEntityRef.current = false;
        dragEntityIdRef.current = null;
        setCursor("crosshair");
      }
      if (isDraggingMultiRef.current) {
        isDraggingMultiRef.current = false;
        multiDragStartPositionsRef.current = [];
        setCursor("crosshair");
      }
      if (isDraggingTilesRef.current) {
        isDraggingTilesRef.current = false;
        tileDragOffsetRef.current = { dx: 0, dy: 0 };
        // Compute the tile-level offset from start to current mouse pos
        const clientX = e && "clientX" in e ? e.clientX : 0;
        const clientY = e && "clientY" in e ? e.clientY : 0;
        const { tileX, tileY } = screenToTile(clientX, clientY);
        const dx = tileX - tileDragStartRef.current.x;
        const dy = tileY - tileDragStartRef.current.y;
        if (dx !== 0 || dy !== 0) {
          const tileLayer = state.layers.find(
            (l) => l.id === state.activeLayerId && l.kind === "tile"
          );
          if (tileLayer && tileLayer.kind === "tile") {
            const moves: {
              fromKey: string;
              toKey: string;
              tile: TilePlacement;
            }[] = [];
            for (const key of state.selectedTileKeys) {
              const tile = tileLayer.tiles.get(key);
              if (!tile) continue;
              const [kx, ky] = key.split(",").map(Number);
              moves.push({
                fromKey: key,
                toKey: `${kx + dx},${ky + dy}`,
                tile
              });
            }
            if (moves.length > 0) {
              consumePendingDragUndo();
              levelEditorStore.moveTiles(state.activeLayerId, moves);
              // Update selection to new positions
              levelEditorStore.selectTileKeys(moves.map((m) => m.toKey));
            }
          }
        }
        setCursor("crosshair");
      }
      pendingDragUndoRef.current = false;
      finishMarquee();
      finishBoxSelect();
      if (isResizingRef.current) {
        isResizingRef.current = false;
        resizeHandleRef.current = null;
        resizeEntityIdRef.current = null;
        setCursor("crosshair");
      }
      if (isRotatingRef.current) {
        isRotatingRef.current = false;
        rotateEntityIdRef.current = null;
        setCursor("crosshair");
      }
    },
    [
      finishMarquee,
      finishBoxSelect,
      screenToTile,
      paintLine,
      state.layers,
      state.activeLayerId,
      state.selectedTileKeys
    ]
  );

  // Wheel zoom
  useEffect(() => {
    const canvas = webglCanvasRef.current;
    if (!canvas) return;

    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const cam = cameraRef.current;
      const size = canvasSizeRef.current;
      const delta = e.deltaY > 0 ? 0.93 : 1 / 0.93;
      const oldZoom = cam.zoom;
      const newZoom = Math.max(0.25, Math.min(16, oldZoom * delta));

      const rect = canvas.getBoundingClientRect();
      const pixelX = (e.clientX - rect.left) * window.devicePixelRatio;
      const pixelY = (e.clientY - rect.top) * window.devicePixelRatio;

      const worldX = (pixelX - size.width / 2) / (oldZoom * TILE_SIZE) + cam.x;
      const worldY = (pixelY - size.height / 2) / (oldZoom * TILE_SIZE) + cam.y;

      const newCamX =
        worldX - (pixelX - size.width / 2) / (newZoom * TILE_SIZE);
      const newCamY =
        worldY - (pixelY - size.height / 2) / (newZoom * TILE_SIZE);

      levelEditorStore.setCamera({ x: newCamX, y: newCamY, zoom: newZoom });
    };

    canvas.addEventListener("wheel", handler, { passive: false });
    return () => canvas.removeEventListener("wheel", handler);
  }, []);

  const onContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
  }, []);

  // Double-click on the selected shape entity starts a point-editing session:
  // on a point — extend from an endpoint, insert after a midpoint, or open a
  // closed polygon at that junction; on a segment — insert points into it.
  const onDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      if (polylineSessionRef.current) return;
      if (performance.now() - sessionEndedAtRef.current < 400) return;
      if (state.selectedTool !== "select" || isTileSelectMode) return;
      if (state.selectedEntityIds.length !== 1) return;
      const entity = findEntityInLayers(
        state.layers,
        state.selectedEntityIds[0]
      );
      if (!entity) return;
      const points = entity.polyline || entity.polygon;
      if (!points || points.length < 2) return;
      const isClosed = !!entity.polygon;
      const origin = { tileX: entity.tileX, tileY: entity.tileY };

      const startSession = (session: PolylineSession) => {
        levelEditorStore.pushUndo();
        polylineSessionRef.current = session;
        syncSessionToStore();
        e.preventDefault();
      };

      const ptIdx = hitTestPolylinePoint(e.clientX, e.clientY, entity);
      if (ptIdx >= 0) {
        if (isClosed) {
          // Open the polygon at this junction: the clicked point becomes the
          // live endpoint and the segment to its successor is removed.
          const reordered = [
            ...points.slice(ptIdx + 1),
            ...points.slice(0, ptIdx + 1)
          ];
          startSession({
            entityId: entity.id,
            mode: "edit",
            closed: false,
            committed: reordered,
            cursorIndex: reordered.length - 1,
            insertAfter: true,
            placedCount: 0,
            origin
          });
        } else {
          // Endpoints extend the line; midpoints insert after themselves.
          startSession({
            entityId: entity.id,
            mode: "edit",
            closed: false,
            committed: [...points],
            cursorIndex: ptIdx,
            insertAfter: ptIdx !== 0,
            placedCount: 0,
            origin
          });
        }
        return;
      }

      const { px, py } = screenToCanvasPixel(e.clientX, e.clientY);
      const zoom = state.camera.zoom;
      const tilePixels = TILE_SIZE * zoom;
      const offX = canvasSize.width / 2 - state.camera.x * tilePixels;
      const offY = canvasSize.height / 2 - state.camera.y * tilePixels;
      const edgeHit = projectOntoPolylineEdge(
        px,
        py,
        entity,
        tilePixels,
        offX,
        offY,
        Math.max(12, 8 * zoom)
      );
      if (edgeHit) {
        startSession({
          entityId: entity.id,
          mode: "edit",
          closed: isClosed,
          committed: [...points],
          cursorIndex: edgeHit.segmentIndex,
          insertAfter: true,
          placedCount: 0,
          origin
        });
      }
    },
    [
      state.selectedTool,
      state.selectedEntityIds,
      state.layers,
      state.camera,
      isTileSelectMode,
      canvasSize,
      screenToCanvasPixel,
      hitTestPolylinePoint,
      syncSessionToStore
    ]
  );

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Let a focused form field own its keystrokes (Ctrl+A, Ctrl+C, etc.)
      // instead of triggering editor-wide shortcuts.
      if (
        isEditableTarget(e.target) ||
        isEditableTarget(document.activeElement)
      ) {
        return;
      }
      // Stay silent when the user is in the game viewport or the editor tab
      // is hidden — this listener is window-level and outlives tab visibility.
      if (!editorOwnsKeyboard(containerRef.current)) {
        return;
      }
      if (e.ctrlKey || e.metaKey) {
        if (e.key === "z" && !e.shiftKey) {
          e.preventDefault();
          if (polylineSessionRef.current) {
            popSessionPoint();
          } else {
            levelEditorStore.undo();
          }
        } else if ((e.key === "z" && e.shiftKey) || e.key === "y") {
          e.preventDefault();
          levelEditorStore.redo();
        } else if (e.key === "s") {
          e.preventDefault();
          levelEditorStore.requestSave();
        } else if (e.key === "e") {
          // Override the browser's address-bar binding.
          e.preventDefault();
          playEditorLevel(reduxStore, dispatch, controller);
        } else if (e.key === "c") {
          // Copy selected tiles or entity
          const curActiveLayer = state.layers.find(
            (l) => l.id === state.activeLayerId
          );
          if (
            curActiveLayer?.kind === "tile" &&
            state.selectedTileKeys.length > 0
          ) {
            // Copy selected tiles (relative to min corner)
            const tileLayer = curActiveLayer;
            const coords = state.selectedTileKeys.map((k) => {
              const [x, y] = k.split(",").map(Number);
              return { x, y };
            });
            const minX = Math.min(...coords.map((c) => c.x));
            const minY = Math.min(...coords.map((c) => c.y));
            const tiles: { dx: number; dy: number; tile: TilePlacement }[] = [];
            for (let i = 0; i < state.selectedTileKeys.length; i++) {
              const tile = tileLayer.tiles.get(state.selectedTileKeys[i]);
              if (tile) {
                tiles.push({
                  dx: coords[i].x - minX,
                  dy: coords[i].y - minY,
                  tile: { ...tile }
                });
              }
            }
            clipboardTilesRef.current = tiles;
          } else if (state.selectedEntityIds.length >= 1) {
            // Copy selected entities with relative offsets
            const entities: EntityPlacement[] = [];
            for (const id of state.selectedEntityIds) {
              const ent = findEntityInLayers(state.layers, id);
              if (ent) entities.push(ent);
            }
            if (entities.length > 0) {
              const minX = Math.min(...entities.map((e) => e.tileX));
              const minY = Math.min(...entities.map((e) => e.tileY));
              clipboardEntitiesRef.current = entities.map((ent) => ({
                dx: ent.tileX - minX,
                dy: ent.tileY - minY,
                entity: {
                  ...ent,
                  properties: ent.properties ? { ...ent.properties } : undefined
                }
              }));
            }
          }
        } else if (e.key === "v") {
          // Paste tiles or entity at cursor position
          const tile = mouseTileRef.current;
          const curActiveLayer = state.layers.find(
            (l) => l.id === state.activeLayerId
          );
          if (
            curActiveLayer?.kind === "tile" &&
            clipboardTilesRef.current &&
            tile
          ) {
            e.preventDefault();
            levelEditorStore.pushUndo();
            const tilesToPaint = clipboardTilesRef.current.map((t) => ({
              tileX: tile.x + t.dx,
              tileY: tile.y + t.dy,
              tile: { ...t.tile }
            }));
            levelEditorStore.paintTiles(state.activeLayerId, tilesToPaint);
            // Select the pasted tiles
            levelEditorStore.selectTileKeys(
              tilesToPaint.map((t) => `${t.tileX},${t.tileY}`)
            );
          } else {
            const clips = clipboardEntitiesRef.current;
            if (clips && clips.length > 0 && tile) {
              e.preventDefault();
              levelEditorStore.pushUndo();
              const copiedOriginals = clips.map((clip) => clip.entity);
              const newIdByOriginalId = new Map(
                clips.map((clip) => [
                  clip.entity.id,
                  levelEditorStore.mintEditorId()
                ])
              );
              for (const clip of clips) {
                levelEditorStore.addEntity({
                  ...clip.entity,
                  id: newIdByOriginalId.get(clip.entity.id)!,
                  // A copy is a new Tiled object; inheriting the original's id
                  // would point every reference to it at two entities.
                  tiledObjectId: undefined,
                  tileX: tile.x + clip.dx,
                  tileY: tile.y + clip.dy,
                  // Refs between copied entities follow the copies, as in
                  // Tiled; refs to anything else keep their target.
                  properties: remapPastedEntityRefs(
                    clip.entity.type,
                    clip.entity.properties
                      ? { ...clip.entity.properties }
                      : undefined,
                    copiedOriginals,
                    newIdByOriginalId
                  )
                });
              }
              levelEditorStore.selectEntities([...newIdByOriginalId.values()]);
            }
          }
        } else if (e.key === "a") {
          // Select all — tiles or entities depending on active layer
          e.preventDefault();
          const curActiveLayer = state.layers.find(
            (l) => l.id === state.activeLayerId
          );
          if (
            curActiveLayer?.kind === "tile" &&
            state.selectedTool === "select"
          ) {
            const keys = [...curActiveLayer.tiles.keys()];
            levelEditorStore.selectTileKeys(keys);
          } else {
            const allEntities = flattenEntityLayers(state.layers);
            levelEditorStore.selectEntities(allEntities.map((ent) => ent.id));
          }
        }
      } else if (e.key === "Escape") {
        levelEditorStore.setEntityRefPick(null);
        // Cancel the polyline session, reverting everything it changed.
        if (polylineSessionRef.current) {
          endPolylineSession({ cancel: true });
        }
      } else if (e.key === "Enter") {
        // Finish the polyline session, keeping committed points.
        const session = polylineSessionRef.current;
        if (session && session.committed.length >= (session.closed ? 3 : 2)) {
          endPolylineSession();
        }
      } else if (e.key === "Delete" || e.key === "Backspace") {
        if (polylineSessionRef.current) {
          popSessionPoint();
          return;
        }
        // Delete selected polyline/polygon point (requires >= 3 points to keep valid shape)
        if (
          selectedPolyPointEntityIdRef.current &&
          selectedPolyPointIndexRef.current >= 0
        ) {
          const ent = findEntityInLayers(
            state.layers,
            selectedPolyPointEntityIdRef.current
          );
          const pts = ent?.polyline || ent?.polygon;
          if (pts && pts.length > 2) {
            levelEditorStore.pushUndo();
            levelEditorStore.deletePolylinePoint(
              selectedPolyPointEntityIdRef.current,
              selectedPolyPointIndexRef.current
            );
            selectedPolyPointEntityIdRef.current = null;
            selectedPolyPointIndexRef.current = -1;
            setSelectedPolyPoint(null);
            return;
          }
        }

        if (state.selectedTileKeys.length > 0) {
          levelEditorStore.pushUndo();
          levelEditorStore.eraseTiles(state.activeLayerId, [
            ...state.selectedTileKeys
          ]);
          levelEditorStore.selectTileKeys([]);
        } else if (state.selectedEntityIds.length > 0) {
          levelEditorStore.pushUndo();
          levelEditorStore.removeEntities([...state.selectedEntityIds]);
        }
      } else if (!e.altKey) {
        // Tiled-style single-letter shortcuts.
        switch (e.key.toLowerCase()) {
          case "b":
            levelEditorStore.selectTool("paint");
            break;
          case "e":
            levelEditorStore.selectTool("erase");
            break;
          case "s":
            levelEditorStore.selectTool("select");
            break;
          case "r":
            levelEditorStore.selectTool("entity");
            break;
          case "p":
            levelEditorStore.selectTool("polyline");
            break;
          case "f":
            levelEditorStore.selectTool("fill");
            break;
          case "x":
            if (state.selectedTool === "paint" || state.selectedTool === "fill")
              levelEditorStore.flipBrushH();
            break;
          case "y":
            if (state.selectedTool === "paint" || state.selectedTool === "fill")
              levelEditorStore.flipBrushV();
            break;
          case "z":
            if (
              state.selectedTool === "paint" ||
              state.selectedTool === "fill"
            ) {
              if (e.shiftKey) levelEditorStore.rotateBrushCCW();
              else levelEditorStore.rotateBrushCW();
            }
            break;
          case "h":
            levelEditorStore.toggleLayerHighlight();
            break;
        }
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      // Releasing shift cancels a pending straight line.
      if (e.key === "Shift") {
        lineAnchorRef.current = null;
        lineButtonDownRef.current = false;
      }
    };
    window.addEventListener("keydown", handler);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", handler);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [
    state.selectedEntityIds,
    state.selectedTileKeys,
    state.selectedTool,
    state.layers,
    state.activeLayerId,
    popSessionPoint,
    endPolylineSession,
    reduxStore,
    dispatch,
    controller
  ]);

  // Remote entity placement ghosts render as real sprites through the
  // renderer; this feeds it the peers' broadcast intent at presence cadence.
  useEffect(() => {
    if (!levelReady) return;
    const interval = setInterval(() => {
      const renderer = rendererRef.current;
      if (!renderer) return;
      const ghosts: {
        key: string;
        type: string;
        tileX: number;
        tileY: number;
      }[] = [];
      if (levelEditorSession.isInRoom() && !stateRef.current.liveMode) {
        for (const member of levelEditorSession.getMembers()) {
          if (member.isSelf || member.state.away) continue;
          const ghost = member.state.presence?.ghost;
          if (ghost?.kind === "entityGhost") {
            ghosts.push({
              key: String(member.clientId),
              type: ghost.entityType,
              tileX: ghost.tileX,
              tileY: ghost.tileY
            });
          }
        }
      }
      renderer.syncRemoteEntityGhosts(ghosts);
    }, 100);
    return () => clearInterval(interval);
  }, [levelReady]);

  // Presence: snapshot the in-progress gesture as compact intent for peers.
  // Reads only refs, so registration is mount-stable.
  useEffect(() => {
    return presencePublisher.registerGestureSource((): PresenceGhost | null => {
      const camera = cameraRef.current;
      const canvasSize = canvasSizeRef.current;
      const currentState = stateRef.current;

      // Paint and erase rectangles set marqueeToolRef without the
      // box-select flag, so both must publish.
      if (isBoxSelectingRef.current || marqueeToolRef.current) {
        const start = boxSelectStartRef.current;
        const end = boxSelectEndRef.current;
        const min = canvasPixelToTile(
          Math.min(start.x, end.x),
          Math.min(start.y, end.y),
          camera,
          canvasSize
        );
        const max = canvasPixelToTile(
          Math.max(start.x, end.x),
          Math.max(start.y, end.y),
          camera,
          canvasSize
        );
        return {
          kind: "marquee",
          x: min.tileX,
          y: min.tileY,
          w: max.tileX - min.tileX,
          h: max.tileY - min.tileY,
          tool: marqueeToolRef.current ?? "select"
        };
      }
      if (lineAnchorRef.current && mouseTileRef.current) {
        return {
          kind: "line",
          x1: lineAnchorRef.current.x,
          y1: lineAnchorRef.current.y,
          x2: mouseTileRef.current.x,
          y2: mouseTileRef.current.y
        };
      }
      if (sessionPreviewRef.current && sessionPreviewRef.current.length > 0) {
        return {
          kind: "polyline",
          points: sessionPreviewRef.current.slice(0, 100).map((p) => ({
            x: p.x / TILE_SIZE,
            y: p.y / TILE_SIZE
          }))
        };
      }
      if (
        currentState.selectedTool === "entity" &&
        currentState.selectedEntityType &&
        ghostTileRef.current
      ) {
        return {
          kind: "entityGhost",
          tileX: ghostTileRef.current.tileX,
          tileY: ghostTileRef.current.tileY,
          entityType: currentState.selectedEntityType
        };
      }
      if (isDraggingTilesRef.current) {
        return {
          kind: "tileDrag",
          dx: tileDragOffsetRef.current.dx,
          dy: tileDragOffsetRef.current.dy,
          keys: currentState.selectedTileKeys.slice(0, 300)
        };
      }
      return null;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Switching tools mid-session cancels it like Escape. Finishing a create
  // session clears the ref before switching to the select tool, so this only
  // fires for genuine interruptions.
  useEffect(() => {
    if (polylineSessionRef.current) {
      endPolylineSession({ cancel: true });
    }
    lineAnchorRef.current = null;
    lineButtonDownRef.current = false;
  }, [state.selectedTool, endPolylineSession]);

  return (
    <div
      ref={containerRef}
      className="level-editor-canvas-container"
      data-testid="level-editor-canvas-container"
    >
      <canvas
        ref={webglCanvasRef}
        className="level-editor-webgl-canvas"
        data-testid="level-editor-canvas"
        style={{ cursor }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={(e) => {
          ghostTileRef.current = null;
          onMouseUp(e);
        }}
        onDoubleClick={onDoubleClick}
        onContextMenu={onContextMenu}
      />
      <PresenceOverlay
        tilesetTextures={tilesetTextures}
        tilesetMeta={tilesetMeta}
      />
      {boxSelectRect && boxSelectRect.w > 0 && boxSelectRect.h > 0 && (
        <Box
          sx={{
            position: "absolute",
            border: 1,
            // The erase marquee warns in red; selection/capture uses the accent.
            borderColor:
              marqueeToolRef.current === "erase"
                ? "error.main"
                : "primary.main",
            bgcolor:
              marqueeToolRef.current === "erase"
                ? "error.main"
                : "primary.main",
            opacity: 0.3,
            pointerEvents: "none"
          }}
          style={{
            left: boxSelectRect.x / window.devicePixelRatio,
            top: boxSelectRect.y / window.devicePixelRatio,
            width: boxSelectRect.w / window.devicePixelRatio,
            height: boxSelectRect.h / window.devicePixelRatio
          }}
        />
      )}
      {mouseTile && (
        <Typography
          variant="caption"
          data-testid="level-editor-coords"
          sx={{
            position: "absolute",
            bottom: 6,
            left: 8,
            px: 0.75,
            borderRadius: 0.5,
            bgcolor: "rgba(0, 0, 0, 0.55)",
            color: "common.white",
            fontFamily: "monospace",
            pointerEvents: "none"
          }}
        >
          {mouseTile.x}, {mouseTile.y}
        </Typography>
      )}
    </div>
  );
}
