import { useEffect, useRef, useState } from "react";

import {
  TilesetMeta,
  TilesetTextureCache,
  getEntityPixelSize
} from "../LevelEditorRenderer";
import { levelEditorStore } from "../LevelEditorStore";
import { patternLookup, regionStamps, stampsAlongLine } from "../brushStamps";
import { TILE_SIZE } from "../constants";
import { computeFillCells } from "../fillRegion";
import {
  EditorLayer,
  EntityPlacement,
  TilePlacement,
  TileStamp
} from "../levelEditorState";
import { CollabMember, PresenceBrush, PresenceState } from "./collabTypes";
import { levelEditorSession } from "./session";

// Renders remote members' presence (cursors, tool ghosts, selection outlines,
// offscreen chevrons) on a 2D canvas floated over the editor's WebGL canvas.
// Everything here is awareness-derived and ephemeral; nothing touches the
// document. Ghosts draw the real tiles a peer is about to place (from their
// broadcast brush stamps and the shared tileset images), at well below local
// preview opacity so your own work always reads strongest.

const GHOST_FILL_ALPHA = 0.14;
const GHOST_STROKE_ALPHA = 0.45;
const GHOST_TILE_ALPHA = 0.35;
const SELECTION_ALPHA = 0.65;
// Faded but still findable, matching the avatar row's dimming.
const IDLE_ALPHA = 0.3;
const FILL_GHOST_CELL_CAP = 4000;
/** Above this many cells a preview falls back to flat shapes; the per-frame
 *  drawImage calls are what actually cost. */
const TILE_DRAW_CAP = 4000;
const EDGE_MARGIN = 22;

/** Expanded stamp cells (and their pattern lookup) per received brush, cached
 *  on the brush object (a fresh one arrives per awareness update, so the
 *  cache self-invalidates). */
type BrushExpansion = {
  cells: TileStamp[] | null;
  lookup?: (relX: number, relY: number) => TilePlacement | undefined;
};
const brushExpansionCache = new WeakMap<PresenceBrush, BrushExpansion>();

function brushExpansion(brush: PresenceBrush): BrushExpansion {
  let entry = brushExpansionCache.get(brush);
  if (!entry) {
    entry = {
      cells: brush.cells ?? (brush.region ? regionStamps(brush.region) : null)
    };
    brushExpansionCache.set(brush, entry);
  }
  return entry;
}

function brushStampCells(brush: PresenceBrush): TileStamp[] | null {
  return brushExpansion(brush).cells;
}

function brushPatternLookup(
  brush: PresenceBrush
): BrushExpansion["lookup"] | null {
  const entry = brushExpansion(brush);
  if (!entry.lookup && entry.cells) entry.lookup = patternLookup(entry.cells);
  return entry.lookup ?? null;
}

type MemberEase = {
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  alpha: number;
};

type FillGhostCache = {
  tiles: Map<string, TilePlacement> | null;
  key: string;
  cells: { x: number; y: number }[] | null;
};

/** Line stamps recompute only when the endpoints or the brush change, not on
 *  every animation frame. */
type LineGhostCache = {
  key: string;
  source: TileStamp[];
  stamps: TileStamp[];
};

type TileArt = {
  textures: TilesetTextureCache;
  meta: TilesetMeta;
};

function entityFootprintTiles(entityType: string): { w: number; h: number } {
  const { width, height } = getEntityPixelSize({
    type: entityType,
    tileX: 0,
    tileY: 0,
    id: "presence-footprint"
  });
  return { w: width / TILE_SIZE, h: height / TILE_SIZE };
}

type ChevronHit = {
  x: number;
  y: number;
  radius: number;
  target: { x: number; y: number };
};

export function PresenceOverlay({
  tilesetTextures,
  tilesetMeta
}: {
  tilesetTextures: TilesetTextureCache;
  tilesetMeta: TilesetMeta;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chevronHitsRef = useRef<ChevronHit[]>([]);
  const [inRoom, setInRoom] = useState(levelEditorSession.isInRoom());

  // The draw loop closes over [inRoom] only; refs keep it on the live caches.
  const tileArtRef = useRef<TileArt>({
    textures: tilesetTextures,
    meta: tilesetMeta
  });
  tileArtRef.current = { textures: tilesetTextures, meta: tilesetMeta };

  useEffect(() => {
    const update = () => setInRoom(levelEditorSession.isInRoom());
    levelEditorSession.events.on("sessionChanged", update);
    return () => {
      levelEditorSession.events.off("sessionChanged", update);
    };
  }, []);

  useEffect(() => {
    if (!inRoom) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const eased = new Map<number, MemberEase>();
    const fillCaches = new Map<number, FillGhostCache>();
    const lineCaches = new Map<number, LineGhostCache>();
    // Entity id lookup shared by every member's selection outlines, rebuilt
    // only when the layers view changes identity.
    let entityIndexCache: {
      layers: EditorLayer[];
      index: Map<string, EntityPlacement>;
    } | null = null;
    const entityIndexFor = (layers: EditorLayer[]) => {
      if (!entityIndexCache || entityIndexCache.layers !== layers) {
        const index = new Map<string, EntityPlacement>();
        for (const layer of layers) {
          if (layer.kind !== "entity") continue;
          for (const entity of layer.entities) index.set(entity.id, entity);
        }
        entityIndexCache = { layers, index };
      }
      return entityIndexCache.index;
    };
    let raf = 0;

    const draw = () => {
      raf = requestAnimationFrame(draw);
      const dpr = window.devicePixelRatio || 1;
      const cssWidth = canvas.clientWidth;
      const cssHeight = canvas.clientHeight;
      const width = Math.max(1, Math.floor(cssWidth * dpr));
      const height = Math.max(1, Math.floor(cssHeight * dpr));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      ctx.clearRect(0, 0, width, height);
      chevronHitsRef.current = [];

      // Away members still show their last cursor position (faded), so a
      // click on their avatar or name has somewhere to land.
      const members = levelEditorSession.getMembers().filter((m) => !m.isSelf);
      if (members.length === 0) return;

      const state = levelEditorStore.getState();
      const camera = state.camera;
      const scale = camera.zoom * TILE_SIZE; // physical px per tile
      const toX = (tileX: number) => width / 2 + (tileX - camera.x) * scale;
      const toY = (tileY: number) => height / 2 + (tileY - camera.y) * scale;

      const edgeCounts = new Map<string, number>();
      for (const member of members) {
        const color = member.state.identity.color;
        const name = member.state.identity.name;
        const presence = member.state.presence;
        const anchor = presence?.cursor ?? null;

        // Ease cursor motion; the fade target follows the session's idle
        // state so the cursor dims exactly when the avatar row does.
        let ease = eased.get(member.clientId);
        if (anchor) {
          if (!ease) {
            ease = {
              x: anchor.x,
              y: anchor.y,
              targetX: anchor.x,
              targetY: anchor.y,
              alpha: 1
            };
            eased.set(member.clientId, ease);
          }
          ease.targetX = anchor.x;
          ease.targetY = anchor.y;
          ease.x += (ease.targetX - ease.x) * 0.35;
          ease.y += (ease.targetY - ease.y) * 0.35;
          const idle = member.state.away || member.idle;
          const targetAlpha = idle ? IDLE_ALPHA : 1;
          ease.alpha += (targetAlpha - ease.alpha) * (idle ? 0.05 : 1);
        }

        const px = ease ? toX(ease.x) : null;
        const py = ease ? toY(ease.y) : null;
        const onScreen =
          px !== null &&
          py !== null &&
          px >= 0 &&
          px <= width &&
          py >= 0 &&
          py <= height;

        // Tool intent goes stale the moment the tab closes; only the cursor
        // outlives it.
        if (presence && !member.state.away) {
          drawGhosts(
            ctx,
            member,
            presence,
            state,
            { fill: fillCaches, line: lineCaches },
            tileArtRef.current,
            { toX, toY, scale, dpr, color }
          );
          drawSelectionOutlines(
            ctx,
            presence,
            state,
            {
              toX,
              toY,
              scale,
              dpr,
              color
            },
            entityIndexFor
          );
        }

        if (anchor && px !== null && py !== null) {
          if (onScreen) {
            drawCursor(ctx, px, py, color, name, dpr, ease?.alpha ?? 1);
          } else {
            const edge = offscreenEdge(px, py, width, height);
            const indexOnEdge = edgeCounts.get(edge) ?? 0;
            edgeCounts.set(edge, indexOnEdge + 1);
            const hit = drawEdgeChevron(
              ctx,
              px,
              py,
              width,
              height,
              color,
              name,
              dpr,
              edge,
              indexOnEdge
            );
            chevronHitsRef.current.push({
              ...hit,
              target: { x: anchor.x, y: anchor.y }
            });
          }
        }
      }

      // Drop bookkeeping for members that left.
      const liveIds = new Set(members.map((m) => m.clientId));
      for (const id of [...eased.keys()]) {
        if (!liveIds.has(id)) eased.delete(id);
      }
      for (const id of [...fillCaches.keys()]) {
        if (!liveIds.has(id)) fillCaches.delete(id);
      }
      for (const id of [...lineCaches.keys()]) {
        if (!liveIds.has(id)) lineCaches.delete(id);
      }
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [inRoom]);

  // Clicking a chevron jumps the camera to that peer. The overlay ignores
  // pointer events (tools stay usable through it), so chevron hits are caught
  // in the capture phase on the shared container and swallowed before the
  // editor canvas can start a paint gesture.
  useEffect(() => {
    if (!inRoom) return;
    const canvas = canvasRef.current;
    const container = canvas?.parentElement;
    if (!canvas || !container) return;
    const onMouseDown = (e: MouseEvent) => {
      // Right/middle presses start pans and rect-erases; only a left click
      // may jump the camera.
      if (e.button !== 0) return;
      if (chevronHitsRef.current.length === 0) return;
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const clickX = (e.clientX - rect.left) * dpr;
      const clickY = (e.clientY - rect.top) * dpr;
      for (const hit of chevronHitsRef.current) {
        if (Math.hypot(clickX - hit.x, clickY - hit.y) <= hit.radius) {
          levelEditorStore.setCamera({ x: hit.target.x, y: hit.target.y });
          e.stopPropagation();
          e.preventDefault();
          return;
        }
      }
    };
    container.addEventListener("mousedown", onMouseDown, true);
    return () => container.removeEventListener("mousedown", onMouseDown, true);
  }, [inRoom]);

  if (!inRoom) return null;
  return (
    <canvas
      ref={canvasRef}
      data-testid="presence-overlay"
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none"
      }}
    />
  );
}

// -----------------------------------------------------------------------------
// Drawing helpers
// -----------------------------------------------------------------------------

type Projection = {
  toX: (tileX: number) => number;
  toY: (tileY: number) => number;
  scale: number;
  dpr: number;
  color: string;
};

function drawCursor(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  color: string,
  name: string,
  dpr: number,
  alpha: number
): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(px, py);
  ctx.scale(dpr, dpr);
  ctx.fillStyle = color;
  ctx.strokeStyle = "rgba(0,0,0,0.5)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(11, 4.5);
  ctx.lineTo(6.5, 6.5);
  ctx.lineTo(4.5, 11);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.font = "10px system-ui, sans-serif";
  const label = name;
  const metrics = ctx.measureText(label);
  ctx.fillStyle = color;
  ctx.globalAlpha = alpha * 0.9;
  ctx.beginPath();
  ctx.roundRect(10, 10, metrics.width + 8, 14, 3);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.globalAlpha = alpha;
  ctx.fillText(label, 14, 20);
  ctx.restore();
}

function clampToEdge(
  px: number,
  py: number,
  width: number,
  height: number,
  dpr: number
): { x: number; y: number } {
  const margin = EDGE_MARGIN * dpr;
  return {
    x: Math.max(margin, Math.min(width - margin, px)),
    y: Math.max(margin, Math.min(height - margin, py))
  };
}

type ScreenEdge = "left" | "right" | "top" | "bottom";

/** The edge the offscreen point overshoots the most. */
function offscreenEdge(
  px: number,
  py: number,
  width: number,
  height: number
): ScreenEdge {
  const overshoots: [ScreenEdge, number][] = [
    ["left", -px],
    ["right", px - width],
    ["top", -py],
    ["bottom", py - height]
  ];
  return overshoots.reduce((a, b) => (a[1] >= b[1] ? a : b))[0];
}

function drawEdgeChevron(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  width: number,
  height: number,
  color: string,
  name: string,
  dpr: number,
  edge: ScreenEdge,
  indexOnEdge: number
): { x: number; y: number; radius: number } {
  const clamped = clampToEdge(px, py, width, height, dpr);
  // Members off the same edge stack along it so their labels stay legible.
  const stackOffset = indexOnEdge * 22 * dpr;
  const margin = EDGE_MARGIN * dpr;
  let x = clamped.x;
  let y = clamped.y;
  if (edge === "left" || edge === "right") {
    y = Math.min(y + stackOffset, height - margin);
  } else {
    x = Math.min(x + stackOffset, width - margin);
  }
  const angle = Math.atan2(py - y, px - x);
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(dpr, dpr);
  ctx.rotate(angle);
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.9;
  ctx.beginPath();
  ctx.moveTo(9, 0);
  ctx.lineTo(-4, -6);
  ctx.lineTo(-4, 6);
  ctx.closePath();
  ctx.fill();
  ctx.rotate(-angle);
  ctx.font = "10px system-ui, sans-serif";
  const metrics = ctx.measureText(name);
  const labelX = clamped.x < width / 2 ? 12 : -metrics.width - 20;
  ctx.beginPath();
  ctx.roundRect(labelX, -7, metrics.width + 8, 14, 3);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.fillText(name, labelX + 4, 3);
  ctx.restore();
  return { x, y, radius: 16 * dpr };
}

/** One tile from the shared tileset images, with Tiled's flip semantics
 *  (diagonal first, then horizontal, then vertical). False when the tileset
 *  image or metadata isn't available, so callers can fall back to a shape. */
function drawTileImage(
  ctx: CanvasRenderingContext2D,
  art: TileArt,
  placement: TilePlacement,
  px: number,
  py: number,
  size: number
): boolean {
  const entry = art.textures.get(placement.tilesetName);
  const meta = art.meta.get(placement.tilesetName);
  if (!entry || !entry.img.complete || !meta) return false;
  const srcX = (placement.gid % meta.columns) * meta.tileWidth;
  const srcY = Math.floor(placement.gid / meta.columns) * meta.tileHeight;
  if (!placement.flipH && !placement.flipV && !placement.flipD) {
    ctx.drawImage(
      entry.img,
      srcX,
      srcY,
      meta.tileWidth,
      meta.tileHeight,
      px,
      py,
      size,
      size
    );
    return true;
  }
  ctx.save();
  ctx.translate(px + size / 2, py + size / 2);
  // Canvas transforms compose so the last-applied one acts on the image
  // first, putting the diagonal flip ahead of the axis flips.
  if (placement.flipH) ctx.scale(-1, 1);
  if (placement.flipV) ctx.scale(1, -1);
  if (placement.flipD) ctx.transform(0, 1, 1, 0, 0, 0);
  ctx.drawImage(
    entry.img,
    srcX,
    srcY,
    meta.tileWidth,
    meta.tileHeight,
    -size / 2,
    -size / 2,
    size,
    size
  );
  ctx.restore();
  return true;
}

/** Tile image with a flat-fill fallback for missing placements or art,
 *  restoring the shared tile alpha afterwards. */
function drawTileOrFallback(
  ctx: CanvasRenderingContext2D,
  art: TileArt,
  placement: TilePlacement | undefined,
  px: number,
  py: number,
  size: number
): void {
  if (!placement || !drawTileImage(ctx, art, placement, px, py, size)) {
    ctx.globalAlpha = GHOST_FILL_ALPHA;
    ctx.fillRect(px, py, size, size);
    ctx.globalAlpha = GHOST_TILE_ALPHA;
  }
}

/** Stamp cells anchored at a tile, as the peer would paint them. Cells whose
 *  tileset art is unavailable render as flat fills. */
function drawStampCells(
  ctx: CanvasRenderingContext2D,
  art: TileArt,
  cells: TileStamp[],
  anchorX: number,
  anchorY: number,
  proj: Projection
): void {
  const { toX, toY, scale } = proj;
  ctx.globalAlpha = GHOST_TILE_ALPHA;
  for (const s of cells) {
    drawTileOrFallback(
      ctx,
      art,
      s.tile,
      toX(anchorX + s.dx),
      toY(anchorY + s.dy),
      scale
    );
  }
}

function drawGhosts(
  ctx: CanvasRenderingContext2D,
  member: CollabMember,
  presence: PresenceState,
  state: ReturnType<typeof levelEditorStore.getState>,
  caches: {
    fill: Map<number, FillGhostCache>;
    line: Map<number, LineGhostCache>;
  },
  art: TileArt,
  proj: Projection
): void {
  const { toX, toY, scale, dpr, color } = proj;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = dpr;

  const ghost = presence.ghost;
  const cursor = presence.cursor;
  const brush = presence.brush;

  // Hover stamp under the cursor for paint: the actual brush tiles, with a
  // thin outline around the bounds so it still reads as this peer's.
  if (!ghost && cursor && brush && presence.tool === "paint") {
    const cellX = Math.floor(cursor.x);
    const cellY = Math.floor(cursor.y);
    const left = toX(cellX + brush.minDx);
    const top = toY(cellY + brush.minDy);
    const cells = brushStampCells(brush);
    if (cells && cells.length <= TILE_DRAW_CAP) {
      drawStampCells(ctx, art, cells, cellX, cellY, proj);
    } else {
      ctx.globalAlpha = GHOST_FILL_ALPHA;
      ctx.fillRect(left, top, brush.w * scale, brush.h * scale);
    }
    ctx.globalAlpha = GHOST_STROKE_ALPHA;
    ctx.strokeRect(left, top, brush.w * scale, brush.h * scale);
  }

  // Fill region ghost: reconstructed locally against the converged doc from
  // just (layer, hover cell); raw cell lists are never streamed. With the
  // brush stamps in hand the region previews the actual pattern.
  if (!ghost && cursor && presence.tool === "fill" && presence.activeLayerId) {
    const layer = state.layers.find((l) => l.id === presence.activeLayerId);
    if (layer?.kind === "tile") {
      const cellX = Math.floor(cursor.x);
      const cellY = Math.floor(cursor.y);
      const cacheKey = `${presence.activeLayerId}|${cellX}|${cellY}`;
      let cache = caches.fill.get(member.clientId);
      if (!cache || cache.tiles !== layer.tiles || cache.key !== cacheKey) {
        cache = {
          tiles: layer.tiles,
          key: cacheKey,
          cells: computeFillCells(
            layer.tiles,
            cellX,
            cellY,
            FILL_GHOST_CELL_CAP
          )
        };
        caches.fill.set(member.clientId, cache);
      }
      const lookup = brush ? brushPatternLookup(brush) : null;
      if (cache.cells) {
        if (lookup && cache.cells.length <= TILE_DRAW_CAP) {
          ctx.globalAlpha = GHOST_TILE_ALPHA;
          for (const cell of cache.cells) {
            const tile = lookup(cell.x - cellX, cell.y - cellY);
            if (!tile) continue;
            drawTileOrFallback(ctx, art, tile, toX(cell.x), toY(cell.y), scale);
          }
        } else {
          ctx.globalAlpha = GHOST_FILL_ALPHA;
          for (const cell of cache.cells) {
            ctx.fillRect(toX(cell.x), toY(cell.y), scale, scale);
          }
        }
      } else {
        // Region unavailable (outside content or over the cap), so mark the
        // target cell only.
        ctx.globalAlpha = GHOST_STROKE_ALPHA;
        ctx.strokeRect(toX(cellX), toY(cellY), scale, scale);
      }
    }
  }

  if (ghost) {
    switch (ghost.kind) {
      case "line": {
        const from = { x: ghost.x1, y: ghost.y1 };
        const to = { x: ghost.x2, y: ghost.y2 };
        let drewTiles = false;
        const brushCells = brush ? brushStampCells(brush) : null;
        if (brushCells) {
          const cacheKey = `${from.x},${from.y}|${to.x},${to.y}`;
          let cache = caches.line.get(member.clientId);
          if (!cache || cache.key !== cacheKey || cache.source !== brushCells) {
            cache = {
              key: cacheKey,
              source: brushCells,
              stamps: stampsAlongLine(from, to, brushCells)
            };
            caches.line.set(member.clientId, cache);
          }
          if (cache.stamps.length <= TILE_DRAW_CAP) {
            drawStampCells(ctx, art, cache.stamps, to.x, to.y, proj);
            drewTiles = true;
          }
        }
        const x1 = toX(from.x + 0.5);
        const y1 = toY(from.y + 0.5);
        const x2 = toX(to.x + 0.5);
        const y2 = toY(to.y + 0.5);
        ctx.globalAlpha = GHOST_STROKE_ALPHA;
        ctx.lineWidth = drewTiles ? dpr : Math.max(2 * dpr, scale * 0.5);
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        break;
      }
      case "marquee": {
        ctx.globalAlpha = GHOST_FILL_ALPHA;
        ctx.fillRect(
          toX(ghost.x),
          toY(ghost.y),
          ghost.w * scale,
          ghost.h * scale
        );
        ctx.globalAlpha = GHOST_STROKE_ALPHA;
        if (ghost.tool === "erase") ctx.setLineDash([4 * dpr, 3 * dpr]);
        ctx.strokeRect(
          toX(ghost.x),
          toY(ghost.y),
          ghost.w * scale,
          ghost.h * scale
        );
        ctx.setLineDash([]);
        break;
      }
      case "polyline": {
        if (ghost.points.length > 1) {
          ctx.globalAlpha = GHOST_STROKE_ALPHA;
          ctx.lineWidth = 2 * dpr;
          ctx.beginPath();
          ctx.moveTo(toX(ghost.points[0].x), toY(ghost.points[0].y));
          for (let i = 1; i < ghost.points.length; i++) {
            ctx.lineTo(toX(ghost.points[i].x), toY(ghost.points[i].y));
          }
          ctx.stroke();
        }
        break;
      }
      case "entityGhost": {
        // The sprite itself renders through the WebGL layer; this outline
        // just attributes it to the peer.
        const { w, h } = entityFootprintTiles(ghost.entityType);
        const x = toX(ghost.tileX + 0.5 - w / 2);
        const y = toY(ghost.tileY + 1 - h);
        ctx.globalAlpha = GHOST_STROKE_ALPHA;
        ctx.strokeRect(x, y, w * scale, h * scale);
        break;
      }
      case "tileDrag": {
        // The dragged tiles still sit at their original keys in the shared
        // doc, so their real art is a local lookup away.
        const layer = presence.activeLayerId
          ? state.layers.find((l) => l.id === presence.activeLayerId)
          : undefined;
        const tiles = layer?.kind === "tile" ? layer.tiles : null;
        ctx.globalAlpha = GHOST_TILE_ALPHA;
        for (const key of ghost.keys) {
          const [x, y] = key.split(",").map(Number);
          drawTileOrFallback(
            ctx,
            art,
            tiles?.get(key),
            toX(x + ghost.dx),
            toY(y + ghost.dy),
            scale
          );
        }
        break;
      }
      default: {
        const unhandledGhost: never = ghost;
        void unhandledGhost;
        break;
      }
    }
  }
  ctx.restore();
}

function drawSelectionOutlines(
  ctx: CanvasRenderingContext2D,
  presence: PresenceState,
  state: ReturnType<typeof levelEditorStore.getState>,
  proj: Projection,
  entityIndexFor: (layers: EditorLayer[]) => Map<string, EntityPlacement>
): void {
  const selection = presence.selection;
  if (!selection) return;
  const { toX, toY, scale, dpr, color } = proj;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.globalAlpha = SELECTION_ALPHA;
  ctx.lineWidth = dpr;

  for (const key of selection.tileKeys) {
    const [x, y] = key.split(",").map(Number);
    ctx.strokeRect(toX(x), toY(y), scale, scale);
  }

  if (selection.entityIds.length > 0) {
    const byId = entityIndexFor(state.layers);
    for (const id of selection.entityIds) {
      const entity = byId.get(id);
      if (!entity) continue;
      const { width, height } = getEntityPixelSize(entity);
      const w = width / TILE_SIZE;
      const h = height / TILE_SIZE;
      ctx.strokeRect(
        toX(entity.tileX + 0.5 - w / 2),
        toY(entity.tileY + 1 - h),
        w * scale,
        h * scale
      );
    }
  }
  ctx.restore();
}
