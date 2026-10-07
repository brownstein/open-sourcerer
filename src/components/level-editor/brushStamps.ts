import { allTilesets } from "src/levels/tilesets/allTilesets";

import { LevelEditorState, TilePlacement, TileStamp } from "./levelEditorState";
import { transformStampOffset } from "./tileOrientation";

// The brush as it actually paints, shared by the canvas (local previews and
// strokes) and the presence layer (remote ghost reconstruction), so both
// sides always agree on stamp contents and anchoring.

/** Bounding box of a stamp set, in the stamps' own offset space. */
export function stampBounds(stamps: TileStamp[]): {
  minDx: number;
  minDy: number;
  w: number;
  h: number;
} {
  let minDx = Infinity;
  let minDy = Infinity;
  let maxDx = -Infinity;
  let maxDy = -Infinity;
  for (const s of stamps) {
    minDx = Math.min(minDx, s.dx);
    minDy = Math.min(minDy, s.dy);
    maxDx = Math.max(maxDx, s.dx);
    maxDy = Math.max(maxDy, s.dy);
  }
  return { minDx, minDy, w: maxDx - minDx + 1, h: maxDy - minDy + 1 };
}

/** Periodic lookup into a stamp pattern, anchored so the stamp appears at the
 *  fill origin exactly as it would paint there. Holes return undefined. */
export function patternLookup(
  stamps: TileStamp[]
): (relX: number, relY: number) => TilePlacement | undefined {
  const { minDx, minDy, w, h } = stampBounds(stamps);
  const cells = new Map<string, TilePlacement>();
  for (const s of stamps) {
    cells.set(`${s.dx - minDx},${s.dy - minDy}`, s.tile);
  }
  const mod = (n: number, m: number) => ((n % m) + m) % m;
  return (relX, relY) =>
    cells.get(`${mod(relX - minDx, w)},${mod(relY - minDy, h)}`);
}

/** Integer tile cells along a straight line (Bresenham). */
export function lineTiles(
  from: { x: number; y: number },
  to: { x: number; y: number }
): { x: number; y: number }[] {
  const points: { x: number; y: number }[] = [];
  let x = from.x;
  let y = from.y;
  const dx = Math.abs(to.x - x);
  const dy = -Math.abs(to.y - y);
  const sx = x < to.x ? 1 : -1;
  const sy = y < to.y ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    points.push({ x, y });
    if (x === to.x && y === to.y) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
  return points;
}

/** The brush stamped at every cell of a line, expressed as offsets from the
 *  line's endpoint (where the preview is anchored). */
export function stampsAlongLine(
  from: { x: number; y: number },
  to: { x: number; y: number },
  stamps: TileStamp[]
): TileStamp[] {
  const byCell = new Map<string, TileStamp>();
  for (const p of lineTiles(from, to)) {
    for (const s of stamps) {
      const dx = p.x - to.x + s.dx;
      const dy = p.y - to.y + s.dy;
      byCell.set(`${dx},${dy}`, { dx, dy, tile: s.tile });
    }
  }
  return [...byCell.values()];
}

/** Shift stamp offsets so the cursor sits at the brush's center (Tiled-style)
 *  rather than its top-left cell. */
function centerStamp(stamps: TileStamp[]): TileStamp[] {
  let w = 0;
  let h = 0;
  for (const s of stamps) {
    w = Math.max(w, s.dx + 1);
    h = Math.max(h, s.dy + 1);
  }
  const ox = Math.floor(w / 2);
  const oy = Math.floor(h / 2);
  if (!ox && !oy) return stamps;
  return stamps.map((s) => ({ ...s, dx: s.dx - ox, dy: s.dy - oy }));
}

/** A palette region selection by reference: expands to the same stamps on
 *  any client, so it can travel over the wire instead of raw cells. */
export type BrushRegionRef = {
  tilesetName: string;
  startId: number;
  width: number;
  height: number;
  flipH: boolean;
  flipV: boolean;
  flipD: boolean;
};

/** Centered stamps for a palette region (a single tile is a 1x1 region),
 *  with cell offsets transformed by the brush orientation. */
export function regionStamps(region: BrushRegionRef): TileStamp[] {
  const tileset = allTilesets[region.tilesetName];
  const columns = tileset?.tileSetJson?.columns ?? 1;
  const startCol = region.startId % columns;
  const startRow = Math.floor(region.startId / columns);
  const orientation = {
    flipH: region.flipH,
    flipV: region.flipV,
    flipD: region.flipD
  };
  const stamps: TileStamp[] = [];

  for (let row = 0; row < region.height; row++) {
    for (let col = 0; col < region.width; col++) {
      const gid = (startRow + row) * columns + (startCol + col);
      const placement: TilePlacement = {
        gid,
        tilesetName: region.tilesetName
      };
      if (region.flipH) placement.flipH = true;
      if (region.flipV) placement.flipV = true;
      if (region.flipD) placement.flipD = true;
      const { dx, dy } = transformStampOffset(
        col,
        row,
        region.width,
        region.height,
        orientation
      );
      stamps.push({ dx, dy, tile: placement });
    }
  }
  return centerStamp(stamps);
}

/** The current palette selection as a region reference, or null when nothing
 *  (or a captured brush) is selected. The single derivation shared by local
 *  painting and the presence wire format, so peers always expand the same
 *  region the painter stamps. */
export function currentBrushRegionRef(
  state: LevelEditorState
): BrushRegionRef | null {
  if (state.capturedBrush || state.selectedTileId === null) return null;
  const region = state.selectedTileRegion;
  return {
    tilesetName: state.selectedTilesetName,
    startId: region?.startId ?? state.selectedTileId,
    width: region?.width ?? 1,
    height: region?.height ?? 1,
    flipH: state.flipH,
    flipV: state.flipV,
    flipD: state.flipD
  };
}

/** The current brush as centered stamp offsets: the captured brush verbatim,
 *  or the palette selection (single tile or region) with the active flips
 *  applied. Null when nothing is selected. */
export function currentBrushStamps(
  state: LevelEditorState
): TileStamp[] | null {
  if (state.capturedBrush) return centerStamp(state.capturedBrush);
  const region = currentBrushRegionRef(state);
  return region ? regionStamps(region) : null;
}
