/**
 * tileset-editor.ts
 *
 * Interactive terminal UI for browsing, classifying, and generating collision
 * data for Tiled .tsj tileset files.
 *
 * Usage:
 *   node scripts/ts/tileset-editor.js
 *   npm run tileset-editor
 */
import fs from "fs";
import path from "path";
import { PNG } from "pngjs";

// ============================================================================
// Types
// ============================================================================

interface Point {
  x: number;
  y: number;
}

interface TileClassification {
  type: string;
  polygon: Point[];
}

interface TsjTile {
  id: number;
  type?: string;
  objectgroup?: TsjObjectGroup;
}

interface TsjObjectGroup {
  draworder: string;
  name: string;
  objects: TsjObject[];
  opacity: number;
  type: string;
  visible: boolean;
  x: number;
  y: number;
}

interface TsjObject {
  height: number;
  id: number;
  name: string;
  polygon?: Point[];
  rotation: number;
  type: string;
  visible: boolean;
  width: number;
  x: number;
  y: number;
}

interface TsjFile {
  columns: number;
  image: string;
  imageheight: number;
  imagewidth: number;
  margin: number;
  name: string;
  spacing: number;
  tilecount: number;
  tiledversion: string;
  tileheight: number;
  tiles: TsjTile[];
  tilewidth: number;
  type: string;
  version: string;
}

interface TilesetConfig {
  tileSize: number;
  alphaThreshold: number;
  fillThreshold: number;
  epsilon: number;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_CONFIG: TilesetConfig = {
  tileSize: 16,
  alphaThreshold: 128,
  fillThreshold: 0.03,
  epsilon: 1.5
};

const FULL_TILE_COLLISION_TYPES = new Set([
  "ladder",
  "water",
  "waterfall",
  "spikes",
  "decal"
]);

const VALID_TILE_TYPES = [
  "ground",
  "platform",
  "slopediagleft",
  "slopediagright",
  "stairsdiagleft",
  "stairsdiagright",
  "platformdiagleft",
  "platformdiagright",
  "ladder",
  "spikes",
  "water",
  "waterfall",
  "decal"
];

// ============================================================================
// Tileset analysis functions
// ============================================================================

function loadTsjFile(tsjPath: string): TsjFile {
  return JSON.parse(fs.readFileSync(path.resolve(tsjPath), "utf-8"));
}

function loadPng(tsjData: TsjFile, tsjDir: string): PNG {
  const pngPath = path.resolve(tsjDir, tsjData.image);
  if (!fs.existsSync(pngPath)) {
    throw new Error(`PNG not found: ${pngPath}`);
  }
  return PNG.sync.read(fs.readFileSync(pngPath));
}

function computeTileData(
  png: PNG,
  tsjData: TsjFile,
  config: TilesetConfig
): { fillRatios: number[]; masks: (boolean[][] | null)[] } {
  const { tileSize, alphaThreshold, fillThreshold } = config;
  const columns = tsjData.columns;
  const fillRatios: number[] = new Array(tsjData.tilecount).fill(0);
  const masks: (boolean[][] | null)[] = new Array(tsjData.tilecount).fill(null);

  for (let tileId = 0; tileId < tsjData.tilecount; tileId++) {
    const col = tileId % columns;
    const row = Math.floor(tileId / columns);
    const mask = extractAlphaMask(
      png,
      col * tileSize,
      row * tileSize,
      tileSize,
      tileSize,
      alphaThreshold
    );
    const ratio = countOpaque(mask) / (tileSize * tileSize);
    fillRatios[tileId] = ratio;
    masks[tileId] = ratio >= fillThreshold ? mask : null;
  }
  return { fillRatios, masks };
}

function extractAlphaMask(
  png: PNG,
  startX: number,
  startY: number,
  width: number,
  height: number,
  alphaThreshold: number
): boolean[][] {
  const mask: boolean[][] = [];
  for (let y = 0; y < height; y++) {
    const row: boolean[] = [];
    for (let x = 0; x < width; x++) {
      const px = startX + x;
      const py = startY + y;
      if (px >= png.width || py >= png.height) row.push(false);
      else {
        const idx = (py * png.width + px) * 4;
        row.push(png.data[idx + 3] >= alphaThreshold);
      }
    }
    mask.push(row);
  }
  return mask;
}

function countOpaque(mask: boolean[][]): number {
  let count = 0;
  for (const row of mask) for (const px of row) if (px) count++;
  return count;
}

function classifyTileType(mask: boolean[][], fillRatio: number): string | null {
  const height = mask.length;
  const width = mask[0].length;
  let minY = height,
    maxY = -1,
    minX = width,
    maxX = -1;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      if (mask[y][x]) {
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
      }
  if (maxY < 0) return null;
  if (fillRatio >= 0.95) return "ground";
  return classifyType(mask, fillRatio, maxY - minY + 1, maxX - minX + 1);
}

function classifyType(
  mask: boolean[][],
  fillRatio: number,
  boundingHeight: number,
  boundingWidth: number
): string {
  const height = mask.length;
  const width = mask[0].length;

  if (fillRatio > 0.08) {
    const slopeDir = detectUpwardSlope(mask);
    if (slopeDir === "left") return "slopediagleft";
    if (slopeDir === "right") return "slopediagright";
  }

  if (boundingHeight <= height / 2 && boundingWidth >= width * 0.5) {
    const rectangularity = countOpaque(mask) / (boundingHeight * boundingWidth);
    if (rectangularity > 0.7) return "platform";
  }
  return "ground";
}

function detectUpwardSlope(mask: boolean[][]): "left" | "right" | null {
  const height = mask.length;
  const width = mask[0].length;

  const topSurface: (number | null)[] = [];
  const bottomSurface: (number | null)[] = [];
  for (let x = 0; x < width; x++) {
    let top: number | null = null;
    for (let y = 0; y < height; y++)
      if (mask[y][x]) {
        top = y;
        break;
      }
    topSurface.push(top);
    let bottom: number | null = null;
    for (let y = height - 1; y >= 0; y--)
      if (mask[y][x]) {
        bottom = y;
        break;
      }
    bottomSurface.push(bottom);
  }

  const filledColumns: number[] = [];
  for (let x = 0; x < width; x++)
    if (topSurface[x] !== null) filledColumns.push(x);
  if (filledColumns.length < width * 0.3) return null;

  const firstCol = filledColumns[0];
  const lastCol = filledColumns[filledColumns.length - 1];
  const leftTop = topSurface[firstCol]!;
  const rightTop = topSurface[lastCol]!;
  const leftBottom = bottomSurface[firstCol]!;
  const rightBottom = bottomSurface[lastCol]!;

  const topDiff = rightTop - leftTop;
  const bottomDiff = rightBottom - leftBottom;
  const bottomFlat = Math.abs(bottomDiff) <= 3;
  const bottomReachesDown =
    leftBottom >= height - 4 || rightBottom >= height - 4;

  if (Math.abs(topDiff) >= height / 4 && bottomFlat && bottomReachesDown) {
    if (hasDiagonalSurface(topSurface, filledColumns))
      return topDiff > 0 ? "right" : "left";
  }
  if (Math.abs(topDiff) >= height / 4 && Math.abs(bottomDiff) >= height / 4) {
    if (
      (leftBottom >= height - 2 || rightBottom >= height - 2) &&
      hasDiagonalSurface(topSurface, filledColumns)
    )
      return topDiff > 0 ? "right" : "left";
  }
  return null;
}

function hasDiagonalSurface(
  surface: (number | null)[],
  filledColumns: number[]
): boolean {
  if (filledColumns.length < 3) return false;
  const startVal = surface[filledColumns[0]]!;
  const endVal = surface[filledColumns[filledColumns.length - 1]]!;
  const totalChange = endVal - startVal;
  if (Math.abs(totalChange) < 4) return false;
  const direction = totalChange > 0 ? 1 : -1;
  let violations = 0;
  for (let i = 1; i < filledColumns.length; i++) {
    const change = surface[filledColumns[i]]! - surface[filledColumns[i - 1]]!;
    if (change * direction < -2) violations++;
  }
  return violations / filledColumns.length < 0.15;
}

// --- Polygon generation ---

function generatePolygon(mask: boolean[][], epsilon: number): Point[] {
  const height = mask.length;
  const width = mask[0].length;
  const leftBoundary: (number | null)[] = [];
  const rightBoundary: (number | null)[] = [];

  for (let y = 0; y < height; y++) {
    let left: number | null = null,
      right: number | null = null;
    for (let x = 0; x < width; x++) {
      if (mask[y][x]) {
        if (left === null) left = x;
        right = x + 1;
      }
    }
    leftBoundary.push(left);
    rightBoundary.push(right);
  }

  let firstRow = -1,
    lastRow = -1;
  for (let y = 0; y < height; y++) {
    if (leftBoundary[y] !== null) {
      if (firstRow === -1) firstRow = y;
      lastRow = y;
    }
  }
  if (firstRow === -1) return [];

  const raw: Point[] = [];
  raw.push({ x: leftBoundary[firstRow]!, y: firstRow });
  if (rightBoundary[firstRow]! !== leftBoundary[firstRow]!)
    raw.push({ x: rightBoundary[firstRow]!, y: firstRow });
  for (let y = firstRow + 1; y <= lastRow; y++)
    if (rightBoundary[y] !== null) raw.push({ x: rightBoundary[y]!, y });
  raw.push({ x: rightBoundary[lastRow]!, y: lastRow + 1 });
  if (leftBoundary[lastRow]! !== rightBoundary[lastRow]!)
    raw.push({ x: leftBoundary[lastRow]!, y: lastRow + 1 });
  for (let y = lastRow - 1; y > firstRow; y--)
    if (leftBoundary[y] !== null) raw.push({ x: leftBoundary[y]!, y });

  return simplifyClosedPolygon(raw, epsilon).map((p) => ({
    x: Math.round(p.x),
    y: Math.round(p.y)
  }));
}

function simplifyClosedPolygon(points: Point[], epsilon: number): Point[] {
  if (points.length <= 3) return points;
  let maxDist = 0,
    splitA = 0,
    splitB = 0;
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const dx = points[i].x - points[j].x,
        dy = points[i].y - points[j].y;
      const dist = dx * dx + dy * dy;
      if (dist > maxDist) {
        maxDist = dist;
        splitA = i;
        splitB = j;
      }
    }
  }
  const first = douglasPeucker(points.slice(splitA, splitB + 1), epsilon);
  const second = douglasPeucker(
    [...points.slice(splitB), ...points.slice(0, splitA + 1)],
    epsilon
  );
  const result = [...first];
  for (let i = 1; i < second.length - 1; i++) result.push(second[i]);
  return result;
}

function douglasPeucker(points: Point[], epsilon: number): Point[] {
  if (points.length <= 2) return points;
  let maxDist = 0,
    maxIdx = 0;
  const first = points[0],
    last = points[points.length - 1];
  for (let i = 1; i < points.length - 1; i++) {
    const dist = perpDist(points[i], first, last);
    if (dist > maxDist) {
      maxDist = dist;
      maxIdx = i;
    }
  }
  if (maxDist > epsilon) {
    const left = douglasPeucker(points.slice(0, maxIdx + 1), epsilon);
    const right = douglasPeucker(points.slice(maxIdx), epsilon);
    return [...left.slice(0, -1), ...right];
  }
  return [first, last];
}

function perpDist(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

// --- Slope polygon processing ---

const SLOPE_MISMATCH_THRESHOLD = 0.15;
const SLOPE_COVERAGE_THRESHOLD = 0.9;
const SLOPE_EDGE_TOLERANCE = 3;
const SLOPE_SNAP = 1.5;
const GROUND_SOLID_AREA_THRESHOLD = 0.75;
const GROUND_NEAR_CORNER_DISTANCE = 3;

/**
 * Compute the bottom surface profile: for each column x, the y+1 of the last
 * opaque pixel (top-down). Returns null for fully transparent columns.
 * This is the mirror of computeTopSurface, used for inverted slopes where
 * the solid area is at the top and the surface boundary faces downward.
 */
function computeBottomSurface(mask: boolean[][]): (number | null)[] {
  const height = mask.length;
  const width = mask[0].length;
  const surface: (number | null)[] = [];
  for (let x = 0; x < width; x++) {
    let bottom: number | null = null;
    for (let y = height - 1; y >= 0; y--) {
      if (mask[y][x]) {
        bottom = y + 1;
        break;
      }
    }
    surface.push(bottom);
  }
  return surface;
}

/**
 * Compute the top surface profile: for each column x, the y of the first
 * opaque pixel (top-down). Returns null for fully transparent columns.
 */
function computeTopSurface(mask: boolean[][]): (number | null)[] {
  const height = mask.length;
  const width = mask[0].length;
  const surface: (number | null)[] = [];
  for (let x = 0; x < width; x++) {
    let top: number | null = null;
    for (let y = 0; y < height; y++) {
      if (mask[y][x]) {
        top = y;
        break;
      }
    }
    surface.push(top);
  }
  return surface;
}

/**
 * Fit a straight line y = slope*x + intercept to the top surface using
 * least-squares regression. Returns the fit parameters and R² metric.
 * Only uses columns with opaque data.
 */
function fitSurfaceLine(topSurface: (number | null)[]): {
  slope: number;
  intercept: number;
  r2: number;
  leftY: number;
  rightY: number;
  coverage: number;
} | null {
  const tileSize = topSurface.length;
  const points: { x: number; y: number }[] = [];
  for (let x = 0; x < tileSize; x++) {
    if (topSurface[x] !== null) {
      points.push({ x, y: topSurface[x]! });
    }
  }
  const coverage = points.length / tileSize;
  if (points.length < 2) return null;

  // LSQ regression for R² computation
  const n = points.length;
  let sumX = 0,
    sumY = 0,
    sumXX = 0,
    sumXY = 0;
  for (const p of points) {
    sumX += p.x;
    sumY += p.y;
    sumXX += p.x * p.x;
    sumXY += p.x * p.y;
  }
  const meanX = sumX / n;
  const meanY = sumY / n;
  const denom = sumXX - n * meanX * meanX;
  if (Math.abs(denom) < 1e-10) return null;

  const slope = (sumXY - n * meanX * meanY) / denom;
  const intercept = meanY - slope * meanX;

  // R²
  let ssTot = 0,
    ssRes = 0;
  for (const p of points) {
    ssTot += (p.y - meanY) ** 2;
    ssRes += (p.y - (slope * p.x + intercept)) ** 2;
  }
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 1;

  // Use endpoint-based fitting for the actual polygon (NOT LSQ)
  // This avoids the LSQ regression distortion on half-slope tiles
  const firstPoint = points[0];
  const lastPoint = points[points.length - 1];
  const endSlope = (lastPoint.y - firstPoint.y) / (lastPoint.x - firstPoint.x);
  const endIntercept = firstPoint.y - endSlope * firstPoint.x;
  const leftY = endIntercept; // y at x=0
  const rightY = endSlope * (tileSize - 1) + endIntercept; // y at x=tileSize-1

  return {
    slope: endSlope,
    intercept: endIntercept,
    r2,
    leftY,
    rightY,
    coverage
  };
}

/**
 * Build a clipped slope polygon from left/right surface Y values.
 * The polygon traces: top surface (the slope line) clipped to tile rect,
 * then the bottom of the tile.
 *
 * snap: snap Y values within this tolerance of tile edges to exact 0 or tileSize.
 */
function buildClippedSlopePolygon(
  leftY: number,
  rightY: number,
  tileSize: number,
  snap: number = SLOPE_SNAP
): Point[] {
  // Snap near-edge values
  const snapVal = (v: number) => {
    if (Math.abs(v) <= snap) return 0;
    if (Math.abs(v - tileSize) <= snap) return tileSize;
    return v;
  };

  const lY = snapVal(leftY);
  const rY = snapVal(rightY);

  // The slope line goes from (0, lY) to (tileSize, rY).
  // We need to properly clip this line to the tile rect [0,tileSize]×[0,tileSize],
  // then build a polygon tracing: slope surface → bottom edge.
  // This handles cases where the line extends beyond tile bounds (steep vertical slopes).

  const slopeRate = (rY - lY) / tileSize; // dy/dx

  // Find x where line crosses a given y
  const xAtY = (targetY: number): number => {
    if (Math.abs(slopeRate) < 1e-10) return targetY <= lY ? 0 : tileSize;
    return (targetY - lY) / slopeRate;
  };

  // Find y at a given x
  const yAtX = (x: number): number => lY + slopeRate * x;

  // Compute the clipped slope segment endpoints within the tile rect.
  // The slope surface starts from the left/top/bottom edge and ends at the right/top/bottom edge.
  let startX: number, startY: number, endX: number, endY: number;

  if (lY >= 0 && lY <= tileSize) {
    startX = 0;
    startY = lY;
  } else if (lY < 0) {
    // Line enters through top edge (y=0)
    startX = xAtY(0);
    startY = 0;
  } else {
    // Line enters through bottom edge (y=tileSize)
    startX = xAtY(tileSize);
    startY = tileSize;
  }

  if (rY >= 0 && rY <= tileSize) {
    endX = tileSize;
    endY = rY;
  } else if (rY < 0) {
    // Line exits through top edge (y=0)
    endX = xAtY(0);
    endY = 0;
  } else {
    // Line exits through bottom edge (y=tileSize)
    endX = xAtY(tileSize);
    endY = tileSize;
  }

  // Round coordinates
  startX = Math.round(startX);
  startY = Math.round(startY);
  endX = Math.round(endX);
  endY = Math.round(endY);

  // Clamp to tile rect
  startX = Math.max(0, Math.min(tileSize, startX));
  startY = Math.max(0, Math.min(tileSize, startY));
  endX = Math.max(0, Math.min(tileSize, endX));
  endY = Math.max(0, Math.min(tileSize, endY));

  // Build polygon: slope surface → bottom edge (filled area below slope)
  const polygon: Point[] = [];

  // Slope start
  polygon.push({ x: startX, y: startY });
  // Slope end (skip if same as start)
  if (startX !== endX || startY !== endY) {
    polygon.push({ x: endX, y: endY });
  }
  // Bottom-right corner (if not already there)
  if (endX !== tileSize || endY !== tileSize) {
    // If slope ends on top edge, add top-right corner first
    if (endY === 0 && endX < tileSize) {
      polygon.push({ x: tileSize, y: 0 });
    }
    polygon.push({ x: tileSize, y: tileSize });
  }
  // Bottom-left corner (if not already there)
  if (startX !== 0 || startY !== tileSize) {
    polygon.push({ x: 0, y: tileSize });
    // If slope enters through top edge (steep slope), add top-left corner
    // so the polygon includes the solid rectangular area left of the entry point
    if (startY === 0 && startX > 0) {
      polygon.push({ x: 0, y: 0 });
    }
  }

  // Remove duplicate points
  const deduped: Point[] = [polygon[0]];
  for (let i = 1; i < polygon.length; i++) {
    const prev = deduped[deduped.length - 1];
    if (prev.x !== polygon[i].x || prev.y !== polygon[i].y) {
      deduped.push(polygon[i]);
    }
  }

  return deduped.length >= 3 ? deduped : [];
}

/**
 * Build a clipped inverted slope polygon from left/right surface Y values.
 * Mirror of buildClippedSlopePolygon: the polygon traces the slope line
 * and then the TOP of the tile (filled area ABOVE the slope).
 */
function buildClippedInvertedSlopePolygon(
  leftY: number,
  rightY: number,
  tileSize: number,
  snap: number = SLOPE_SNAP
): Point[] {
  const snapVal = (v: number) => {
    if (Math.abs(v) <= snap) return 0;
    if (Math.abs(v - tileSize) <= snap) return tileSize;
    return v;
  };

  const lY = snapVal(leftY);
  const rY = snapVal(rightY);

  const slopeRate = (rY - lY) / tileSize;

  const xAtY = (targetY: number): number => {
    if (Math.abs(slopeRate) < 1e-10) return targetY <= lY ? 0 : tileSize;
    return (targetY - lY) / slopeRate;
  };

  // Clip the slope line to the tile rect
  let startX: number, startY: number, endX: number, endY: number;

  if (lY >= 0 && lY <= tileSize) {
    startX = 0;
    startY = lY;
  } else if (lY < 0) {
    startX = xAtY(0);
    startY = 0;
  } else {
    startX = xAtY(tileSize);
    startY = tileSize;
  }

  if (rY >= 0 && rY <= tileSize) {
    endX = tileSize;
    endY = rY;
  } else if (rY < 0) {
    endX = xAtY(0);
    endY = 0;
  } else {
    endX = xAtY(tileSize);
    endY = tileSize;
  }

  startX = Math.round(startX);
  startY = Math.round(startY);
  endX = Math.round(endX);
  endY = Math.round(endY);
  startX = Math.max(0, Math.min(tileSize, startX));
  startY = Math.max(0, Math.min(tileSize, startY));
  endX = Math.max(0, Math.min(tileSize, endX));
  endY = Math.max(0, Math.min(tileSize, endY));

  // Build polygon: slope surface → top edge (filled area ABOVE slope)
  const polygon: Point[] = [];

  // Slope start
  polygon.push({ x: startX, y: startY });
  // Slope end
  if (startX !== endX || startY !== endY) {
    polygon.push({ x: endX, y: endY });
  }
  // Top-right corner (if not already there)
  if (endX !== tileSize || endY !== 0) {
    // If slope ends on bottom edge, add bottom-right corner first
    if (endY === tileSize && endX < tileSize) {
      polygon.push({ x: tileSize, y: tileSize });
    }
    polygon.push({ x: tileSize, y: 0 });
  }
  // Top-left corner (if not already there)
  if (startX !== 0 || startY !== 0) {
    polygon.push({ x: 0, y: 0 });
    // If slope enters through bottom edge, add bottom-left corner
    if (startY === tileSize && startX > 0) {
      polygon.push({ x: 0, y: tileSize });
    }
  }

  // Remove duplicate points
  const deduped: Point[] = [polygon[0]];
  for (let i = 1; i < polygon.length; i++) {
    const prev = deduped[deduped.length - 1];
    if (prev.x !== polygon[i].x || prev.y !== polygon[i].y) {
      deduped.push(polygon[i]);
    }
  }

  return deduped.length >= 3 ? deduped : [];
}

/**
 * Check if a polygon has all vertices on tile edges (x=0, x=tileSize, y=0, or y=tileSize).
 * Polygons with interior vertices are "noisy" — they trace pixel boundaries.
 */
function hasInteriorVertices(poly: Point[], tileSize: number): boolean {
  for (const p of poly) {
    const atEdgeX = p.x === 0 || p.x === tileSize;
    const atEdgeY = p.y === 0 || p.y === tileSize;
    if (!atEdgeX && !atEdgeY) return true;
  }
  return false;
}

/**
 * Measure the mismatch between the actual alpha mask and the best-fit slope polygon.
 * Returns the fraction of pixels (0-1) where the mask and polygon disagree.
 * High mismatch (>15%) indicates a genuinely curved tile that should keep its polygon.
 * Low mismatch indicates a straight slope with pixel noise that should be simplified.
 */
function measureSlopeMismatch(
  mask: boolean[][],
  fitPoly: Point[],
  tileSize: number
): number {
  if (fitPoly.length < 3) return 1;
  let disagreements = 0;
  let total = 0;
  for (let y = 0; y < tileSize; y++) {
    for (let x = 0; x < tileSize; x++) {
      const inMask = mask[y][x];
      const inPoly = pointInPolygon(x + 0.5, y + 0.5, fitPoly);
      if (inMask !== inPoly) disagreements++;
      total++;
    }
  }
  return total > 0 ? disagreements / total : 1;
}

/** Ray-casting point-in-polygon test. */
function pointInPolygon(px: number, py: number, poly: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x,
      yi = poly[i].y;
    const xj = poly[j].x,
      yj = poly[j].y;
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

interface SlopeMeta {
  id: number;
  type: string;
  topSurface: (number | null)[];
  fit: NonNullable<ReturnType<typeof fitSurfaceLine>>;
  col: number;
  row: number;
  firstOpaqueCol: number;
  lastOpaqueCol: number;
}

/**
 * Process slope polygons: simplify straight slopes and linearize contiguous runs.
 * Modifies state.tilePolygons in place.
 */
function processSlopePolygons(
  state: TileState,
  processedIds: Set<number>
): { simplified: number; linearized: number; invertedSimplified: number } {
  const { config, masks, tileTypes, tilePolygons, tsjData } = state;
  const columns = tsjData.columns;
  const tileSize = config.tileSize;

  // Phase A: Compute slope metadata for all slope tiles
  const slopeMetas = new Map<number, SlopeMeta>();
  for (const [id, type] of tileTypes) {
    if (!SLOPE_TYPES.has(type)) continue;
    const mask = masks[id];
    if (!mask) continue;
    const topSurface = computeTopSurface(mask);
    const fit = fitSurfaceLine(topSurface);
    if (!fit) continue;

    // Compute opaque column range
    let firstOpaqueCol = -1;
    let lastOpaqueCol = -1;
    for (let x = 0; x < topSurface.length; x++) {
      if (topSurface[x] !== null) {
        if (firstOpaqueCol === -1) firstOpaqueCol = x;
        lastOpaqueCol = x;
      }
    }

    slopeMetas.set(id, {
      id,
      type,
      topSurface,
      fit,
      col: id % columns,
      row: Math.floor(id / columns),
      firstOpaqueCol,
      lastOpaqueCol
    });
  }

  let simplified = 0;
  let linearized = 0;

  // Phase B: Detect horizontal contiguous runs
  // Group slope tiles by type and row, find horizontally adjacent tiles
  // whose edge surface heights match
  const horizontalRuns: number[][] = [];
  const inHorizontalRun = new Set<number>();

  // Group by (type, row)
  const typeRowGroups = new Map<string, SlopeMeta[]>();
  for (const [, meta] of slopeMetas) {
    const key = `${meta.type}:${meta.row}`;
    if (!typeRowGroups.has(key)) typeRowGroups.set(key, []);
    typeRowGroups.get(key)!.push(meta);
  }

  for (const [, group] of typeRowGroups) {
    group.sort((a, b) => a.col - b.col);

    let runStart = 0;
    for (let i = 1; i <= group.length; i++) {
      const canExtend =
        i < group.length &&
        group[i].col === group[i - 1].col + 1 &&
        // Check edge heights match: right edge of prev tile ≈ left edge of next tile
        Math.abs(group[i - 1].fit.rightY - group[i].fit.leftY) <=
          SLOPE_EDGE_TOLERANCE;

      if (!canExtend) {
        const run = group.slice(runStart, i);
        if (run.length >= 2) {
          horizontalRuns.push(run.map((m) => m.id));
          for (const m of run) inHorizontalRun.add(m.id);
        }
        runStart = i;
      }
    }
  }

  // Phase C: Linearize horizontal runs
  for (const run of horizontalRuns) {
    const firstMeta = slopeMetas.get(run[0])!;
    const lastMeta = slopeMetas.get(run[run.length - 1])!;

    // Only linearize if at least one tile has a noisy polygon (interior vertices).
    // Tiles with all-edge-vertex polygons (like devset-large's clean shapes) are left alone.
    const anyNoisyInRun = run.some((id) => {
      const poly = tilePolygons.get(id);
      return poly && hasInteriorVertices(poly, tileSize);
    });
    if (!anyNoisyInRun) continue;

    // Unified slope from first tile's left edge to last tile's right edge
    const totalLeftY = firstMeta.fit.leftY;
    const totalRightY = lastMeta.fit.rightY;
    const totalWidth = run.length; // in tiles
    const slopePerTile = (totalRightY - totalLeftY) / totalWidth;

    for (let i = 0; i < run.length; i++) {
      const id = run[i];
      const tileLeftY = totalLeftY + slopePerTile * i;
      const tileRightY = totalLeftY + slopePerTile * (i + 1);
      const poly = buildClippedSlopePolygon(tileLeftY, tileRightY, tileSize);
      if (poly.length >= 3) {
        tilePolygons.set(id, poly);
        processedIds.add(id);
        linearized++;
      }
    }
  }

  // Phase D: Detect vertical contiguous runs (same type, same column, adjacent rows)
  // For vertical adjacency, check that opaque regions overlap at the shared
  // horizontal boundary (bottom row of upper tile vs top row of lower tile).
  const verticalRuns: number[][] = [];
  const inVerticalRun = new Set<number>();

  const typeColGroups = new Map<string, SlopeMeta[]>();
  for (const [id, meta] of slopeMetas) {
    if (inHorizontalRun.has(id)) continue;
    const key = `${meta.type}:${meta.col}`;
    if (!typeColGroups.has(key)) typeColGroups.set(key, []);
    typeColGroups.get(key)!.push(meta);
  }

  for (const [, group] of typeColGroups) {
    group.sort((a, b) => a.row - b.row);

    let runStart = 0;
    for (let i = 1; i <= group.length; i++) {
      let canExtend = false;
      if (i < group.length && group[i].row === group[i - 1].row + 1) {
        // Check boundary overlap: bottom row of upper tile vs top row of lower tile
        const upperMask = masks[group[i - 1].id];
        const lowerMask = masks[group[i].id];
        if (upperMask && lowerMask) {
          let overlap = 0;
          const bottomRow = upperMask[tileSize - 1];
          const topRow = lowerMask[0];
          for (let x = 0; x < tileSize; x++) {
            if (bottomRow[x] && topRow[x]) overlap++;
          }
          canExtend = overlap >= 3;
        }
      }

      if (!canExtend) {
        const run = group.slice(runStart, i);
        if (run.length >= 2) {
          verticalRuns.push(run.map((m) => m.id));
          for (const m of run) inVerticalRun.add(m.id);
        }
        runStart = i;
      }
    }
  }

  // Linearize vertical runs using combined endpoint fitting.
  // The slope continues diagonally across vertically stacked tiles.
  // At each x-column, take the topmost surface point (min y) across all tiles.
  for (const run of verticalRuns) {
    // Build combined surface: at each x, the min global y (topmost point)
    const combinedSurface = new Map<number, number>();
    for (let ti = 0; ti < run.length; ti++) {
      const meta = slopeMetas.get(run[ti])!;
      const yOffset = ti * tileSize;
      for (let x = 0; x < tileSize; x++) {
        if (meta.topSurface[x] !== null) {
          const globalY = meta.topSurface[x]! + yOffset;
          const existing = combinedSurface.get(x);
          if (existing === undefined || globalY < existing) {
            combinedSurface.set(x, globalY);
          }
        }
      }
    }

    // Only linearize if at least one tile has a noisy polygon (interior vertices).
    // Tiles with all-edge-vertex polygons (like devset-large's clean shapes) are left alone.
    const anyNoisyVert = run.some((id) => {
      const poly = tilePolygons.get(id);
      return poly && hasInteriorVertices(poly, tileSize);
    });
    if (!anyNoisyVert) continue;

    const sortedX = [...combinedSurface.keys()].sort((a, b) => a - b);
    if (sortedX.length < 2) continue;

    const firstX = sortedX[0];
    const lastX = sortedX[sortedX.length - 1];
    const firstY = combinedSurface.get(firstX)!;
    const lastY = combinedSurface.get(lastX)!;

    const dx = lastX - firstX;
    if (Math.abs(dx) < 1) continue;

    const unifiedSlope = (lastY - firstY) / dx;
    const unifiedIntercept = firstY - unifiedSlope * firstX;

    // For each tile, compute local leftY/rightY from the unified line
    for (let ti = 0; ti < run.length; ti++) {
      const id = run[ti];
      const yOffset = ti * tileSize;
      const localLeftY = unifiedIntercept - yOffset;
      const localRightY =
        unifiedSlope * (tileSize - 1) + unifiedIntercept - yOffset;
      const poly = buildClippedSlopePolygon(localLeftY, localRightY, tileSize);
      if (poly.length >= 3) {
        tilePolygons.set(id, poly);
        processedIds.add(id);
        linearized++;
      }
    }
  }

  // Phase E: Simplify standalone slope tiles using mismatch metric.
  // Build the best-fit polygon and compare against the alpha mask.
  // Tiles where the fit closely matches the mask (mismatch <= 15%) get simplified.
  // Tiles with high mismatch are genuinely curved and keep their alpha-traced polygons.
  for (const [id, meta] of slopeMetas) {
    if (processedIds.has(id)) continue;
    if (inHorizontalRun.has(id) || inVerticalRun.has(id)) continue;

    // Only simplify if the current polygon has interior vertices or too many points
    const currentPoly = tilePolygons.get(id);
    if (
      !currentPoly ||
      !(hasInteriorVertices(currentPoly, tileSize) || currentPoly.length > 4)
    )
      continue;

    // Skip partial-width tiles — endpoint extrapolation is unreliable
    if (meta.fit.coverage < SLOPE_COVERAGE_THRESHOLD) continue;

    // Build the best-fit polygon from endpoint fitting
    const fitPoly = buildClippedSlopePolygon(
      meta.fit.leftY,
      meta.fit.rightY,
      tileSize
    );
    if (fitPoly.length < 3) continue;

    // Measure mismatch: how much does the fit polygon disagree with the actual mask?
    const mask = masks[id];
    if (!mask) continue;
    const mismatch = measureSlopeMismatch(mask, fitPoly, tileSize);
    if (mismatch > SLOPE_MISMATCH_THRESHOLD) continue;

    tilePolygons.set(id, fitPoly);
    processedIds.add(id);
    simplified++;
  }

  // Phase F: Simplify inverted slope ground tiles.
  // Ground tiles that kept their polygon (passed the ground-solid check) are
  // likely inverted slopes. Use the bottom surface to fit a line and build a
  // simplified polygon above the slope.
  let invertedSimplified = 0;
  for (const [id, type] of tileTypes) {
    if (type !== "ground") continue;
    const poly = tilePolygons.get(id);
    if (!poly || poly.length < 3) continue;

    // Only simplify noisy polygons
    if (!hasInteriorVertices(poly, tileSize) && poly.length <= 4) continue;

    const mask = masks[id];
    if (!mask) continue;

    const bottomSurface = computeBottomSurface(mask);
    const fit = fitSurfaceLine(bottomSurface);
    if (!fit) continue;

    // Skip partial-width tiles
    if (fit.coverage < SLOPE_COVERAGE_THRESHOLD) continue;

    const fitPoly = buildClippedInvertedSlopePolygon(
      fit.leftY,
      fit.rightY,
      tileSize
    );
    if (fitPoly.length < 3) continue;

    // Reject if the simplified polygon is a near-full-tile rectangle —
    // the ground-solid check already decided this tile needs a polygon,
    // so don't simplify it back into a solid.
    const fitArea = polygonArea(fitPoly) / (tileSize * tileSize);
    if (fitArea >= GROUND_SOLID_AREA_THRESHOLD) continue;

    const mismatch = measureSlopeMismatch(mask, fitPoly, tileSize);
    if (mismatch > SLOPE_MISMATCH_THRESHOLD) continue;

    tilePolygons.set(id, fitPoly);
    invertedSimplified++;
  }

  return { simplified, linearized, invertedSimplified };
}

// --- Collision generation (shared between TUI and CLI) ---

function generateCollisions(
  tileIds: number[],
  state: TileState
): {
  generated: number;
  edgeFixes: number;
  slopeSimplified: number;
  slopeLinearized: number;
  invertedSimplified: number;
} {
  const { config, masks, tileTypes, tilePolygons, tsjData } = state;
  const columns = tsjData.columns;
  const rows = Math.ceil(tsjData.tilecount / columns);

  let generated = 0;
  for (const id of tileIds) {
    const type = tileTypes.get(id);
    if (!type) continue;
    if (FULL_TILE_COLLISION_TYPES.has(type)) {
      tilePolygons.delete(id);
      continue;
    }
    const mask = masks[id];
    if (!mask) {
      tilePolygons.delete(id);
      continue;
    }
    const poly = generatePolygon(mask, config.epsilon);
    if (poly.length >= 3) {
      const rect = tryGetAxisAlignedRect(poly);
      if (
        rect &&
        rect.x <= 1 &&
        rect.y <= 1 &&
        rect.width >= config.tileSize - 1 &&
        rect.height >= config.tileSize - 1
      ) {
        tilePolygons.delete(id);
      } else if (type === "ground" || type === "platform") {
        const areaRatio =
          polygonArea(poly) / (config.tileSize * config.tileSize);
        if (
          areaRatio >= GROUND_SOLID_AREA_THRESHOLD &&
          (hasInteriorVertices(poly, config.tileSize) ||
            allVerticesNearCorner(
              poly,
              config.tileSize,
              GROUND_NEAR_CORNER_DISTANCE
            ))
        ) {
          tilePolygons.delete(id);
        } else {
          tilePolygons.set(id, poly);
          generated++;
        }
      } else {
        tilePolygons.set(id, poly);
        generated++;
      }
    } else {
      tilePolygons.delete(id);
    }
  }

  // Slope polygon processing: simplify straight slopes, linearize contiguous runs
  const slopeProcessedIds = new Set<number>();
  const {
    simplified: slopeSimplified,
    linearized: slopeLinearized,
    invertedSimplified
  } = processSlopePolygons(state, slopeProcessedIds);

  let edgeFixes = 0;
  for (const id of tileIds) {
    const poly = tilePolygons.get(id);
    if (!poly || poly.length === 0) continue;
    const col = id % columns;
    const row = Math.floor(id / columns);
    if (col < columns - 1) {
      const rp = tilePolygons.get(id + 1);
      if (rp && rp.length > 0)
        edgeFixes += alignSharedVerticalEdge(
          poly,
          rp,
          config.tileSize,
          config.tileSize
        );
    }
    if (row < rows - 1) {
      const bp = tilePolygons.get(id + columns);
      if (bp && bp.length > 0)
        edgeFixes += alignSharedHorizontalEdge(
          poly,
          bp,
          config.tileSize,
          config.tileSize
        );
    }
  }

  return {
    generated,
    edgeFixes,
    slopeSimplified,
    slopeLinearized,
    invertedSimplified
  };
}

// --- Edge alignment ---

function alignSharedVerticalEdge(
  leftPoly: Point[],
  rightPoly: Point[],
  edgeX: number,
  tileSize: number
): number {
  const left = slopeVerticesOnVEdge(leftPoly, edgeX, tileSize);
  const right = slopeVerticesOnVEdge(rightPoly, 0, tileSize);
  return reconcileEdgePoints(left, right, "y");
}

function alignSharedHorizontalEdge(
  topPoly: Point[],
  bottomPoly: Point[],
  edgeY: number,
  tileSize: number
): number {
  const top = slopeVerticesOnHEdge(topPoly, edgeY, tileSize);
  const bottom = slopeVerticesOnHEdge(bottomPoly, 0, tileSize);
  return reconcileEdgePoints(top, bottom, "x");
}

interface IndexedCoord {
  polygon: Point[];
  index: number;
  coord: number;
}

function slopeVerticesOnVEdge(
  poly: Point[],
  edgeX: number,
  tileSize: number
): IndexedCoord[] {
  const r: IndexedCoord[] = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    if (Math.abs(p.x - edgeX) <= 0.5 && p.y > 0.5 && p.y < tileSize - 0.5)
      r.push({ polygon: poly, index: i, coord: p.y });
  }
  return r;
}

function slopeVerticesOnHEdge(
  poly: Point[],
  edgeY: number,
  tileSize: number
): IndexedCoord[] {
  const r: IndexedCoord[] = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    if (Math.abs(p.y - edgeY) <= 0.5 && p.x > 0.5 && p.x < tileSize - 0.5)
      r.push({ polygon: poly, index: i, coord: p.x });
  }
  return r;
}

function reconcileEdgePoints(
  a: IndexedCoord[],
  b: IndexedCoord[],
  axis: "x" | "y"
): number {
  let fixes = 0;
  for (const ap of a) {
    let bestB: IndexedCoord | null = null,
      bestDist = Infinity;
    for (const bp of b) {
      const d = Math.abs(ap.coord - bp.coord);
      if (d < bestDist) {
        bestDist = d;
        bestB = bp;
      }
    }
    if (bestB && bestDist > 0 && bestDist <= 3) {
      const avg = Math.round((ap.coord + bestB.coord) / 2);
      ap.polygon[ap.index][axis] = avg;
      bestB.polygon[bestB.index][axis] = avg;
      ap.coord = avg;
      bestB.coord = avg;
      fixes++;
    }
  }
  return fixes;
}

// --- Output helpers ---

function createObjectGroup(polygon: Point[]): TsjObjectGroup {
  const rect = tryGetAxisAlignedRect(polygon);
  if (rect) {
    return {
      draworder: "index",
      name: "",
      opacity: 1,
      type: "objectgroup",
      visible: true,
      x: 0,
      y: 0,
      objects: [
        {
          height: rect.height,
          id: 1,
          name: "",
          rotation: 0,
          type: "",
          visible: true,
          width: rect.width,
          x: rect.x,
          y: rect.y
        }
      ]
    };
  }
  const ox = polygon[0].x,
    oy = polygon[0].y;
  return {
    draworder: "index",
    name: "",
    opacity: 1,
    type: "objectgroup",
    visible: true,
    x: 0,
    y: 0,
    objects: [
      {
        height: 0,
        id: 1,
        name: "",
        rotation: 0,
        type: "",
        visible: true,
        width: 0,
        x: ox,
        y: oy,
        polygon: polygon.map((p) => ({
          x: Math.round((p.x - ox) * 1000) / 1000,
          y: Math.round((p.y - oy) * 1000) / 1000
        }))
      }
    ]
  };
}

function polygonArea(polygon: Point[]): number {
  let sum = 0;
  for (let i = 0; i < polygon.length; i++) {
    const j = (i + 1) % polygon.length;
    sum += polygon[i].x * polygon[j].y - polygon[j].x * polygon[i].y;
  }
  return Math.abs(sum) / 2;
}

function allVerticesNearCorner(
  polygon: Point[],
  tileSize: number,
  maxDistance: number
): boolean {
  const corners = [
    { x: 0, y: 0 },
    { x: tileSize, y: 0 },
    { x: 0, y: tileSize },
    { x: tileSize, y: tileSize }
  ];
  for (const p of polygon) {
    const minDist = Math.min(
      ...corners.map((c) => Math.hypot(p.x - c.x, p.y - c.y))
    );
    if (minDist > maxDistance) return false;
  }
  return true;
}

function tryGetAxisAlignedRect(
  polygon: Point[]
): { x: number; y: number; width: number; height: number } | null {
  if (polygon.length !== 4) return null;
  const xs = polygon.map((p) => p.x),
    ys = polygon.map((p) => p.y);
  const minX = Math.min(...xs),
    maxX = Math.max(...xs);
  const minY = Math.min(...ys),
    maxY = Math.max(...ys);
  for (const p of polygon) {
    if (!(Math.abs(p.x - minX) < 0.5 || Math.abs(p.x - maxX) < 0.5))
      return null;
    if (!(Math.abs(p.y - minY) < 0.5 || Math.abs(p.y - maxY) < 0.5))
      return null;
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

// ============================================================================
// ANSI / Terminal helpers
// ============================================================================

const ESC = "\x1b";
const CSI = `${ESC}[`;

const ansi = {
  altScreenOn: `${CSI}?1049h`,
  altScreenOff: `${CSI}?1049l`,
  cursorHide: `${CSI}?25l`,
  cursorShow: `${CSI}?25h`,
  clearScreen: `${CSI}2J`,
  clearLine: `${CSI}2K`,
  moveTo: (row: number, col: number) => `${CSI}${row};${col}H`,
  fg: (n: number) => `${CSI}38;5;${n}m`,
  bg: (n: number) => `${CSI}48;5;${n}m`,
  reset: `${CSI}0m`,
  bold: `${CSI}1m`,
  dim: `${CSI}2m`,
  inverse: `${CSI}7m`
};

const TYPE_COLORS: Record<string, number> = {
  ground: 2,
  platform: 3,
  slopediagleft: 6,
  slopediagright: 6,
  stairsdiagleft: 14,
  stairsdiagright: 14,
  platformdiagleft: 11,
  platformdiagright: 11,
  ladder: 5,
  spikes: 1,
  water: 4,
  waterfall: 12,
  decal: 245
};

function getTermSize() {
  return {
    width: process.stdout.columns || 80,
    height: process.stdout.rows || 24
  };
}

function write(s: string) {
  process.stdout.write(s);
}
function padRight(s: string, len: number) {
  return s.length >= len ? s.slice(0, len) : s + " ".repeat(len - s.length);
}
function padLeft(s: string, len: number) {
  // Pad to a minimum width; never truncate (truncating a number silently
  // corrupts it, e.g. 3643 -> "364" at width 3).
  return s.length >= len ? s : " ".repeat(len - s.length) + s;
}
function truncate(s: string, max: number) {
  return s.length <= max ? s : s.slice(0, max - 1) + "…";
}
function stripAnsi(s: string) {
  return s.replace(/\x1b\[[0-9;]*m/g, "");
}

// ============================================================================
// Rendering helpers
// ============================================================================

function renderMaskSmall(
  mask: boolean[][],
  charCols: number,
  charRows: number
): string[] {
  const h = mask.length,
    w = mask[0].length;
  const pxW = w / charCols,
    pxH = h / (charRows * 2);
  const lines: string[] = [];
  for (let cr = 0; cr < charRows; cr++) {
    let line = "";
    for (let cc = 0; cc < charCols; cc++) {
      const top =
        sampleRegion(
          mask,
          Math.floor(cc * pxW),
          Math.floor(cr * 2 * pxH),
          Math.ceil(pxW),
          Math.ceil(pxH)
        ) > 0.3;
      const bot =
        sampleRegion(
          mask,
          Math.floor(cc * pxW),
          Math.floor((cr * 2 + 1) * pxH),
          Math.ceil(pxW),
          Math.ceil(pxH)
        ) > 0.3;
      if (top && bot) line += "█";
      else if (top) line += "▀";
      else if (bot) line += "▄";
      else line += " ";
    }
    lines.push(line);
  }
  return lines;
}

function sampleRegion(
  mask: boolean[][],
  sx: number,
  sy: number,
  w: number,
  h: number
): number {
  let filled = 0,
    total = 0;
  for (let y = sy; y < sy + h && y < mask.length; y++)
    for (let x = sx; x < sx + w && x < mask[0].length; x++) {
      total++;
      if (mask[y][x]) filled++;
    }
  return total > 0 ? filled / total : 0;
}

/**
 * Render a full-size tile mask with optional polygon point markers.
 * Each character = 1px wide, 2px tall (using half-blocks).
 * Polygon points are shown as ● markers.
 */
function renderMaskFullWithPolygon(
  mask: boolean[][],
  polygon?: Point[]
): string[] {
  const h = mask.length,
    w = mask[0].length;
  const charRows = Math.ceil(h / 2);

  // Build a set of polygon point positions (in pixel coords)
  const polyPoints = new Set<string>();
  if (polygon) {
    for (const p of polygon) {
      // Clamp to tile bounds
      const px = Math.max(0, Math.min(w - 1, Math.round(p.x)));
      const py = Math.max(0, Math.min(h - 1, Math.round(p.y)));
      polyPoints.add(`${px},${py}`);
    }
  }

  const lines: string[] = [];
  for (let cr = 0; cr < charRows; cr++) {
    let line = "";
    for (let x = 0; x < w; x++) {
      const topY = cr * 2;
      const botY = cr * 2 + 1;
      const topPoly = polyPoints.has(`${x},${topY}`);
      const botPoly = botY < h && polyPoints.has(`${x},${botY}`);

      if (topPoly || botPoly) {
        line += `${ansi.fg(196)}●${ansi.reset}`; // bright red dot for polygon point
      } else {
        const top = topY < h && mask[topY][x];
        const bot = botY < h && mask[botY][x];
        if (top && bot) line += "█";
        else if (top) line += "▀";
        else if (bot) line += "▄";
        else line += " ";
      }
    }
    lines.push(line);
  }
  return lines;
}

// ============================================================================
// Input handling
// ============================================================================

type KeyHandler = (key: string) => void;

function startInput(handler: KeyHandler) {
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (data: string) => {
    const s = data.toString();
    if (s === "\x1b[A") handler("up");
    else if (s === "\x1b[B") handler("down");
    else if (s === "\x1b[C") handler("right");
    else if (s === "\x1b[D") handler("left");
    else if (s === "\x1b[1;2A") handler("shift-up");
    else if (s === "\x1b[1;2B") handler("shift-down");
    else if (s === "\x1b[1;2C") handler("shift-right");
    else if (s === "\x1b[1;2D") handler("shift-left");
    else if (s === "\x1b[1;6A") handler("ctrl-shift-up");
    else if (s === "\x1b[1;6B") handler("ctrl-shift-down");
    else if (s === "\x1b[1;6C") handler("ctrl-shift-right");
    else if (s === "\x1b[1;6D") handler("ctrl-shift-left");
    else if (s === "\r" || s === "\n") handler("enter");
    else if (s === " ") handler("space");
    else if (s === "\x1b" || s === "\x1b\x1b") handler("escape");
    else if (s === "\x03") handler("ctrl-c");
    else handler(s);
  });
}

function stopInput() {
  process.stdin.setRawMode(false);
  process.stdin.pause();
  process.stdin.removeAllListeners("data");
}

// ============================================================================
// File discovery
// ============================================================================

interface TilesetFileInfo {
  path: string;
  relPath: string;
  dir: string;
  name: string;
  tilecount: number;
  columns: number;
  typedCount: number;
  collisionCount: number;
}

function findTilesetFiles(baseDir: string): TilesetFileInfo[] {
  const results: TilesetFileInfo[] = [];
  function walk(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.name.endsWith(".tsj")) continue;
      try {
        const data: TsjFile = JSON.parse(fs.readFileSync(full, "utf-8"));
        const tiles = data.tiles || [];
        const rel = path.relative(baseDir, full);
        const d = path.dirname(rel);
        results.push({
          path: full,
          relPath: rel,
          dir: d === "." ? "" : d,
          name: path.basename(entry.name, ".tsj"),
          tilecount: data.tilecount,
          columns: data.columns,
          typedCount: tiles.filter((t) => t.type).length,
          collisionCount: tiles.filter((t) => t.objectgroup).length
        });
      } catch {
        /* skip */
      }
    }
  }
  walk(baseDir);
  results.sort((a, b) => a.relPath.localeCompare(b.relPath));
  return results;
}

// ============================================================================
// Screen 1: Tileset Browser
// ============================================================================

interface BrowserListItem {
  type: "header" | "file";
  dir?: string;
  fileIndex?: number;
  label: string;
}

class TilesetBrowser {
  private items: BrowserListItem[];
  private cursor = 0;
  private scroll = 0;

  constructor(private files: TilesetFileInfo[]) {
    this.items = [];
    let lastDir = "";
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      if (f.dir !== lastDir) {
        this.items.push({
          type: "header",
          dir: f.dir,
          label: f.dir || "(root)"
        });
        lastDir = f.dir;
      }
      const info = `${padLeft(String(f.tilecount), 5)} tiles  ${padLeft(String(f.typedCount), 3)} typed  ${padLeft(String(f.collisionCount), 3)} coll`;
      this.items.push({
        type: "file",
        fileIndex: i,
        label: `  ${padRight(f.name, 30)} ${info}`
      });
    }
    while (
      this.cursor < this.items.length &&
      this.items[this.cursor].type !== "file"
    )
      this.cursor++;
  }

  handleKey(
    key: string
  ): { action: "open"; filePath: string } | { action: "quit" } | null {
    if (key === "q" || key === "ctrl-c") return { action: "quit" };
    if (key === "enter") {
      const item = this.items[this.cursor];
      if (item?.type === "file" && item.fileIndex !== undefined)
        return { action: "open", filePath: this.files[item.fileIndex].path };
    }
    if (key === "up") this.moveCursor(-1);
    if (key === "down") this.moveCursor(1);
    this.render();
    return null;
  }

  private moveCursor(dir: number) {
    let next = this.cursor + dir;
    while (
      next >= 0 &&
      next < this.items.length &&
      this.items[next].type === "header"
    )
      next += dir;
    if (next >= 0 && next < this.items.length) this.cursor = next;
  }

  render() {
    const { width, height } = getTermSize();
    const headerH = 3,
      footerH = 2;
    const bodyH = height - headerH - footerH;

    if (this.cursor < this.scroll) this.scroll = this.cursor;
    if (this.cursor >= this.scroll + bodyH)
      this.scroll = this.cursor - bodyH + 1;

    let buf = ansi.clearScreen;
    buf +=
      ansi.moveTo(1, 1) +
      ` ${ansi.bold}Tileset Editor${ansi.reset}` +
      " ".repeat(Math.max(0, width - 28)) +
      `${ansi.dim}q: Quit${ansi.reset}`;
    buf += ansi.moveTo(2, 1) + "─".repeat(width);

    for (let i = 0; i < bodyH; i++) {
      const idx = this.scroll + i;
      const row = headerH + i;
      if (idx >= this.items.length) {
        buf += ansi.moveTo(row, 1) + ansi.clearLine;
        continue;
      }
      const item = this.items[idx];
      const cur = idx === this.cursor;
      buf += ansi.moveTo(row, 1) + ansi.clearLine;
      if (item.type === "header") {
        buf += `${ansi.bold}${ansi.fg(3)} ${item.label}/${ansi.reset}`;
      } else {
        buf += cur
          ? `${ansi.inverse} ▸${item.label} ${ansi.reset}`
          : `  ${item.label}`;
      }
    }

    buf += ansi.moveTo(height - footerH, 1) + "─".repeat(width);
    buf +=
      ansi.moveTo(height - footerH + 1, 1) +
      `${ansi.dim} ↑↓ Navigate   Enter: Open   q: Quit${ansi.reset}`;
    write(buf);
  }
}

// ============================================================================
// Screen 2: Tileset Grid View
// ============================================================================

interface TileState {
  tsjData: TsjFile;
  tsjPath: string;
  png: PNG;
  config: TilesetConfig;
  masks: (boolean[][] | null)[];
  fillRatios: number[];
  tileTypes: Map<number, string>;
  tilePolygons: Map<number, Point[]>;
  preservedObjectGroups: Map<number, TsjObjectGroup>;
  dirty: boolean;
}

function loadTileState(tsjPath: string): TileState {
  const tsjData = loadTsjFile(tsjPath);
  const png = loadPng(tsjData, path.dirname(tsjPath));
  const config: TilesetConfig = {
    ...DEFAULT_CONFIG,
    tileSize: tsjData.tilewidth
  };
  const { fillRatios, masks } = computeTileData(png, tsjData, config);
  const tileTypes = new Map<number, string>();
  const tilePolygons = new Map<number, Point[]>();
  const preservedObjectGroups = new Map<number, TsjObjectGroup>();
  for (const tile of tsjData.tiles || []) {
    if (tile.type) tileTypes.set(tile.id, tile.type);
    if (tile.objectgroup) {
      const obj = tile.objectgroup.objects?.[0];
      if (obj?.polygon) {
        tilePolygons.set(
          tile.id,
          obj.polygon.map((p) => ({ x: p.x + obj.x, y: p.y + obj.y }))
        );
      } else if (obj) {
        preservedObjectGroups.set(tile.id, tile.objectgroup);
      }
    }
  }
  return {
    tsjData,
    tsjPath,
    png,
    config,
    masks,
    fillRatios,
    tileTypes,
    tilePolygons,
    preservedObjectGroups,
    dirty: false
  };
}

// Grid cells: pure alpha preview only (type/ID in header)
const CELL_W = 4; // 4 preview chars, no gap
const CELL_H = 2; // 2 preview rows

class TilesetView {
  private state: TileState;
  private cursorCol = 0;
  private cursorRow = 0;
  private scrollCol = 0;
  private scrollRow = 0;
  private selected = new Set<number>();
  private rangeAnchor: number | null = null;
  private preRangeSnapshot: Set<number> | null = null;
  private rangeMode: "add" | "remove" | null = null;
  private statusMessage = "";
  private statusTimeout: ReturnType<typeof setTimeout> | null = null;
  private overlay: Overlay | null = null;

  constructor(tsjPath: string) {
    this.state = loadTileState(tsjPath);
  }

  get columns() {
    return this.state.tsjData.columns;
  }
  get rows() {
    return Math.ceil(this.state.tsjData.tilecount / this.columns);
  }
  private tileId(col: number, row: number) {
    return row * this.columns + col;
  }
  private cursorTileId() {
    return this.tileId(this.cursorCol, this.cursorRow);
  }

  handleKey(key: string): { action: "back" } | null {
    if (this.overlay) {
      const result = this.overlay.handleKey(key);
      if (result === "cancel") {
        this.overlay = null;
      } else if (result === "confirm") {
        this.overlay.apply();
        this.overlay = null;
      }
      this.render();
      return null;
    }

    if (key === "q" || key === "escape") {
      if (this.state.dirty) {
        this.showStatus(
          "Unsaved changes! Press 's' to save or 'Q' to discard."
        );
        this.render();
        return null;
      }
      return { action: "back" };
    }
    if (key === "Q") return { action: "back" };

    // Navigation (commits any pending range)
    if (key === "up") {
      this.commitRange();
      this.moveCursor(0, -1);
    } else if (key === "down") {
      this.commitRange();
      this.moveCursor(0, 1);
    } else if (key === "left") {
      this.commitRange();
      this.moveCursor(-1, 0);
    } else if (key === "right") {
      this.commitRange();
      this.moveCursor(1, 0);
    }
    // Shift+arrow: live rectangular add to selection
    else if (key === "shift-up") {
      this.beginRange("add");
      this.moveCursor(0, -1);
      this.updateRange();
    } else if (key === "shift-down") {
      this.beginRange("add");
      this.moveCursor(0, 1);
      this.updateRange();
    } else if (key === "shift-left") {
      this.beginRange("add");
      this.moveCursor(-1, 0);
      this.updateRange();
    } else if (key === "shift-right") {
      this.beginRange("add");
      this.moveCursor(1, 0);
      this.updateRange();
    }
    // Ctrl+Shift+arrow: live rectangular remove from selection
    else if (key === "ctrl-shift-up") {
      this.beginRange("remove");
      this.moveCursor(0, -1);
      this.updateRange();
    } else if (key === "ctrl-shift-down") {
      this.beginRange("remove");
      this.moveCursor(0, 1);
      this.updateRange();
    } else if (key === "ctrl-shift-left") {
      this.beginRange("remove");
      this.moveCursor(-1, 0);
      this.updateRange();
    } else if (key === "ctrl-shift-right") {
      this.beginRange("remove");
      this.moveCursor(1, 0);
      this.updateRange();
    }
    // Selection
    else if (key === "space") {
      this.commitRange();
      this.toggleSelect(this.cursorTileId());
    } else if (key === "a") {
      this.commitRange();
      this.selectAllNonEmpty();
    } else if (key === "n") {
      this.commitRange();
      this.selected.clear();
    }
    // Tile detail (enter)
    else if (key === "enter") this.openTileDetail();
    // Actions (selected tiles only)
    else if (key === "1") this.actionClassify();
    else if (key === "2") this.actionCollisions();
    else if (key === "3") this.actionClearData();
    else if (key === "4") this.actionAutoDecal();
    else if (key === "t") this.openTypePicker();
    else if (key === "s") this.actionSave();

    this.render();
    return null;
  }

  private moveCursor(dx: number, dy: number) {
    this.cursorCol = Math.max(
      0,
      Math.min(this.columns - 1, this.cursorCol + dx)
    );
    this.cursorRow = Math.max(0, Math.min(this.rows - 1, this.cursorRow + dy));
    this.adjustScroll();
  }

  private adjustScroll() {
    const { width, height } = getTermSize();
    const visibleCols = Math.floor((width - 1) / CELL_W);
    const visibleRows = Math.floor((height - 5) / CELL_H);
    if (this.cursorCol < this.scrollCol) this.scrollCol = this.cursorCol;
    if (this.cursorCol >= this.scrollCol + visibleCols)
      this.scrollCol = this.cursorCol - visibleCols + 1;
    if (this.cursorRow < this.scrollRow) this.scrollRow = this.cursorRow;
    if (this.cursorRow >= this.scrollRow + visibleRows)
      this.scrollRow = this.cursorRow - visibleRows + 1;
  }

  private beginRange(mode: "add" | "remove") {
    if (this.rangeAnchor === null) {
      this.rangeAnchor = this.cursorTileId();
      this.preRangeSnapshot = new Set(this.selected);
      this.rangeMode = mode;
    }
  }

  private commitRange() {
    this.rangeAnchor = null;
    this.preRangeSnapshot = null;
    this.rangeMode = null;
  }

  private getRangeIds(): number[] {
    if (this.rangeAnchor === null) return [];
    const ac = this.rangeAnchor % this.columns,
      ar = Math.floor(this.rangeAnchor / this.columns);
    const minC = Math.min(ac, this.cursorCol),
      maxC = Math.max(ac, this.cursorCol);
    const minR = Math.min(ar, this.cursorRow),
      maxR = Math.max(ar, this.cursorRow);
    const ids: number[] = [];
    for (let r = minR; r <= maxR; r++)
      for (let c = minC; c <= maxC; c++) {
        const id = this.tileId(c, r);
        if (id < this.state.tsjData.tilecount) ids.push(id);
      }
    return ids;
  }

  private updateRange() {
    if (!this.preRangeSnapshot || !this.rangeMode) return;
    // Restore snapshot, then apply the current rectangle
    this.selected = new Set(this.preRangeSnapshot);
    for (const id of this.getRangeIds()) {
      if (this.rangeMode === "add") this.selected.add(id);
      else this.selected.delete(id);
    }
  }

  private toggleSelect(id: number) {
    if (this.selected.has(id)) this.selected.delete(id);
    else this.selected.add(id);
  }

  private selectAllNonEmpty() {
    this.selected.clear();
    for (let id = 0; id < this.state.tsjData.tilecount; id++)
      if (this.state.masks[id]) this.selected.add(id);
    this.showStatus(`Selected ${this.selected.size} non-empty tiles`);
  }

  private getTargetTiles(): number[] {
    return [...this.selected];
  }

  // --- Actions ---

  private actionClassify() {
    if (this.selected.size === 0) {
      this.showStatus("No tiles selected");
      return;
    }
    const targets = this.getTargetTiles();
    let changed = 0;
    for (const id of targets) {
      const mask = this.state.masks[id];
      if (!mask) continue;
      const type = classifyTileType(mask, this.state.fillRatios[id]);
      if (type) {
        this.state.tileTypes.set(id, type);
        changed++;
      }
    }
    this.state.dirty = true;
    this.showStatus(`Classified ${changed} tiles`);
  }

  private actionCollisions() {
    if (this.selected.size === 0) {
      this.showStatus("No tiles selected");
      return;
    }
    const {
      generated,
      edgeFixes,
      slopeSimplified,
      slopeLinearized,
      invertedSimplified
    } = generateCollisions(this.getTargetTiles(), this.state);
    this.state.dirty = true;
    const parts = [`Generated ${generated} polygons`];
    if (slopeSimplified > 0) parts.push(`${slopeSimplified} slopes simplified`);
    if (slopeLinearized > 0) parts.push(`${slopeLinearized} slopes linearized`);
    if (invertedSimplified > 0)
      parts.push(`${invertedSimplified} inverted slopes simplified`);
    if (edgeFixes > 0) parts.push(`${edgeFixes} edge fixes`);
    this.showStatus(parts.join(", "));
  }

  private actionClearData() {
    if (this.selected.size === 0) {
      this.showStatus("No tiles selected");
      return;
    }
    const targets = this.getTargetTiles();
    let cleared = 0;
    for (const id of targets) {
      const had =
        this.state.tileTypes.has(id) || this.state.tilePolygons.has(id);
      this.state.tileTypes.delete(id);
      this.state.tilePolygons.delete(id);
      if (had) cleared++;
    }
    this.state.dirty = true;
    this.showStatus(`Cleared data from ${cleared} tiles`);
  }

  private actionAutoDecal() {
    if (this.selected.size === 0) {
      this.showStatus("No tiles selected");
      return;
    }
    const targets = this.getTargetTiles().filter(
      (id) => this.state.masks[id] && !this.state.tileTypes.has(id)
    );
    if (targets.length === 0) {
      this.showStatus("No unclassified tiles in selection");
      return;
    }
    for (const id of targets) {
      this.state.tileTypes.set(id, "decal");
    }
    this.state.dirty = true;
    this.showStatus(`Set ${targets.length} unclassified tiles to decal`);
  }

  private openTypePicker() {
    if (this.selected.size === 0) {
      this.showStatus("No tiles selected");
      return;
    }
    const targets = this.getTargetTiles().filter((id) => this.state.masks[id]);
    if (targets.length === 0) {
      this.showStatus("No non-empty tiles in selection");
      return;
    }
    this.overlay = new TypePickerOverlay(targets, this.state, () => {
      this.state.dirty = true;
    });
  }

  private openTileDetail() {
    const id = this.cursorTileId();
    const mask = this.state.masks[id];
    if (!mask) {
      this.showStatus("Empty tile");
      return;
    }
    this.overlay = new TileDetailOverlay(id, mask, this.state);
  }

  private actionSave() {
    const { tsjData, tsjPath, tileTypes, tilePolygons, preservedObjectGroups } =
      this.state;
    const newTiles: TsjTile[] = [];
    for (const id of [...tileTypes.keys()].sort((a, b) => a - b)) {
      const type = tileTypes.get(id)!;
      const entry: TsjTile = { id, type };
      const poly = tilePolygons.get(id);
      if (poly && poly.length >= 3) {
        entry.objectgroup = createObjectGroup(poly);
      } else if (preservedObjectGroups.has(id)) {
        entry.objectgroup = preservedObjectGroups.get(id)!;
      }
      newTiles.push(entry);
    }
    tsjData.tiles = newTiles;
    fs.writeFileSync(tsjPath, JSON.stringify(tsjData, null, 1));
    this.state.dirty = false;
    this.showStatus(
      `Saved ${newTiles.length} tiles to ${path.basename(tsjPath)}`
    );
  }

  private showStatus(msg: string) {
    this.statusMessage = msg;
    if (this.statusTimeout) clearTimeout(this.statusTimeout);
    this.statusTimeout = setTimeout(() => {
      this.statusMessage = "";
      this.render();
    }, 3000);
  }

  // --- Rendering ---

  render() {
    const { width, height } = getTermSize();
    const headerH = 2;
    const footerH = 3;
    const bodyH = height - headerH - footerH;
    const visibleCols = Math.floor((width - 1) / CELL_W);
    const visibleRows = Math.floor(bodyH / CELL_H);

    let buf = ansi.clearScreen;

    // Header: tileset info on left, cursor tile info on right
    const id = this.cursorTileId();
    const type = this.state.tileTypes.get(id) || "—";
    const fill = this.state.masks[id]
      ? Math.round(this.state.fillRatios[id] * 100) + "%"
      : "empty";
    const poly =
      this.state.tilePolygons.has(id) ||
      this.state.preservedObjectGroups.has(id)
        ? "◆"
        : "◇";
    const dirty = this.state.dirty ? " [modified]" : "";
    const left = `${ansi.bold}${this.state.tsjData.name}${ansi.reset}${dirty}`;
    const right = `#${id} [${this.cursorCol},${this.cursorRow}] ${type} ${poly} ${fill}`;
    const gap = Math.max(1, width - stripAnsi(left).length - right.length - 2);
    buf += ansi.moveTo(1, 1) + " " + left + " ".repeat(gap) + right + " ";
    buf += ansi.moveTo(2, 1) + "─".repeat(width);

    // Grid
    for (let vr = 0; vr < visibleRows; vr++) {
      const tileRow = this.scrollRow + vr;
      if (tileRow >= this.rows) break;
      for (let vc = 0; vc < visibleCols; vc++) {
        const tileCol = this.scrollCol + vc;
        if (tileCol >= this.columns) break;
        const tid = this.tileId(tileCol, tileRow);
        if (tid >= this.state.tsjData.tilecount) continue;
        const sc = vc * CELL_W + 1;
        const sr = headerH + vr * CELL_H + 1;
        const isCursor =
          tileCol === this.cursorCol && tileRow === this.cursorRow;
        const isSel = this.selected.has(tid);
        buf += this.renderCell(tid, sr, sc, isCursor, isSel);
      }
    }

    // Footer
    const selInfo =
      this.selected.size > 0
        ? `  ${ansi.fg(3)}${this.selected.size} selected${ansi.reset}`
        : "";
    const fr = height - footerH + 1;
    buf += ansi.moveTo(fr - 1, 1) + "─".repeat(width);
    buf +=
      ansi.moveTo(fr, 1) +
      ansi.dim +
      ` Space: Toggle  Shift+Arrow: Select Range  Ctrl+Shift+Arrow: Deselect Range  a: All  n: None${ansi.reset}${selInfo}`;
    buf +=
      ansi.moveTo(fr + 1, 1) +
      ansi.dim +
      ` 1: Auto Classify  2: Auto Collision  3: Clear Data  4: Auto Decal  t: Set Type  Enter: Detail  s: Save  q: Quit  Q: Discard` +
      ansi.reset;

    if (this.statusMessage)
      buf +=
        ansi.moveTo(fr + 2, 1) +
        ansi.fg(11) +
        " " +
        this.statusMessage +
        ansi.reset;

    write(buf);

    // Draw overlay on top if active
    if (this.overlay) this.overlay.render();
  }

  private renderCell(
    tid: number,
    sr: number,
    sc: number,
    isCursor: boolean,
    isSel: boolean
  ): string {
    let buf = "";
    const mask = this.state.masks[tid];
    const type = this.state.tileTypes.get(tid);

    if (mask) {
      const preview = renderMaskSmall(mask, CELL_W, 2);
      const baseColor = type ? TYPE_COLORS[type] ?? 7 : 244;
      // Normal: dim (washed out), Cursor: full color + grey bg, Selected: full color + dark blue bg
      const style = isCursor
        ? ansi.bg(239) + ansi.fg(baseColor)
        : isSel
          ? ansi.bg(17) + ansi.fg(baseColor)
          : ansi.dim + ansi.fg(baseColor);
      for (let pr = 0; pr < 2; pr++) {
        buf +=
          ansi.moveTo(sr + pr, sc) +
          ansi.reset +
          style +
          (preview[pr] || " ".repeat(CELL_W)) +
          ansi.reset;
      }
    } else {
      const style = isCursor ? ansi.bg(239) : isSel ? ansi.bg(17) : "";
      for (let pr = 0; pr < 2; pr++)
        buf +=
          ansi.moveTo(sr + pr, sc) +
          ansi.reset +
          style +
          " ".repeat(CELL_W) +
          ansi.reset;
    }

    return buf;
  }
}

// ============================================================================
// Overlay: Type Picker
// ============================================================================

interface Overlay {
  handleKey(key: string): "confirm" | "cancel" | null;
  apply(): void;
  render(): void;
}

class TypePickerOverlay implements Overlay {
  private cursor = 0;

  constructor(
    private targets: number[],
    private state: TileState,
    private onApply: () => void
  ) {}

  handleKey(key: string): "confirm" | "cancel" | null {
    if (key === "escape" || key === "q") return "cancel";
    if (key === "enter") return "confirm";
    if (key === "up") this.cursor = Math.max(0, this.cursor - 1);
    if (key === "down")
      this.cursor = Math.min(VALID_TILE_TYPES.length - 1, this.cursor + 1);
    return null;
  }

  apply() {
    const type = VALID_TILE_TYPES[this.cursor];
    for (const id of this.targets) this.state.tileTypes.set(id, type);
    this.onApply();
  }

  render() {
    const { width, height } = getTermSize();
    const bw = 32;
    const innerW = bw - 2; // usable width between │ and │
    const bh = VALID_TILE_TYPES.length + 4;
    const sx = Math.floor((width - bw) / 2);
    const sy = Math.floor((height - bh) / 2);

    let buf = "";
    buf += ansi.moveTo(sy, sx) + "┌── Select Type " + "─".repeat(bw - 17) + "┐";
    buf += ansi.moveTo(sy + 1, sx) + "│" + " ".repeat(innerW) + "│";

    for (let i = 0; i < VALID_TILE_TYPES.length; i++) {
      const cur = i === this.cursor;
      const c = TYPE_COLORS[VALID_TILE_TYPES[i]] ?? 7;
      const name = VALID_TILE_TYPES[i];
      // Build the visible content: "  ▸ name" or "    name", padded to innerW
      const prefix = cur ? " ▸ " : "   ";
      const visText = prefix + name;
      const padded = padRight(visText, innerW);
      if (cur) {
        buf +=
          ansi.moveTo(sy + 2 + i, sx) +
          "│" +
          ansi.inverse +
          ansi.fg(c) +
          padded +
          ansi.reset +
          "│";
      } else {
        buf +=
          ansi.moveTo(sy + 2 + i, sx) +
          "│" +
          ansi.fg(c) +
          padded +
          ansi.reset +
          "│";
      }
    }

    const fy = sy + 2 + VALID_TILE_TYPES.length;
    buf += ansi.moveTo(fy, sx) + "│" + " ".repeat(innerW) + "│";
    buf +=
      ansi.moveTo(fy + 1, sx) +
      "│" +
      ansi.dim +
      padRight(" Enter: confirm  Esc: cancel", innerW) +
      ansi.reset +
      "│";
    buf += ansi.moveTo(fy + 2, sx) + "└" + "─".repeat(innerW) + "┘";
    write(buf);
  }
}

// ============================================================================
// Overlay: Tile Detail (enhanced preview with polygon points)
// ============================================================================

class TileDetailOverlay implements Overlay {
  constructor(
    private tileId: number,
    private mask: boolean[][],
    private state: TileState
  ) {}

  handleKey(key: string): "confirm" | "cancel" | null {
    if (key === "escape" || key === "q" || key === "enter") return "cancel";
    return null;
  }

  apply() {} // no-op

  render() {
    const { width, height } = getTermSize();
    const polygon = this.state.tilePolygons.get(this.tileId);
    const rectObjGroup = this.state.preservedObjectGroups.get(this.tileId);
    const type = this.state.tileTypes.get(this.tileId) || "—";
    const typeColor = TYPE_COLORS[type] ?? 7;
    const fillPct = Math.round(this.state.fillRatios[this.tileId] * 100);
    const tileSize = this.mask.length;

    // Convert rectangular collision to polygon points for preview rendering
    let displayPolygon = polygon;
    if (!displayPolygon && rectObjGroup) {
      const obj = rectObjGroup.objects?.[0];
      if (obj) {
        displayPolygon = [
          { x: obj.x, y: obj.y },
          { x: obj.x + obj.width, y: obj.y },
          { x: obj.x + obj.width, y: obj.y + obj.height },
          { x: obj.x, y: obj.y + obj.height }
        ];
      }
    }

    // Full-size preview with polygon points overlaid
    const previewLines = renderMaskFullWithPolygon(this.mask, displayPolygon);
    const previewW = tileSize; // each char = 1 pixel wide (16 for 16x16 tiles)

    // Polygon info lines
    const polyInfoLines: string[] = [];
    if (polygon && polygon.length > 0) {
      polyInfoLines.push(`Polygon (${polygon.length} pts):`);
      // Show coords in rows of ~4
      for (let i = 0; i < polygon.length; i += 4) {
        const chunk = polygon.slice(i, i + 4);
        polyInfoLines.push(
          "  " + chunk.map((p) => `(${p.x},${p.y})`).join(" ")
        );
      }
    } else if (rectObjGroup) {
      const obj = rectObjGroup.objects?.[0];
      if (obj) {
        polyInfoLines.push(
          `Rect collision: (${obj.x},${obj.y}) ${obj.width}x${obj.height}`
        );
      }
    } else if (!type || type === "—" || type === "decal") {
      polyInfoLines.push("No collision");
    } else {
      polyInfoLines.push("Full-tile collision");
    }

    const contentW = Math.max(previewW, ...polyInfoLines.map((l) => l.length));
    const bw = Math.min(width - 4, Math.max(contentW + 6, 36));
    const innerW = bw - 4; // space inside box walls and 1px padding each side
    const bh = previewLines.length + polyInfoLines.length + 6;
    const sx = Math.floor((width - bw) / 2);
    const sy = Math.max(1, Math.floor((height - bh) / 2));

    let buf = "";

    // Title bar
    const title = ` Tile #${this.tileId} `;
    const dashesAfter = Math.max(0, bw - 3 - title.length);
    buf +=
      ansi.moveTo(sy, sx) +
      `┌─${ansi.bold}${title}${ansi.reset}` +
      "─".repeat(dashesAfter) +
      "┐";

    // Info row
    const typeStr = `Type: ${ansi.fg(typeColor)}${type}${ansi.reset}`;
    const infoStr = `${typeStr}  Fill: ${fillPct}%`;
    const infoVisLen = `Type: ${type}  Fill: ${fillPct}%`.length;
    buf +=
      ansi.moveTo(sy + 1, sx) +
      "│ " +
      infoStr +
      " ".repeat(Math.max(0, bw - 3 - infoVisLen)) +
      "│";

    // Blank separator
    buf += ansi.moveTo(sy + 2, sx) + "│" + " ".repeat(bw - 2) + "│";

    // Preview lines (centered)
    for (let i = 0; i < previewLines.length; i++) {
      const line = previewLines[i];
      // previewLines may contain ANSI codes from polygon markers
      const visLen = stripAnsi(line).length;
      const padL = Math.floor((bw - 2 - visLen) / 2);
      const padR = bw - 2 - padL - visLen;
      buf +=
        ansi.moveTo(sy + 3 + i, sx) +
        "│" +
        " ".repeat(padL) +
        line +
        " ".repeat(Math.max(0, padR)) +
        "│";
    }

    // Blank separator
    const afterPreview = sy + 3 + previewLines.length;
    buf += ansi.moveTo(afterPreview, sx) + "│" + " ".repeat(bw - 2) + "│";

    // Polygon info
    for (let i = 0; i < polyInfoLines.length; i++) {
      const line = truncate(polyInfoLines[i], bw - 4);
      buf +=
        ansi.moveTo(afterPreview + 1 + i, sx) +
        "│ " +
        ansi.dim +
        padRight(line, bw - 4) +
        ansi.reset +
        " │";
    }

    // Footer
    const fy = afterPreview + 1 + polyInfoLines.length;
    buf += ansi.moveTo(fy, sx) + "│" + " ".repeat(bw - 2) + "│";
    buf +=
      ansi.moveTo(fy + 1, sx) +
      "│" +
      ansi.dim +
      padRight(" Esc/Enter: close", bw - 2) +
      ansi.reset +
      "│";
    buf += ansi.moveTo(fy + 2, sx) + "└" + "─".repeat(bw - 2) + "┘";

    write(buf);
  }
}

// ============================================================================
// CLI (non-interactive) mode
// ============================================================================

const SLOPE_TYPES = new Set([
  "slopediagleft",
  "slopediagright",
  "stairsdiagleft",
  "stairsdiagright",
  "platformdiagleft",
  "platformdiagright"
]);

interface CliArgs {
  tileset: string | null;
  listTilesets: boolean;
  classify: boolean;
  collisions: boolean;
  save: boolean;
  dumpIds: number[] | "all" | null;
  dumpSlopes: boolean;
  dumpTypes: boolean;
  dumpSurface: number[] | null;
  diff: boolean;
  json: boolean;
}

function parseCliArgs(argv: string[]): CliArgs | null {
  const args = argv.slice(2);
  if (args.length === 0) return null;

  const result: CliArgs = {
    tileset: null,
    listTilesets: false,
    classify: false,
    collisions: false,
    save: false,
    dumpIds: null,
    dumpSlopes: false,
    dumpTypes: false,
    dumpSurface: null,
    diff: false,
    json: false
  };

  let hasCliFlag = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--tileset" || arg === "-t") {
      result.tileset = args[++i];
      hasCliFlag = true;
    } else if (arg === "--list-tilesets" || arg === "--ls") {
      result.listTilesets = true;
      hasCliFlag = true;
    } else if (arg === "--classify") {
      result.classify = true;
      hasCliFlag = true;
    } else if (arg === "--collisions") {
      result.collisions = true;
      hasCliFlag = true;
    } else if (arg === "--save") {
      result.save = true;
      hasCliFlag = true;
    } else if (arg === "--dump") {
      hasCliFlag = true;
      // Check if next arg is a comma-separated list of IDs
      if (i + 1 < args.length && !args[i + 1].startsWith("--")) {
        result.dumpIds = args[++i].split(",").map(Number);
      } else {
        result.dumpIds = "all";
      }
    } else if (arg === "--dump-slopes") {
      result.dumpSlopes = true;
      hasCliFlag = true;
    } else if (arg === "--dump-types") {
      result.dumpTypes = true;
      hasCliFlag = true;
    } else if (arg === "--dump-surface") {
      hasCliFlag = true;
      if (i + 1 < args.length && !args[i + 1].startsWith("--")) {
        result.dumpSurface = args[++i].split(",").map(Number);
      } else {
        console.error("--dump-surface requires tile IDs");
        process.exit(1);
      }
    } else if (arg === "--diff") {
      result.diff = true;
      hasCliFlag = true;
    } else if (arg === "--json") {
      result.json = true;
      hasCliFlag = true;
    } else if (arg === "--help" || arg === "-h") {
      printCliHelp();
      process.exit(0);
    } else {
      console.error(`Unknown argument: ${arg}`);
      printCliHelp();
      process.exit(1);
    }
  }

  return hasCliFlag ? result : null;
}

function printCliHelp() {
  console.log(
    `
tileset-editor — CLI mode

Usage:
  node tileset-editor.js --tileset <name-or-path> [operations...]

Tileset resolution:
  --tileset, -t <name>    Tileset name (e.g. "devset-large", "mine-tileset")
                          or full path to a .tsj file

Discovery:
  --list-tilesets, --ls    List all available tilesets (no --tileset needed)

Operations (run in order):
  --classify              Auto-classify all non-empty tiles
  --collisions            Generate collision polygons for all typed tiles
  --save                  Write results back to .tsj file

Inspection:
  --dump [id,id,...]      Dump tile info. Omit IDs to dump all typed tiles
  --dump-slopes           Dump all slope-typed tiles with polygon details
  --dump-types            Summary of tile type counts
  --dump-surface id,...    Dump top surface profile (y per column) for tiles
  --diff                  Show differences vs current .tsj data on disk
  --json                  Output dump data as JSON

Note: Without --classify, the tool uses types already saved in the .tsj file.
      Use --classify to re-derive types from pixel data.

Examples:
  node tileset-editor.js --ls
  node tileset-editor.js -t devset-large --classify --collisions --dump-slopes
  node tileset-editor.js -t mine-tileset --collisions --dump-slopes
  node tileset-editor.js -t devset-large --dump 226,227,228,1862
  node tileset-editor.js -t devset-large --dump-types --json
  node tileset-editor.js -t devset-large --classify --collisions --diff
  node tileset-editor.js -t mine-tileset --dump-surface 1156,1157,966
`.trim()
  );
}

function resolveTilesetPath(nameOrPath: string, tilesetsDir: string): string {
  // Direct path
  if (fs.existsSync(nameOrPath)) return path.resolve(nameOrPath);
  // Try appending .tsj
  if (fs.existsSync(nameOrPath + ".tsj"))
    return path.resolve(nameOrPath + ".tsj");
  // Search in tilesets directory by name
  const files = findTilesetFiles(tilesetsDir);
  const match = files.find((f) => f.name === nameOrPath);
  if (match) return match.path;
  // Partial match
  const partial = files.filter((f) => f.name.includes(nameOrPath));
  if (partial.length === 1) return partial[0].path;
  if (partial.length > 1) {
    console.error(`Ambiguous tileset name "${nameOrPath}". Matches:`);
    for (const f of partial) console.error(`  ${f.relPath}`);
    process.exit(1);
  }
  console.error(`Tileset not found: "${nameOrPath}"`);
  console.error("Available tilesets:");
  for (const f of files) console.error(`  ${f.name} (${f.relPath})`);
  process.exit(1);
}

function runCli(cliArgs: CliArgs, tilesetsDir: string) {
  // -- List tilesets --
  if (cliArgs.listTilesets) {
    const files = findTilesetFiles(tilesetsDir);
    if (cliArgs.json) {
      console.log(
        JSON.stringify(
          files.map((f) => ({
            name: f.name,
            path: f.relPath,
            tilecount: f.tilecount,
            columns: f.columns,
            typedCount: f.typedCount,
            collisionCount: f.collisionCount
          })),
          null,
          2
        )
      );
    } else {
      for (const f of files) {
        console.log(
          `${padRight(f.name, 32)} ${padLeft(String(f.tilecount), 5)} tiles  ${padLeft(String(f.typedCount), 3)} typed  ${padLeft(String(f.collisionCount), 3)} coll  ${f.relPath}`
        );
      }
    }
    if (!cliArgs.tileset) return;
  }

  if (!cliArgs.tileset) {
    console.error("--tileset is required in CLI mode");
    process.exit(1);
  }

  const tsjPath = resolveTilesetPath(cliArgs.tileset, tilesetsDir);
  const state = loadTileState(tsjPath);
  const {
    config,
    masks,
    fillRatios,
    tileTypes,
    tilePolygons,
    preservedObjectGroups,
    tsjData
  } = state;

  console.error(
    `Loaded ${tsjData.name}: ${tsjData.tilecount} tiles, ${tsjData.columns} columns, ${config.tileSize}px`
  );

  // -- Classify --
  if (cliArgs.classify) {
    let changed = 0;
    for (let id = 0; id < tsjData.tilecount; id++) {
      const mask = masks[id];
      if (!mask) continue;
      const type = classifyTileType(mask, fillRatios[id]);
      if (type) {
        tileTypes.set(id, type);
        changed++;
      }
    }
    console.error(`Classified ${changed} tiles`);
  }

  // -- Collisions --
  if (cliArgs.collisions) {
    const allIds = Array.from({ length: tsjData.tilecount }, (_, i) => i);
    const {
      generated,
      edgeFixes,
      slopeSimplified,
      slopeLinearized,
      invertedSimplified
    } = generateCollisions(allIds, state);
    const parts = [`Generated ${generated} polygons`];
    if (slopeSimplified > 0) parts.push(`${slopeSimplified} slopes simplified`);
    if (slopeLinearized > 0) parts.push(`${slopeLinearized} slopes linearized`);
    if (invertedSimplified > 0)
      parts.push(`${invertedSimplified} inverted slopes simplified`);
    if (edgeFixes > 0) parts.push(`${edgeFixes} edge fixes`);
    console.error(parts.join(", "));
  }

  // -- Dump Types --
  if (cliArgs.dumpTypes) {
    const counts = new Map<string, number>();
    for (const [, type] of tileTypes)
      counts.set(type, (counts.get(type) || 0) + 1);
    if (cliArgs.json) {
      console.log(JSON.stringify(Object.fromEntries(counts), null, 2));
    } else {
      console.log("Type counts:");
      for (const [type, count] of [...counts.entries()].sort(
        (a, b) => b[1] - a[1]
      )) {
        console.log(`  ${type}: ${count}`);
      }
    }
  }

  // -- Dump Slopes --
  if (cliArgs.dumpSlopes) {
    const slopeData: Array<{
      id: number;
      type: string;
      polygon: Point[];
      fillPct: number;
      polyPoints: number;
      r2: number | null;
      coverage: number | null;
      col: number;
      row: number;
    }> = [];
    for (const [id, type] of tileTypes) {
      if (!SLOPE_TYPES.has(type)) continue;
      const poly = tilePolygons.get(id) || [];
      const mask = masks[id];
      let r2: number | null = null;
      let coverage: number | null = null;
      if (mask) {
        const topSurface = computeTopSurface(mask);
        const fit = fitSurfaceLine(topSurface);
        if (fit) {
          r2 = fit.r2;
          coverage = fit.coverage;
        }
      }
      slopeData.push({
        id,
        type,
        polygon: poly,
        fillPct: Math.round(fillRatios[id] * 100),
        polyPoints: poly.length,
        r2,
        coverage,
        col: id % tsjData.columns,
        row: Math.floor(id / tsjData.columns)
      });
    }
    slopeData.sort((a, b) => a.id - b.id);

    if (cliArgs.json) {
      console.log(JSON.stringify(slopeData, null, 2));
    } else {
      console.log(`Slope tiles (${slopeData.length}):`);
      for (const s of slopeData) {
        const polyStr =
          s.polygon.length > 0
            ? s.polygon.map((p) => `(${p.x},${p.y})`).join(" ")
            : "none";
        const r2Str = s.r2 !== null ? ` R²=${s.r2.toFixed(3)}` : "";
        const covStr =
          s.coverage !== null ? ` cov=${Math.round(s.coverage * 100)}%` : "";
        console.log(
          `  #${s.id} [${s.col},${s.row}] ${s.type} fill=${s.fillPct}% pts=${s.polyPoints}${r2Str}${covStr} poly=[${polyStr}]`
        );
      }
    }
  }

  // -- Dump specific tiles --
  if (cliArgs.dumpIds !== null) {
    const ids: number[] =
      cliArgs.dumpIds === "all"
        ? [...tileTypes.keys()].sort((a, b) => a - b)
        : cliArgs.dumpIds;

    const tileData = ids.map((id) => {
      const type = tileTypes.get(id) || null;
      const poly = tilePolygons.get(id) || [];
      const mask = masks[id];
      return {
        id,
        type,
        fillPct: Math.round(fillRatios[id] * 100),
        hasMask: !!mask,
        polygon: poly,
        polyPoints: poly.length,
        col: id % tsjData.columns,
        row: Math.floor(id / tsjData.columns)
      };
    });

    if (cliArgs.json) {
      console.log(JSON.stringify(tileData, null, 2));
    } else {
      for (const t of tileData) {
        const polyStr =
          t.polygon.length > 0
            ? t.polygon.map((p: Point) => `(${p.x},${p.y})`).join(" ")
            : "none";
        console.log(
          `#${t.id} [${t.col},${t.row}] type=${t.type || "—"} fill=${t.fillPct}% pts=${t.polyPoints} poly=[${polyStr}]`
        );
      }
    }
  }

  // -- Dump Surface --
  if (cliArgs.dumpSurface) {
    for (const id of cliArgs.dumpSurface) {
      const mask = masks[id];
      if (!mask) {
        console.log(`#${id}: no mask (empty tile)`);
        continue;
      }
      const type = tileTypes.get(id) || "—";
      const h = mask.length,
        w = mask[0].length;

      // Top surface: first opaque pixel per column
      const topSurface: (number | null)[] = [];
      for (let x = 0; x < w; x++) {
        let top: number | null = null;
        for (let y = 0; y < h; y++) {
          if (mask[y][x]) {
            top = y;
            break;
          }
        }
        topSurface.push(top);
      }
      // Bottom surface: last opaque pixel per column
      const bottomSurface: (number | null)[] = [];
      for (let x = 0; x < w; x++) {
        let bot: number | null = null;
        for (let y = h - 1; y >= 0; y--) {
          if (mask[y][x]) {
            bot = y;
            break;
          }
        }
        bottomSurface.push(bot);
      }

      const opaqueColumns = topSurface.filter((v) => v !== null).length;
      const coverage = Math.round((opaqueColumns / w) * 100);

      if (cliArgs.json) {
        console.log(
          JSON.stringify(
            { id, type, coverage, topSurface, bottomSurface },
            null,
            2
          )
        );
      } else {
        console.log(
          `#${id} type=${type} coverage=${coverage}% (${opaqueColumns}/${w} columns)`
        );
        console.log(
          `  top:    [${topSurface.map((v) => (v === null ? "." : String(v).padStart(2))).join(",")}]`
        );
        console.log(
          `  bottom: [${bottomSurface.map((v) => (v === null ? "." : String(v).padStart(2))).join(",")}]`
        );
        // Visual: ASCII sparkline of top surface
        const maxY = h - 1;
        const sparkChars = " ▁▂▃▄▅▆▇█";
        const spark = topSurface
          .map((v) => {
            if (v === null) return " ";
            const idx = Math.round(
              ((maxY - v) / maxY) * (sparkChars.length - 1)
            );
            return sparkChars[idx];
          })
          .join("");
        console.log(`  visual: |${spark}|`);
      }
    }
  }

  // -- Diff vs on-disk --
  if (cliArgs.diff) {
    const diskData = loadTsjFile(tsjPath);
    const diskTypes = new Map<number, string>();
    const diskPolygons = new Map<number, Point[]>();
    for (const tile of diskData.tiles || []) {
      if (tile.type) diskTypes.set(tile.id, tile.type);
      if (tile.objectgroup) {
        const obj = tile.objectgroup.objects?.[0];
        if (obj?.polygon) {
          diskPolygons.set(
            tile.id,
            obj.polygon.map((p) => ({ x: p.x + obj.x, y: p.y + obj.y }))
          );
        }
      }
    }

    const allIds = new Set([...tileTypes.keys(), ...diskTypes.keys()]);
    const changes: Array<{
      id: number;
      field: string;
      old: string;
      new: string;
    }> = [];

    for (const id of [...allIds].sort((a, b) => a - b)) {
      const oldType = diskTypes.get(id) || null;
      const newType = tileTypes.get(id) || null;
      if (oldType !== newType) {
        changes.push({
          id,
          field: "type",
          old: oldType || "—",
          new: newType || "—"
        });
      }

      const oldPoly = diskPolygons.get(id);
      const newPoly = tilePolygons.get(id);
      const oldStr = oldPoly
        ? oldPoly.map((p) => `(${p.x},${p.y})`).join(" ")
        : "none";
      const newStr = newPoly
        ? newPoly.map((p) => `(${p.x},${p.y})`).join(" ")
        : "none";
      if (oldStr !== newStr) {
        changes.push({ id, field: "polygon", old: oldStr, new: newStr });
      }
    }

    if (cliArgs.json) {
      console.log(JSON.stringify(changes, null, 2));
    } else {
      if (changes.length === 0) {
        console.log("No differences.");
      } else {
        console.log(`${changes.length} differences:`);
        for (const c of changes) {
          console.log(`  #${c.id} ${c.field}: ${c.old} → ${c.new}`);
        }
      }
    }
  }

  // -- Save --
  if (cliArgs.save) {
    const newTiles: TsjTile[] = [];
    for (const id of [...tileTypes.keys()].sort((a, b) => a - b)) {
      const type = tileTypes.get(id)!;
      const entry: TsjTile = { id, type };
      const poly = tilePolygons.get(id);
      if (poly && poly.length >= 3) {
        entry.objectgroup = createObjectGroup(poly);
      } else if (preservedObjectGroups.has(id)) {
        entry.objectgroup = preservedObjectGroups.get(id)!;
      }
      newTiles.push(entry);
    }
    tsjData.tiles = newTiles;
    fs.writeFileSync(tsjPath, JSON.stringify(tsjData, null, 1));
    console.error(
      `Saved ${newTiles.length} tiles to ${path.basename(tsjPath)}`
    );
  }
}

// ============================================================================
// Main
// ============================================================================

const TILESETS_DIR = path.resolve(__dirname, "../../src/levels/tiled/tilesets");

function main() {
  const cliArgs = parseCliArgs(process.argv);

  // CLI mode: run operations and exit
  if (cliArgs) {
    runCli(cliArgs, TILESETS_DIR);
    return;
  }

  // TUI mode: interactive terminal
  if (!process.stdin.isTTY) {
    console.error(
      "tileset-editor requires an interactive terminal (TTY), or use --help for CLI mode."
    );
    process.exit(1);
  }

  write(ansi.altScreenOn + ansi.cursorHide + ansi.clearScreen);

  const files = findTilesetFiles(TILESETS_DIR);
  if (files.length === 0) {
    write(ansi.altScreenOff + ansi.cursorShow);
    console.error("No .tsj files found in " + TILESETS_DIR);
    process.exit(1);
  }

  let browser = new TilesetBrowser(files);
  let currentView: TilesetView | null = null;
  let screen: "browser" | "tileset" = "browser";

  const cleanup = () => {
    write(ansi.cursorShow + ansi.altScreenOff);
    stopInput();
    process.exit(0);
  };
  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);
  process.stdout.on("resize", () => {
    if (screen === "browser") browser.render();
    else if (currentView) currentView.render();
  });

  startInput((key: string) => {
    if (key === "ctrl-c") {
      cleanup();
      return;
    }
    if (screen === "browser") {
      const r = browser.handleKey(key);
      if (r?.action === "quit") cleanup();
      else if (r?.action === "open") {
        currentView = new TilesetView(r.filePath);
        screen = "tileset";
        currentView.render();
      }
    } else if (screen === "tileset" && currentView) {
      const r = currentView.handleKey(key);
      if (r?.action === "back") {
        currentView = null;
        screen = "browser";
        browser = new TilesetBrowser(findTilesetFiles(TILESETS_DIR));
        browser.render();
      }
    }
  });

  browser.render();
}

main();
