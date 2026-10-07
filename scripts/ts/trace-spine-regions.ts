/**
 * trace-spine-regions.ts
 *
 * Loads a Spine atlas + PNG, traces the alpha outlines of each region
 * attachment into simplified polygons, and writes the results to a
 * TypeScript file that can be imported at runtime.
 *
 * Usage:
 *   npm run scripts:compile
 *   node scripts/ts/trace-spine-regions.js \
 *     --atlas src/entities/enemies/bosses/echo/spine/skeleton.atlas \
 *     --png   src/entities/enemies/bosses/echo/spine/skeleton.png \
 *     --out   src/entities/enemies/bosses/echo/attachmentPolygons.ts \
 *     --epsilon 1.5
 */

import fs from "fs";
import path from "path";

interface PNGImage {
  width: number;
  height: number;
  data: Buffer;
}

interface PNGStatic {
  sync: {
    read(buffer: Buffer): PNGImage;
  };
}

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { PNG } = require("pngjs") as { PNG: PNGStatic };

// ---------------------------------------------------------------------------
// Atlas parsing
// ---------------------------------------------------------------------------

interface AtlasRegion {
  name: string;
  /** x position in the atlas PNG */
  x: number;
  /** y position in the atlas PNG */
  y: number;
  /** width as stored in atlas (may be swapped if rotated) */
  w: number;
  /** height as stored in atlas (may be swapped if rotated) */
  h: number;
  /** original un-trimmed width */
  origW: number;
  /** original un-trimmed height */
  origH: number;
  /** x offset of the trimmed region within the original rect */
  offsetX: number;
  /** y offset of the trimmed region within the original rect */
  offsetY: number;
  /** whether the region is stored rotated 90 degrees CW in the atlas */
  rotate: boolean;
}

function parseAtlas(text: string): AtlasRegion[] {
  const lines = text.split("\n");
  const regions: AtlasRegion[] = [];
  let i = 0;

  // Skip texture header block (texture name, size, filter, pma, etc.)
  // First non-empty line is texture name, then key:value header lines
  while (i < lines.length) {
    const line = lines[i].trim();
    if (
      line === "" ||
      line.startsWith("size:") ||
      line.startsWith("filter:") ||
      line.startsWith("pma:") ||
      line.startsWith("format:") ||
      line.startsWith("repeat:") ||
      // First line is the png filename
      line.endsWith(".png")
    ) {
      i++;
      continue;
    }
    break;
  }

  // Parse regions
  while (i < lines.length) {
    const nameLine = lines[i].trim();
    if (nameLine === "") {
      i++;
      continue;
    }

    // This line is a region name
    const region: AtlasRegion = {
      name: nameLine,
      x: 0,
      y: 0,
      w: 0,
      h: 0,
      origW: 0,
      origH: 0,
      offsetX: 0,
      offsetY: 0,
      rotate: false
    };
    i++;

    // Read properties until next region name or end
    while (i < lines.length) {
      const propLine = lines[i].trim();
      if (propLine === "") {
        i++;
        continue;
      }

      const colonIdx = propLine.indexOf(":");
      if (colonIdx === -1) break; // next region name

      const key = propLine.substring(0, colonIdx).trim();
      const val = propLine.substring(colonIdx + 1).trim();

      if (key === "bounds") {
        const parts = val.split(",").map(Number);
        [region.x, region.y, region.w, region.h] = parts;
      } else if (key === "offsets") {
        const parts = val.split(",").map(Number);
        [region.offsetX, region.offsetY, region.origW, region.origH] = parts;
      } else if (key === "rotate") {
        region.rotate = val === "90" || val === "true";
      } else if (key === "index" || key === "split" || key === "pad") {
        // ignored
      } else {
        // Unknown property — might be a region name with a colon?
        // Spine atlas region names shouldn't have colons, but check
        // if this looks like a known property pattern
        if (
          !["bounds", "offsets", "rotate", "index", "split", "pad", "size",
           "filter", "pma", "format", "repeat"].includes(key)
        ) {
          break; // Treat as next region name
        }
      }
      i++;
    }

    // If no offsets specified, the stored size IS the original size
    if (region.origW === 0 && region.origH === 0) {
      if (region.rotate) {
        region.origW = region.h;
        region.origH = region.w;
      } else {
        region.origW = region.w;
        region.origH = region.h;
      }
    }

    regions.push(region);
  }

  return regions;
}

// ---------------------------------------------------------------------------
// Pixel extraction
// ---------------------------------------------------------------------------

/**
 * Extracts an alpha mask for the given atlas region, un-rotated and placed
 * within its original (un-trimmed) dimensions.
 * Returns a 2D boolean array [y][x] where true = opaque.
 */
function extractAlphaMask(
  png: PNGImage,
  region: AtlasRegion,
  threshold: number
): boolean[][] {
  const { origW, origH } = region;
  const mask: boolean[][] = Array.from({ length: origH }, () =>
    new Array(origW).fill(false)
  );

  // The stored region in the atlas
  const storedW = region.w;
  const storedH = region.h;

  for (let sy = 0; sy < storedH; sy++) {
    for (let sx = 0; sx < storedW; sx++) {
      const atlasX = region.x + sx;
      const atlasY = region.y + sy;
      const idx = (atlasY * png.width + atlasX) * 4;
      const alpha = png.data[idx + 3];

      if (alpha < threshold) continue;

      // Map stored pixel to original image coordinates
      let ox: number, oy: number;
      if (region.rotate) {
        // Rotated 90 CW in atlas: stored (sx, sy) maps to original
        // The rotation convention: when rotate=90, the region is stored
        // such that original x maps to stored y and original y maps to
        // (storedW - 1 - stored x). So to reverse:
        ox = sy;
        oy = storedW - 1 - sx;
      } else {
        ox = sx;
        oy = sy;
      }

      // Apply offset for trimmed regions
      const finalX = ox + region.offsetX;
      const finalY = oy + region.offsetY;

      if (finalX >= 0 && finalX < origW && finalY >= 0 && finalY < origH) {
        mask[finalY][finalX] = true;
      }
    }
  }

  return mask;
}

// ---------------------------------------------------------------------------
// Contour tracing (Moore neighborhood)
// ---------------------------------------------------------------------------

/**
 * Traces the outer contour of opaque pixels using Moore neighborhood tracing.
 * Returns pixel coordinates as [x, y] pairs forming a closed polygon.
 */
function traceContour(mask: boolean[][], width: number, height: number): [number, number][] {
  // Pad the mask by 1 to ensure clean boundary
  const padW = width + 2;
  const padH = height + 2;
  const padded: boolean[][] = Array.from({ length: padH }, () =>
    new Array(padW).fill(false)
  );
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      padded[y + 1][x + 1] = mask[y][x];
    }
  }

  // Find first opaque pixel (top-to-bottom, left-to-right)
  let startX = -1;
  let startY = -1;
  for (let y = 0; y < padH && startX === -1; y++) {
    for (let x = 0; x < padW; x++) {
      if (padded[y][x]) {
        startX = x;
        startY = y;
        break;
      }
    }
  }
  if (startX === -1) return [];

  // 8-connected directions: 0=E, 1=SE, 2=S, 3=SW, 4=W, 5=NW, 6=N, 7=NE
  const dx = [1, 1, 0, -1, -1, -1, 0, 1];
  const dy = [0, 1, 1, 1, 0, -1, -1, -1];

  const contour: [number, number][] = [];
  let cx = startX;
  let cy = startY;
  // We entered the start pixel from the west (scanning left-to-right)
  let backDir = 4;
  const initialBackDir = backDir;
  const maxIter = padW * padH * 4;
  let steps = 0;

  // Record the start pixel
  contour.push([cx - 1, cy - 1]);

  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (++steps > maxIter) break;

    // Search clockwise starting from (backDir + 1) % 8
    const searchStart = (backDir + 1) % 8;
    let found = false;

    for (let i = 0; i < 8; i++) {
      const d = (searchStart + i) % 8;
      const nx = cx + dx[d];
      const ny = cy + dy[d];

      if (nx >= 0 && nx < padW && ny >= 0 && ny < padH && padded[ny][nx]) {
        backDir = (d + 4) % 8;
        cx = nx;
        cy = ny;
        found = true;
        break;
      }
    }

    if (!found) break; // isolated pixel

    // Stop when we return to the start pixel
    if (cx === startX && cy === startY) break;

    contour.push([cx - 1, cy - 1]);
  }

  return contour;
}

// ---------------------------------------------------------------------------
// Polygon simplification (Ramer-Douglas-Peucker)
// ---------------------------------------------------------------------------

function perpendicularDistance(
  point: [number, number],
  lineStart: [number, number],
  lineEnd: [number, number]
): number {
  const [px, py] = point;
  const [ax, ay] = lineStart;
  const [bx, by] = lineEnd;

  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) {
    // lineStart and lineEnd are the same point
    const ex = px - ax;
    const ey = py - ay;
    return Math.sqrt(ex * ex + ey * ey);
  }

  const t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  const clampedT = Math.max(0, Math.min(1, t));
  const projX = ax + clampedT * dx;
  const projY = ay + clampedT * dy;
  const ex = px - projX;
  const ey = py - projY;
  return Math.sqrt(ex * ex + ey * ey);
}

function rdpSimplify(
  points: [number, number][],
  epsilon: number
): [number, number][] {
  if (points.length <= 2) return [...points];

  let maxDist = 0;
  let maxIdx = 0;

  for (let i = 1; i < points.length - 1; i++) {
    const dist = perpendicularDistance(
      points[i],
      points[0],
      points[points.length - 1]
    );
    if (dist > maxDist) {
      maxDist = dist;
      maxIdx = i;
    }
  }

  if (maxDist > epsilon) {
    const left = rdpSimplify(points.slice(0, maxIdx + 1), epsilon);
    const right = rdpSimplify(points.slice(maxIdx), epsilon);
    return [...left.slice(0, -1), ...right];
  }

  return [points[0], points[points.length - 1]];
}

/**
 * Simplifies a closed polygon. Wraps the array so that the
 * segment from last→first is also considered.
 */
function simplifyClosedPolygon(
  points: [number, number][],
  epsilon: number
): [number, number][] {
  if (points.length <= 3) return [...points];

  // For a closed polygon, duplicate the first point at the end,
  // simplify as an open polyline, then remove the duplicate
  const open: [number, number][] = [...points, points[0]];
  const simplified = rdpSimplify(open, epsilon);

  // Remove the closing duplicate if present
  const last = simplified[simplified.length - 1];
  const first = simplified[0];
  if (last[0] === first[0] && last[1] === first[1]) {
    simplified.pop();
  }

  return simplified;
}

// ---------------------------------------------------------------------------
// Deduplication — contour tracing can revisit the same pixel
// ---------------------------------------------------------------------------

function deduplicateConsecutive(points: [number, number][]): [number, number][] {
  if (points.length === 0) return [];
  const result: [number, number][] = [points[0]];
  for (let i = 1; i < points.length; i++) {
    if (points[i][0] !== points[i - 1][0] || points[i][1] !== points[i - 1][1]) {
      result.push(points[i]);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const args = process.argv.slice(2);
  let atlasPath = "src/entities/enemies/bosses/echo/spine/skeleton.atlas";
  let pngPath = "src/entities/enemies/bosses/echo/spine/skeleton.png";
  let outputPath = "src/entities/enemies/bosses/echo/attachmentPolygons.ts";
  let epsilon = 1.5;
  let threshold = 128;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--atlas":
        atlasPath = args[++i];
        break;
      case "--png":
        pngPath = args[++i];
        break;
      case "--out":
        outputPath = args[++i];
        break;
      case "--epsilon":
        epsilon = parseFloat(args[++i]);
        break;
      case "--threshold":
        threshold = parseInt(args[++i], 10);
        break;
    }
  }

  console.log("Loading atlas:", atlasPath);
  console.log("Loading PNG:", pngPath);

  const atlasText = fs.readFileSync(atlasPath, "utf-8");
  const pngBuffer = fs.readFileSync(pngPath);
  const png = PNG.sync.read(pngBuffer);

  console.log(`PNG size: ${png.width}x${png.height}`);

  const regions = parseAtlas(atlasText);
  console.log(`Found ${regions.length} regions`);

  const results: Record<
    string,
    { points: [number, number][]; width: number; height: number }
  > = {};

  let traced = 0;
  let skipped = 0;

  for (const region of regions) {
    // Skip tiny regions (wires, single-pixel stuff)
    if (region.origW <= 4 || region.origH <= 4) {
      skipped++;
      continue;
    }

    const mask = extractAlphaMask(png, region, threshold);
    const rawContour = traceContour(mask, region.origW, region.origH);

    if (rawContour.length < 3) {
      skipped++;
      continue;
    }

    const deduped = deduplicateConsecutive(rawContour);
    const simplified = simplifyClosedPolygon(deduped, epsilon);

    if (simplified.length < 3) {
      skipped++;
      continue;
    }

    results[region.name] = {
      width: region.origW,
      height: region.origH,
      points: simplified
    };
    traced++;
  }

  console.log(`Traced: ${traced}, Skipped: ${skipped}`);

  // Generate TypeScript output
  const lines: string[] = [];
  lines.push("/**");
  lines.push(" * Auto-generated polygon outlines for Spine attachment regions.");
  lines.push(" * Points are [x, y] pairs in pixels relative to the attachment's top-left.");
  lines.push(" * (0,0) = top-left of the original un-trimmed attachment rect.");
  lines.push(" *");
  lines.push(" * To regenerate:");
  lines.push(" *   npm run scripts:compile");
  lines.push(
    " *   node scripts/ts/trace-spine-regions.js"
  );
  lines.push(" */");
  lines.push("");
  lines.push("export interface AttachmentPolygon {");
  lines.push("  points: [number, number][];");
  lines.push("  width: number;");
  lines.push("  height: number;");
  lines.push("}");
  lines.push("");
  lines.push(
    "const polygons: Record<string, AttachmentPolygon> = {"
  );

  const sortedNames = Object.keys(results).sort();
  for (const name of sortedNames) {
    const { points, width, height } = results[name];
    const pointsStr = points.map(([x, y]) => `[${x},${y}]`).join(",");
    lines.push(`  ${JSON.stringify(name)}: {`);
    lines.push(`    width: ${width},`);
    lines.push(`    height: ${height},`);
    lines.push(`    points: [${pointsStr}]`);
    lines.push("  },");
  }

  lines.push("};");
  lines.push("");
  lines.push("export default polygons;");
  lines.push("");

  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  fs.writeFileSync(outputPath, lines.join("\n"));
  console.log(`Wrote ${outputPath} (${sortedNames.length} attachments)`);
}

main();
