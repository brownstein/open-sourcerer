import pointInPolygon from "point-in-polygon";

import { arr2 } from "src/engine/util/vecTypes";

import {
  PolygonAndHoles,
  arr2Polygon,
  sanitizePolygonAndHoles
} from "./polygons";

// Merges a set of grid cells (full unit quads and partially-clipped "edge"
// cells) into the outline polygons of their union, mimicking the terrain
// tile-merging algorithm (mergeTerrain.ts) rather than running an expensive
// polygon-boolean union.
//
// Conceptually this is marching squares generalized to partial cells:
//   * Grid-line cell sides cancel against the neighbour across the line via a
//     1D occupancy XOR (the marching-squares skeleton). Two adjacent full cells
//     share a fully-solid side -> it cancels; a cell beside empty space emits
//     its whole side; two edge cells sharing a line cancel only the sub-interval
//     solid on both sides.
//   * Every edge-cell boundary segment that is NOT on a cell side (the real
//     clipped shape boundary slicing through the cell) is never cancelled and is
//     always stitched into the final perimeter.
//
// All emitted segments are directed interior-on-left (CCW), so they chain into
// loops by shared endpoints. Loops are classified by signed area (CCW = outer,
// CW = hole) and holes nested into their containing outer.

export type MergeCellInput = {
  gx: number;
  gy: number;
  full: boolean;
  // Clipped polygon for edge cells, in world coords (required when !full).
  edgePoly?: arr2Polygon;
};

// Tolerance (in grid-cell units) for snapping near-boundary vertices and for
// floating-point endpoint matching during the stitch.
const EPS = 1e-6;
// Quantization for endpoint hash keys (grid space).
const Q = 1e6;

type Interval = [number, number];

type EdgeCellSides = {
  // Solid intervals along this cell's sides, in absolute grid coords:
  // left/right run along v (y) within [gy, gy+1]; bottom/top along u (x).
  left: Interval[];
  right: Interval[];
  bottom: Interval[];
  top: Interval[];
};

type CellRec = {
  full: boolean;
  sides?: EdgeCellSides;
};

type Seg = { a: arr2; b: arr2 };

const key = (gx: number, gy: number) => `${gx}:${gy}`;
const ptKey = (p: arr2) =>
  `${Math.round(p[0] * Q) / Q},${Math.round(p[1] * Q) / Q}`;

// Snaps a coordinate to an integer cell boundary if it is within EPS of one of
// this cell's bounding lines, so on-line edges land exactly on the grid and
// share identical endpoints with the interior-cut edges that meet them.
function snapToBoundary(value: number, lo: number, hi: number): number {
  if (Math.abs(value - lo) < EPS) return lo;
  if (Math.abs(value - hi) < EPS) return hi;
  return value;
}

// Splits an edge cell's clipped polygon into per-side solid intervals plus the
// interior-cut edges (emitted directly into the segment pool).
function classifyEdgeCell(
  gx: number,
  gy: number,
  edgePolyWorld: arr2Polygon,
  cellSize: number,
  originX: number,
  originY: number,
  interiorOut: Seg[]
): EdgeCellSides {
  // Convert to grid space and snap near-boundary vertices.
  const poly: arr2[] = edgePolyWorld.map(([x, y]) => {
    const u = snapToBoundary((x - originX) / cellSize, gx, gx + 1);
    const v = snapToBoundary((y - originY) / cellSize, gy, gy + 1);
    return [u, v];
  });

  const sides: EdgeCellSides = { left: [], right: [], bottom: [], top: [] };

  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];

    // Vertical edge on a cell side?
    if (Math.abs(p[0] - q[0]) < EPS) {
      const xc = Math.round(p[0]);
      if (Math.abs(p[0] - xc) < EPS && (xc === gx || xc === gx + 1)) {
        const interval: Interval = [
          Math.min(p[1], q[1]),
          Math.max(p[1], q[1])
        ];
        if (interval[1] - interval[0] > EPS) {
          (xc === gx ? sides.left : sides.right).push(interval);
        }
        continue;
      }
    }

    // Horizontal edge on a cell side?
    if (Math.abs(p[1] - q[1]) < EPS) {
      const yc = Math.round(p[1]);
      if (Math.abs(p[1] - yc) < EPS && (yc === gy || yc === gy + 1)) {
        const interval: Interval = [
          Math.min(p[0], q[0]),
          Math.max(p[0], q[0])
        ];
        if (interval[1] - interval[0] > EPS) {
          (yc === gy ? sides.bottom : sides.top).push(interval);
        }
        continue;
      }
    }

    // Interior-cut edge: emit directly (already CCW = interior-on-left).
    interiorOut.push({ a: [p[0], p[1]], b: [q[0], q[1]] });
  }

  return sides;
}

function intervalsCover(intervals: Interval[], p: number): boolean {
  for (const [lo, hi] of intervals) {
    if (p >= lo && p <= hi) return true;
  }
  return false;
}

// Sub-intervals of [baseLo, baseHi] where exactly one of A / B is solid. For
// each, side === "a" means A is the solid side, "b" means B.
function xorIntervals(
  a: Interval[],
  b: Interval[],
  baseLo: number,
  baseHi: number
): Array<{ lo: number; hi: number; side: "a" | "b" }> {
  const bps = new Set<number>([baseLo, baseHi]);
  for (const [lo, hi] of a) {
    if (lo > baseLo && lo < baseHi) bps.add(lo);
    if (hi > baseLo && hi < baseHi) bps.add(hi);
  }
  for (const [lo, hi] of b) {
    if (lo > baseLo && lo < baseHi) bps.add(lo);
    if (hi > baseLo && hi < baseHi) bps.add(hi);
  }
  const sorted = [...bps].sort((x, y) => x - y);
  const out: Array<{ lo: number; hi: number; side: "a" | "b" }> = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const lo = sorted[i];
    const hi = sorted[i + 1];
    if (hi - lo < EPS) continue;
    const mid = (lo + hi) * 0.5;
    const aCov = intervalsCover(a, mid);
    const bCov = intervalsCover(b, mid);
    if (aCov === bCov) continue;
    out.push({ lo, hi, side: aCov ? "a" : "b" });
  }
  return out;
}

// Splits a closed vertex ring into simple sub-loops at any repeated vertex
// (where the perimeter touches itself, e.g. at a saddle). Each touch point is
// kept by both the spliced-off sub-loop and the remaining outer path, so the
// sub-loops are individually simple and their areas sum to the original.
function splitSelfTouchingLoop(ring: arr2[]): arr2[][] {
  const out: arr2[][] = [];
  const stack: arr2[] = [];
  const seen = new Map<string, number>();
  for (const p of ring) {
    const k = ptKey(p);
    const at = seen.get(k);
    if (at !== undefined) {
      // Pop the sub-loop from the earlier occurrence to the top of the stack.
      const sub = stack.splice(at);
      for (const q of sub) seen.delete(ptKey(q));
      if (sub.length >= 3) out.push(sub);
      // Re-add the touch point as the continuing outer path's vertex.
      seen.set(k, stack.length);
      stack.push(p);
    } else {
      seen.set(k, stack.length);
      stack.push(p);
    }
  }
  if (stack.length >= 3) out.push(stack);
  return out;
}

function shoelace(poly: arr2[]): number {
  let total = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    total += a[0] * b[1] - a[1] * b[0];
  }
  return total * 0.5;
}

// A point guaranteed to lie just inside a simple polygon: the first edge's
// midpoint nudged along its inward normal (the side depends on winding). Robust
// for the rectilinear cell loops here; avoids polygon-utils' area-weighted
// centroid, which can fall outside (or far from) concave / clockwise rings.
function interiorPoint(ring: arr2[]): arr2 {
  const area = shoelace(ring);
  const v0 = ring[0];
  const v1 = ring[1];
  const dx = v1[0] - v0[0];
  const dy = v1[1] - v0[1];
  const len = Math.hypot(dx, dy) || 1;
  // Interior is on the right of travel for CW (area < 0), the left for CCW.
  const nx = (area < 0 ? dy : -dy) / len;
  const ny = (area < 0 ? -dx : dx) / len;
  const nudge = len * 1e-3;
  return [(v0[0] + v1[0]) * 0.5 + nx * nudge, (v0[1] + v1[1]) * 0.5 + ny * nudge];
}

export function mergeCellsToPolygons(
  cells: Iterable<MergeCellInput>,
  cellSize: number,
  originX: number,
  originY: number
): PolygonAndHoles[] {
  const occ = new Map<string, CellRec>();
  const segments: Seg[] = [];

  // Index cells; split edge cells into side intervals + interior-cut edges.
  for (const cell of cells) {
    const { gx, gy, full, edgePoly } = cell;
    if (full) {
      occ.set(key(gx, gy), { full: true });
    } else if (edgePoly && edgePoly.length >= 3) {
      const sides = classifyEdgeCell(
        gx,
        gy,
        edgePoly,
        cellSize,
        originX,
        originY,
        segments
      );
      occ.set(key(gx, gy), { full: false, sides });
    }
  }

  if (occ.size === 0) return [];

  // Solid intervals on one side of a cell, in absolute grid coords.
  const sideIntervals = (
    rec: CellRec | undefined,
    gx: number,
    gy: number,
    side: keyof EdgeCellSides
  ): Interval[] => {
    if (!rec) return [];
    if (rec.full) {
      return side === "left" || side === "right"
        ? [[gy, gy + 1]]
        : [[gx, gx + 1]];
    }
    return rec.sides ? rec.sides[side] : [];
  };

  // Enumerate the grid-line slots that bound any cell (deduped).
  const vSlots = new Set<string>();
  const hSlots = new Set<string>();
  for (const k of occ.keys()) {
    const [gx, gy] = k.split(":").map(Number);
    vSlots.add(`${gx}:${gy}`); // left line  (x = gx)
    vSlots.add(`${gx + 1}:${gy}`); // right line (x = gx+1)
    hSlots.add(`${gx}:${gy}`); // bottom line (y = gy)
    hSlots.add(`${gx}:${gy + 1}`); // top line   (y = gy+1)
  }

  // Vertical slots: line x = X over row [y, y+1]. A = left cell (solid -x),
  // B = right cell (solid +x).
  for (const slot of vSlots) {
    const [x, y] = slot.split(":").map(Number);
    const left = occ.get(key(x - 1, y));
    const right = occ.get(key(x, y));
    if (!left && !right) continue;
    const a = sideIntervals(left, x - 1, y, "right");
    const b = sideIntervals(right, x, y, "left");
    for (const { lo, hi, side } of xorIntervals(a, b, y, y + 1)) {
      if (side === "a") {
        // Interior on -x -> travel +y.
        segments.push({ a: [x, lo], b: [x, hi] });
      } else {
        // Interior on +x -> travel -y.
        segments.push({ a: [x, hi], b: [x, lo] });
      }
    }
  }

  // Horizontal slots: line y = Y over column [x, x+1]. A = below cell (solid
  // -y), B = above cell (solid +y).
  for (const slot of hSlots) {
    const [x, yY] = slot.split(":").map(Number);
    const below = occ.get(key(x, yY - 1));
    const above = occ.get(key(x, yY));
    if (!below && !above) continue;
    const a = sideIntervals(below, x, yY - 1, "top");
    const b = sideIntervals(above, x, yY, "bottom");
    for (const { lo, hi, side } of xorIntervals(a, b, x, x + 1)) {
      if (side === "a") {
        // Interior on -y -> travel -x.
        segments.push({ a: [hi, yY], b: [lo, yY] });
      } else {
        // Interior on +y -> travel +x.
        segments.push({ a: [lo, yY], b: [hi, yY] });
      }
    }
  }

  // Stitch directed segments into loops. For every vertex, pair each incoming
  // segment with an outgoing one via the turn rule, building a `next` pointer.
  // This is a per-vertex bijection independent of traversal order, so pinch
  // (saddle) vertices — where two diagonally-touching regions meet at a point —
  // resolve consistently into separate, non-self-crossing loops.
  const outgoing = new Map<string, number[]>();
  for (let i = 0; i < segments.length; i++) {
    const k = ptKey(segments[i].a);
    const list = outgoing.get(k);
    if (list) list.push(i);
    else outgoing.set(k, [i]);
  }

  const next = new Array<number>(segments.length).fill(-1);
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const candidates = outgoing.get(ptKey(seg.b));
    if (!candidates) continue;
    // Incoming heading at vertex seg.b.
    const dinx = seg.b[0] - seg.a[0];
    const diny = seg.b[1] - seg.a[1];
    let best = -1;
    let bestAngle = -Infinity;
    for (const ci of candidates) {
      const c = segments[ci];
      // Never U-turn back along the same edge (would always win the angle test).
      if (ptKey(c.b) === ptKey(seg.a)) continue;
      const doutx = c.b[0] - c.a[0];
      const douty = c.b[1] - c.a[1];
      // Signed turn angle from incoming to outgoing; pick most CCW so a saddle's
      // two regions stay separate.
      const cross = dinx * douty - diny * doutx;
      const dot = dinx * doutx + diny * douty;
      const angle = Math.atan2(cross, dot);
      if (angle > bestAngle) {
        bestAngle = angle;
        best = ci;
      }
    }
    next[i] = best;
  }

  const visited = new Array<boolean>(segments.length).fill(false);
  const loops: arr2[][] = [];
  const maxSteps = segments.length + 1;

  for (let start = 0; start < segments.length; start++) {
    if (visited[start]) continue;
    const ring: arr2[] = [];
    let cur = start;
    let steps = 0;
    let ok = true;
    while (!visited[cur]) {
      visited[cur] = true;
      ring.push(segments[cur].a);
      cur = next[cur];
      if (cur < 0 || ++steps > maxSteps) {
        ok = false;
        break;
      }
    }
    // A loop can touch itself at a pinch (saddle) vertex; split it into simple
    // sub-loops there so the consistent CCW winding survives sanitization.
    if (ok && ring.length >= 3) {
      for (const simple of splitSelfTouchingLoop(ring)) {
        if (simple.length >= 3) loops.push(simple);
      }
    }
  }

  // Convert to world space and classify outer vs hole by winding.
  const toWorld = (ring: arr2[]): arr2[] =>
    ring.map(([u, v]) => [originX + u * cellSize, originY + v * cellSize]);

  const outers: arr2Polygon[] = [];
  const holes: arr2Polygon[] = [];
  for (const ring of loops) {
    const area = shoelace(ring);
    if (Math.abs(area) < EPS) continue;
    const world = toWorld(ring);
    if (area > 0) outers.push(world);
    else holes.push(world);
  }

  const results: PolygonAndHoles[] = outers.map((outer) => ({
    outer,
    holes: []
  }));

  // Nest each hole into the smallest-area containing outer.
  for (const hole of holes) {
    const probe = interiorPoint(hole);
    let bestIdx = -1;
    let bestArea = Infinity;
    for (let i = 0; i < results.length; i++) {
      if (!pointInPolygon(probe, results[i].outer)) continue;
      const a = Math.abs(shoelace(results[i].outer));
      if (a < bestArea) {
        bestArea = a;
        bestIdx = i;
      }
    }
    if (bestIdx !== -1) results[bestIdx].holes.push(hole);
  }

  return results.map(sanitizePolygonAndHoles);
}
