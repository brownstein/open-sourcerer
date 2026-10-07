import { Collider } from "@dimforge/rapier2d-compat";
import pointInPolygon from "point-in-polygon";
import {
  makeCCW,
  quickDecomp,
  removeCollinearPoints,
  removeDuplicatePoints
} from "poly-decomp";
import { intersect as pbIntersect, union as pbUnion } from "polybooljs";
import { centroid as polyCentroid } from "polygon-utils";
import {
  BufferAttribute,
  BufferGeometry,
  Material,
  Mesh,
  Object3D,
  Vector2
} from "three";

import { BaseEntityType, EntityBehavior, LevelAPI } from "src/api/entity";
import { terrainCollisionGroup } from "src/engine/constants/collisionGroups";
import { RenderLayers } from "src/engine/constants/renderLayers";
import { kPixelScale } from "src/engine/constants/scaling";
import { kWorldGravity } from "src/engine/level/Level";
import * as TiledLevelAPI from "src/engine/level/tiled/api";
import { Scheduler } from "src/engine/scheduling/Scheduler";
import { arr2 } from "src/engine/util/vecTypes";
import { IndexedGrid } from "src/util/IndexedGrid";
import { arr2Polygon, getArea } from "src/util/polygons";

import type { DestructableTerrain } from "../DestructableTerrain";

const NEIGHBORS_4: ReadonlyArray<[number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1]
];

// One Tiled tile is 16px = 0.5 world units. A "half-block" = 0.25 world units.
const CELL_SIZE = 0.25;
const MAX_GRID_CELLS = 4096;
// Minimum clipped-cell area to count as an edge cell (avoid sliver fragments
// that produce degenerate triangulations).
const MIN_EDGE_CELL_AREA = CELL_SIZE * CELL_SIZE * 0.05;

// Each fragment is a centroid-fan-triangulated cell sub-region. Full cells
// have 4 perimeter verts (a quad); edge cells have however many the polygon
// clip produced. The fragment always has (1 centroid + N perimeter) verts
// and N triangles in the fan.
type SubFragment = {
  cellKey: string;
  // World-position of the fragment's anchor point (centroid). Mutated during
  // falling animation.
  pos: Vector2;
  basePos: Vector2;
  vel: Vector2;
  acc: Vector2;
  rot: number;
  angVel: number;
  scale: number;
  falling: boolean;
  bornAtMs: number;

  // Vertex offsets relative to basePos, [dx, dy, dx, dy, ...]. The first
  // entry is the centroid (always 0,0); subsequent entries are perimeter
  // verts.
  localOffsets: Float32Array;
  vertCount: number;
  // Where this fragment's vertices live in the shared geometry buffers.
  geomVertexStart: number;
};

type SheetRender = {
  sheet: TiledLevelAPI.TiledJsonSheetSrcInfo;
  geom: BufferGeometry;
  material: Material;
  mesh: Mesh;
  fragments: SubFragment[];
};

export type CrumbleGridSnapshot = {
  gridBuilt: boolean;
  filledCells: string[];
  // Each entry is [gx, gy, remainingExpansions] for a frontier cell.
  removalFrontier: Array<[number, number, number]>;
  removalActive: boolean;
};

export class CrumbleGridBehavior implements EntityBehavior {
  static type = "CrumbleGrid";
  public type = CrumbleGridBehavior.type;

  private entity?: DestructableTerrain;
  private level?: LevelAPI;
  private terrain?: TiledLevelAPI.MapTerrain;

  // Grid state.
  private cellSize = CELL_SIZE;
  private gridOriginX = 0;
  private gridOriginY = 0;
  private cellGridCoords = new Map<string, [number, number]>();
  private fullCells = new Set<string>();
  // Edge cells store their cell-quad ∩ polygon clip result (entity-local
  // coords) for use by both rendering and physics.
  private edgeCellPolygons = new Map<string, arr2Polygon>();
  // boundaryCells: cells that had at least one neighbor NOT in cellGridCoords
  // when the grid was built. Used for outward propagation raycasts.
  private boundaryCells = new Map<string, [number, number][]>();
  private filledCells = new Set<string>();
  private gridBuilt = false;

  // BFS state. The frontier maps a cell's grid coords (gx, gy) to the number
  // of additional expansions that cell is allowed to seed. Each wave removes
  // every frontier cell and seeds its still-filled neighbors with
  // (budget - 1); a cell with budget <= 0 stops the spread. There is no
  // global cell-count budget — the per-cell expansion count bounds removal.
  private removalFrontier = new IndexedGrid<number>();
  private removalActive = false;
  // One ring is processed per wave (the entire current frontier).
  private waveIntervalMs = 100;
  private fallDurationMs = 600;

  // Scheduler.
  private scheduler = new Scheduler();
  private currentMs = 0;
  private finalFadeStartedAt: number | null = null;

  // Object3D root, attached under entity.object3D when first built.
  private object3D = new Object3D();
  private rootAttached = false;
  private sheets: SheetRender[] = [];

  // cellKey -> list of (sheet, fragmentIndex) for fast lookup when a cell is
  // removed.
  private cellToFragments = new Map<string, Array<[SheetRender, number]>>();

  // Active collider list for the body — managed by us.
  private myColliders: Collider[] = [];
  private isPlatform = false;
  private isFilterable = false;

  // Event callback for final fade-out.
  private onFullyCrumbled?: () => void;

  constructor() {
    this.processWave = this.processWave.bind(this);
  }

  init(entity: BaseEntityType) {
    this.entity = entity as DestructableTerrain;
  }

  initWithTerrainEntity(entity: DestructableTerrain) {
    this.entity = entity;
    return this;
  }

  setTerrain(terrain: TiledLevelAPI.MapTerrain) {
    this.terrain = terrain;
    switch (terrain.tileType) {
      case TiledLevelAPI.TileType.platform:
      case TiledLevelAPI.TileType.platformStairsLeft:
      case TiledLevelAPI.TileType.platformStairsRight:
        this.isPlatform = true;
        break;
      default:
        break;
    }
    return this;
  }

  setFilterable(filterable: boolean) {
    this.isFilterable = filterable;
    return this;
  }

  setOnFullyCrumbled(cb: () => void) {
    this.onFullyCrumbled = cb;
    return this;
  }

  attachToLevel(level: LevelAPI) {
    this.level = level;
  }

  detachFromLevel(level: LevelAPI) {
    this.scheduler.cancelAll();
    this.removeAllColliders(level);
  }

  destroy() {
    this.scheduler.cancelAll();
    for (const sheet of this.sheets) {
      sheet.mesh?.removeFromParent();
      sheet.geom.dispose();
    }
    this.sheets.length = 0;
    this.object3D.removeFromParent();
  }

  isActive() {
    return this.removalActive;
  }

  isFullyCrumbled() {
    return this.gridBuilt && this.filledCells.size === 0;
  }

  step(ms: number) {
    this.currentMs += ms;
    this.scheduler.step(ms);
    if (this.gridBuilt) {
      this.advanceFallingFragments(ms);
    }
  }

  // Lazy grid construction. Idempotent.
  buildGridIfNeeded() {
    if (this.gridBuilt) return;
    if (!this.entity || !this.terrain || !this.level) return;
    this.buildCells();
    this.buildSubFragmentMeshes();
    this.replaceBodyColliders();
    this.gridBuilt = true;
  }

  // Start (or merge into an existing) BFS removal seeded at a local-space
  // point. Idempotent — if a crumble is already active, the nearest filled
  // cell to `localPoint` is added to the current frontier.
  //
  //   budget: the number of expansions the seed cell may spread. The seed is
  //     removed and seeds (budget - 1) into each neighbor, so removal reaches
  //     a diamond of radius (budget - 1) around the seed. Omit for unbounded
  //     removal (the whole terrain crumbles).
  startCrumble(localPoint?: Vector2, budget: number = Infinity): void {
    if (!this.entity || !this.terrain || !this.level) return;
    this.buildGridIfNeeded();
    if (this.filledCells.size === 0) return;

    const seedKey = this.findNearestFilledCellKey(localPoint);
    if (!seedKey) return;
    const coords = this.cellGridCoords.get(seedKey);
    if (!coords) return;
    this.setFrontierMax(this.removalFrontier, coords[0], coords[1], budget);
    this.ensureWaveScheduled();
  }

  // Explosive removal: destroy every filled cell whose center lies within
  // `worldRadius` of `worldCenter` immediately, then seed the surrounding
  // still-filled cells with `expansionBudget` so the crumble continues to
  // spread outward beyond the blast. Used for circular HitShapes carrying
  // explosion damage.
  explodeCircle(
    worldCenter: { x: number; y: number },
    worldRadius: number,
    expansionBudget: number
  ): void {
    if (!this.entity || !this.terrain || !this.level) return;
    this.buildGridIfNeeded();
    if (this.filledCells.size === 0) return;

    const [lcx, lcy] = this.worldToLocalPoint(worldCenter.x, worldCenter.y);
    const r2 = worldRadius * worldRadius;

    const destroyed: Array<[number, number]> = [];
    for (const key of [...this.filledCells]) {
      const coords = this.cellGridCoords.get(key);
      if (!coords) continue;
      const [gx, gy] = coords;
      const cx = this.gridOriginX + (gx + 0.5) * this.cellSize;
      const cy = this.gridOriginY + (gy + 0.5) * this.cellSize;
      const ddx = cx - lcx;
      const ddy = cy - lcy;
      if (ddx * ddx + ddy * ddy > r2) continue;
      this.filledCells.delete(key);
      this.hideFragmentsForCell(key);
      destroyed.push([gx, gy]);
    }

    // The circle didn't cover any cell center (tiny blast / thin terrain) —
    // fall back to a point-seeded crumble so a hit still does something.
    if (destroyed.length === 0) {
      this.startCrumble(new Vector2(lcx, lcy), expansionBudget);
      return;
    }

    // Seed the expansion frontier from the still-filled neighbors ringing
    // the blast crater.
    const probeList: Array<{ key: string; budget: number }> = [];
    if (expansionBudget > 0) {
      for (const [gx, gy] of destroyed) {
        for (const [dx, dy] of NEIGHBORS_4) {
          const nx = gx + dx;
          const ny = gy + dy;
          if (this.filledCells.has(`${nx},${ny}`)) {
            this.setFrontierMax(this.removalFrontier, nx, ny, expansionBudget);
          }
        }
        probeList.push({ key: `${gx},${gy}`, budget: expansionBudget });
      }
    }

    this.replaceBodyColliders();
    if (probeList.length > 0) this.probeNeighborsForRemovedCells(probeList);

    if (this.removalFrontier.size > 0) {
      this.ensureWaveScheduled();
    } else {
      this.checkFullyCrumbled();
    }
  }

  // Remove everything at once (backward-compat path).
  crumbleAll(): void {
    if (!this.entity || !this.terrain || !this.level) return;
    this.buildGridIfNeeded();
    if (this.filledCells.size === 0) return;
    this.removalFrontier = new IndexedGrid<number>();
    for (const key of this.filledCells) {
      const coords = this.cellGridCoords.get(key);
      if (!coords) continue;
      // Budget 1: every cell is already seeded, so the first wave removes them
      // all without needing to expand into neighbors.
      this.removalFrontier.set(coords[0], coords[1], 1);
    }
    this.ensureWaveScheduled();
  }

  private setFrontierMax(
    grid: IndexedGrid<number>,
    x: number,
    y: number,
    budget: number
  ) {
    const existing = grid.get(x, y);
    if (existing === undefined || existing < budget) grid.set(x, y, budget);
  }

  private ensureWaveScheduled() {
    if (this.removalActive) return;
    if (this.removalFrontier.size === 0) return;
    this.removalActive = true;
    this.scheduler.cancel("crumbleWave");
    this.scheduler.add({
      id: "crumbleWave",
      recurring: true,
      duration: this.waveIntervalMs,
      invokeFunctionAtComplete: this.processWave
    });
  }

  // Convert a world-space point into the entity-local frame the cell grid
  // lives in (accounting for the entity's rotation).
  private worldToLocalPoint(wx: number, wy: number): [number, number] {
    if (!this.entity) return [wx, wy];
    const ang = this.entity.angle ?? 0;
    const ox = wx - this.entity.position.x;
    const oy = wy - this.entity.position.y;
    const cos = Math.cos(-ang);
    const sin = Math.sin(-ang);
    return [ox * cos - oy * sin, ox * sin + oy * cos];
  }

  // -----------------------------------------------------------------
  // Grid construction
  // -----------------------------------------------------------------

  private buildCells() {
    if (!this.terrain) return;
    const polygon: arr2[] = this.terrain.polygon.map(
      (v) => [v.x, v.y] as arr2
    );
    if (polygon.length < 3) return;

    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;
    for (const [x, y] of polygon) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }

    this.cellSize = CELL_SIZE;
    while (
      Math.ceil((maxX - minX) / this.cellSize) *
        Math.ceil((maxY - minY) / this.cellSize) >
      MAX_GRID_CELLS
    ) {
      this.cellSize *= 2;
    }
    this.gridOriginX = Math.floor(minX / this.cellSize) * this.cellSize;
    this.gridOriginY = Math.floor(minY / this.cellSize) * this.cellSize;

    const maxGX = Math.ceil((maxX - this.gridOriginX) / this.cellSize);
    const maxGY = Math.ceil((maxY - this.gridOriginY) / this.cellSize);

    // Sample all corner points once.
    const cornerFilled = new Map<string, boolean>();
    for (let cx = 0; cx <= maxGX; cx++) {
      for (let cy = 0; cy <= maxGY; cy++) {
        const wx = this.gridOriginX + cx * this.cellSize;
        const wy = this.gridOriginY + cy * this.cellSize;
        cornerFilled.set(
          `${cx},${cy}`,
          pointInPolygon([wx, wy], polygon) as boolean
        );
      }
    }

    // Rasterize polygon edges to find candidate cells that an edge passes
    // through but doesn't cover any corner (e.g. thin slopes).
    const edgeCandidates = new Set<string>();
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i];
      const b = polygon[(i + 1) % polygon.length];
      this.rasterizeEdgeToCells(a, b, maxGX, maxGY, edgeCandidates);
    }

    // Classify cells based on corner count + edge candidates.
    for (let gx = 0; gx < maxGX; gx++) {
      for (let gy = 0; gy < maxGY; gy++) {
        const key = `${gx},${gy}`;
        const c00 = cornerFilled.get(`${gx},${gy}`) ?? false;
        const c10 = cornerFilled.get(`${gx + 1},${gy}`) ?? false;
        const c11 = cornerFilled.get(`${gx + 1},${gy + 1}`) ?? false;
        const c01 = cornerFilled.get(`${gx},${gy + 1}`) ?? false;
        const filledCount =
          (c00 ? 1 : 0) + (c10 ? 1 : 0) + (c11 ? 1 : 0) + (c01 ? 1 : 0);
        if (filledCount === 0 && !edgeCandidates.has(key)) continue;

        if (filledCount === 4) {
          this.cellGridCoords.set(key, [gx, gy]);
          this.fullCells.add(key);
          this.filledCells.add(key);
          continue;
        }

        // Partial coverage — clip the cell quad against the polygon.
        const x0 = this.gridOriginX + gx * this.cellSize;
        const y0 = this.gridOriginY + gy * this.cellSize;
        const x1 = x0 + this.cellSize;
        const y1 = y0 + this.cellSize;
        const cellQuad: arr2Polygon = [
          [x0, y0],
          [x1, y0],
          [x1, y1],
          [x0, y1]
        ];
        try {
          const clipped = pbIntersect(
            { regions: [cellQuad], inverted: false },
            { regions: [polygon], inverted: false }
          );
          if (clipped.regions.length === 0) continue;
          const poly = clipped.regions[0];
          if (poly.length < 3) continue;
          makeCCW(poly);
          removeCollinearPoints(poly, 0.001);
          removeDuplicatePoints(poly, 0.001);
          if (poly.length < 3) continue;
          if (getArea(poly) < MIN_EDGE_CELL_AREA) continue;
          this.cellGridCoords.set(key, [gx, gy]);
          this.edgeCellPolygons.set(key, poly);
          this.filledCells.add(key);
        } catch {
          // Boolean op failed — skip this cell.
        }
      }
    }

    // Compute boundary cells.
    for (const [key, [gx, gy]] of this.cellGridCoords) {
      const outwardDirs: [number, number][] = [];
      for (const [dx, dy] of NEIGHBORS_4) {
        const nKey = `${gx + dx},${gy + dy}`;
        if (!this.cellGridCoords.has(nKey)) outwardDirs.push([dx, dy]);
      }
      if (outwardDirs.length > 0) this.boundaryCells.set(key, outwardDirs);
    }
  }

  // DDA rasterization of a polygon edge onto the cell grid.
  private rasterizeEdgeToCells(
    a: arr2,
    b: arr2,
    maxGX: number,
    maxGY: number,
    out: Set<string>
  ) {
    const ax = (a[0] - this.gridOriginX) / this.cellSize;
    const ay = (a[1] - this.gridOriginY) / this.cellSize;
    const bx = (b[0] - this.gridOriginX) / this.cellSize;
    const by = (b[1] - this.gridOriginY) / this.cellSize;
    const dx = bx - ax;
    const dy = by - ay;
    const steps = Math.ceil(Math.max(Math.abs(dx), Math.abs(dy), 1) * 2);
    const stepX = dx / steps;
    const stepY = dy / steps;
    let px = ax;
    let py = ay;
    for (let s = 0; s <= steps; s++) {
      const gx = Math.floor(px);
      const gy = Math.floor(py);
      if (gx >= 0 && gx < maxGX && gy >= 0 && gy < maxGY) {
        out.add(`${gx},${gy}`);
      }
      const fracX = px - gx;
      const fracY = py - gy;
      if (fracX < 0.01 && gx - 1 >= 0) out.add(`${gx - 1},${gy}`);
      if (fracX > 0.99 && gx + 1 < maxGX) out.add(`${gx + 1},${gy}`);
      if (fracY < 0.01 && gy - 1 >= 0) out.add(`${gx},${gy - 1}`);
      if (fracY > 0.99 && gy + 1 < maxGY) out.add(`${gx},${gy + 1}`);
      px += stepX;
      py += stepY;
    }
  }

  // -----------------------------------------------------------------
  // Sub-tile fragment rendering
  // -----------------------------------------------------------------
  //
  // Each cell becomes one fragment, rendered as a centroid fan: 1 center
  // vertex + N perimeter vertices around it, with N triangles in the fan.
  // - Full cells use a 4-corner quad (5 verts total, 4 triangles).
  // - Edge cells use the cell-quad ∩ polygon clip (N+1 verts, N triangles).
  // UVs sample the parent decal tile's sub-rect; uv2 mirrors world position
  // so the cracks shader's tiling stays continuous.

  private buildSubFragmentMeshes() {
    if (!this.entity || !this.terrain) return;

    this.entity.hideOriginalTileMesh();
    if (!this.rootAttached) {
      this.entity.object3D.add(this.object3D);
      this.rootAttached = true;
    }

    const tilesBySheet = new Map<string, TiledLevelAPI.MapTile[]>();
    for (const tile of this.terrain.decalTiles) {
      const sheetName = tile.def.src.sheet.name;
      if (!tilesBySheet.has(sheetName)) tilesBySheet.set(sheetName, []);
      tilesBySheet.get(sheetName)?.push(tile);
    }

    const materialsBySheet = this.entity.getMaterialsBySheet();

    for (const [sheetName, sheetTiles] of tilesBySheet) {
      const sheet = sheetTiles[0].def.src.sheet;
      const material = materialsBySheet.get(sheetName);
      if (!material) continue;

      const tileW = sheet.tileSize.x / kPixelScale;
      const tileH = sheet.tileSize.y / kPixelScale;
      const subsX = Math.max(1, Math.round(tileW / this.cellSize));
      const subsY = Math.max(1, Math.round(tileH / this.cellSize));
      const fragW = tileW / subsX;
      const fragH = tileH / subsY;
      const invUvX = 1 / sheet.textureSize.x;
      const invUvY = 1 / sheet.textureSize.y;

      // Collect per-fragment data first to size the buffers.
      type FragSpec = {
        cellKey: string;
        tile: TiledLevelAPI.MapTile;
        sx: number;
        sy: number;
        // Verts in entity-local coords. First entry is centroid, rest are
        // perimeter in fan order.
        perimeter: arr2[];
        centroid: arr2;
      };
      const specs: FragSpec[] = [];

      for (const tile of sheetTiles) {
        for (let sy = 0; sy < subsY; sy++) {
          for (let sx = 0; sx < subsX; sx++) {
            const cx = tile.pos.x + sx * fragW + fragW * 0.5;
            const cy = tile.pos.y - sy * fragH - fragH * 0.5;
            const gx = Math.floor((cx - this.gridOriginX) / this.cellSize);
            const gy = Math.floor((cy - this.gridOriginY) / this.cellSize);
            const cellKey = `${gx},${gy}`;
            if (!this.cellGridCoords.has(cellKey)) continue;

            let perimeter: arr2[];
            if (this.fullCells.has(cellKey)) {
              // Quad: TL, TR, BR, BL. Render Y-down (cell quad uses world Y;
              // sub-tile rendering uses Tiled-style Y-down within the tile).
              const x0 = tile.pos.x + sx * fragW;
              const y0 = tile.pos.y - sy * fragH;
              const x1 = x0 + fragW;
              const y1 = y0 - fragH;
              perimeter = [
                [x0, y0],
                [x1, y0],
                [x1, y1],
                [x0, y1]
              ];
            } else {
              const edgePoly = this.edgeCellPolygons.get(cellKey);
              if (!edgePoly || edgePoly.length < 3) continue;
              // The clipped polygon is in CCW world-Y-up orientation. The
              // tile rendering is Y-down. Both Three and Rapier treat Y
              // freely — what matters is winding for back-face culling.
              // ShaderMaterial we use has side: DoubleSide so winding is OK
              // either way.
              perimeter = edgePoly.map(([x, y]) => [x, y] as arr2);
            }

            // Compute centroid.
            let centX = 0,
              centY = 0;
            for (const [px, py] of perimeter) {
              centX += px;
              centY += py;
            }
            centX /= perimeter.length;
            centY /= perimeter.length;

            specs.push({
              cellKey,
              tile,
              sx,
              sy,
              perimeter,
              centroid: [centX, centY]
            });
          }
        }
      }

      if (specs.length === 0) continue;

      // Each fragment contributes (1 + N) verts and N triangle indices.
      let totalVerts = 0;
      let totalIndices = 0;
      for (const s of specs) {
        totalVerts += 1 + s.perimeter.length;
        totalIndices += 3 * s.perimeter.length;
      }

      const geom = new BufferGeometry();
      const indexArr = new Uint32Array(totalIndices);
      const posArr = new Float32Array(totalVerts * 3);
      const uvArr = new Float32Array(totalVerts * 2);
      const uv2Arr = new Float32Array(totalVerts * 2);

      const fragments: SubFragment[] = [];
      const sheetRender: SheetRender = {
        sheet,
        geom,
        material,
        mesh: null as unknown as Mesh,
        fragments
      };

      let vertCursor = 0;
      let idxCursor = 0;
      for (const spec of specs) {
        const [centX, centY] = spec.centroid;
        const vertStart = vertCursor;
        const perimCount = spec.perimeter.length;

        const localOffsets = new Float32Array((1 + perimCount) * 2);
        // Centroid vertex.
        writeVertex(
          posArr,
          uvArr,
          uv2Arr,
          vertCursor,
          centX,
          centY,
          spec.tile,
          tileW,
          tileH,
          invUvX,
          invUvY
        );
        localOffsets[0] = 0;
        localOffsets[1] = 0;
        vertCursor++;

        for (let i = 0; i < perimCount; i++) {
          const [px, py] = spec.perimeter[i];
          writeVertex(
            posArr,
            uvArr,
            uv2Arr,
            vertCursor,
            px,
            py,
            spec.tile,
            tileW,
            tileH,
            invUvX,
            invUvY
          );
          localOffsets[(1 + i) * 2 + 0] = px - centX;
          localOffsets[(1 + i) * 2 + 1] = py - centY;
          vertCursor++;
        }

        // Fan triangles.
        for (let i = 0; i < perimCount; i++) {
          indexArr[idxCursor + 0] = vertStart;
          indexArr[idxCursor + 1] = vertStart + 1 + i;
          indexArr[idxCursor + 2] = vertStart + 1 + ((i + 1) % perimCount);
          idxCursor += 3;
        }

        const frag: SubFragment = {
          cellKey: spec.cellKey,
          pos: new Vector2(centX, centY),
          basePos: new Vector2(centX, centY),
          vel: new Vector2(),
          acc: new Vector2(),
          rot: 0,
          angVel: 0,
          scale: 1,
          falling: false,
          bornAtMs: 0,
          localOffsets,
          vertCount: 1 + perimCount,
          geomVertexStart: vertStart
        };
        fragments.push(frag);
      }

      geom.setIndex(new BufferAttribute(indexArr, 1));
      geom.setAttribute("position", new BufferAttribute(posArr, 3));
      geom.setAttribute("uv", new BufferAttribute(uvArr, 2));
      geom.setAttribute("uv2", new BufferAttribute(uv2Arr, 2));

      const mesh = new Mesh(geom, material);
      mesh.layers.set(RenderLayers.default);
      this.object3D.add(mesh);
      sheetRender.mesh = mesh;
      this.sheets.push(sheetRender);

      for (let i = 0; i < fragments.length; i++) {
        const frag = fragments[i];
        if (!this.cellToFragments.has(frag.cellKey)) {
          this.cellToFragments.set(frag.cellKey, []);
        }
        this.cellToFragments.get(frag.cellKey)!.push([sheetRender, i]);
      }
    }
  }

  // Update geometry for fragments that are currently falling.
  private advanceFallingFragments(deltaMs: number) {
    for (const sheet of this.sheets) {
      let sheetDirty = false;
      const posArr = sheet.geom.getAttribute("position").array as Float32Array;
      for (const frag of sheet.fragments) {
        if (!frag.falling) continue;
        sheetDirty = true;
        const dt = deltaMs * 0.001;
        frag.pos.x += frag.vel.x * dt;
        frag.pos.y += frag.vel.y * dt;
        frag.vel.x += frag.acc.x * dt;
        frag.vel.y += frag.acc.y * dt;
        frag.rot += frag.angVel * dt;

        const age = this.currentMs - frag.bornAtMs;
        const t = Math.min(age / this.fallDurationMs, 1);
        frag.scale = 1 - t;

        const cosR = Math.cos(frag.rot);
        const sinR = Math.sin(frag.rot);
        const px = frag.pos.x;
        const py = frag.pos.y;
        const s = frag.scale;
        for (let v = 0; v < frag.vertCount; v++) {
          const lx = frag.localOffsets[v * 2 + 0] * s;
          const ly = frag.localOffsets[v * 2 + 1] * s;
          const rx = lx * cosR - ly * sinR;
          const ry = lx * sinR + ly * cosR;
          posArr[(frag.geomVertexStart + v) * 3 + 0] = px + rx;
          posArr[(frag.geomVertexStart + v) * 3 + 1] = py + ry;
        }

        if (t >= 1) {
          // Collapse vertices onto a single point so the fragment doesn't
          // render as a visible degenerate triangle fan.
          for (let v = 0; v < frag.vertCount; v++) {
            posArr[(frag.geomVertexStart + v) * 3 + 0] = px;
            posArr[(frag.geomVertexStart + v) * 3 + 1] = py;
          }
          frag.falling = false;
        }
      }
      if (sheetDirty) {
        sheet.geom.getAttribute("position").needsUpdate = true;
      }
    }
  }

  private hideFragmentsForCell(cellKey: string) {
    const frags = this.cellToFragments.get(cellKey);
    if (!frags) return;
    for (const [sheet, idx] of frags) {
      const frag = sheet.fragments[idx];
      if (frag.falling) continue;
      frag.falling = true;
      frag.bornAtMs = this.currentMs;
      frag.vel.x = (Math.random() - 0.5) * 2;
      frag.vel.y = 0.5 + Math.random() * 1.5;
      frag.acc.x = kWorldGravity.x;
      frag.acc.y = kWorldGravity.y;
      frag.angVel = (Math.random() - 0.5) * Math.PI * 4;
    }
  }

  // -----------------------------------------------------------------
  // BFS wave
  // -----------------------------------------------------------------

  private processWave() {
    if (!this.entity || !this.terrain || !this.level) return;
    if (!this.removalActive) return;

    if (this.removalFrontier.size === 0) {
      this.endWave();
      return;
    }

    // Process the whole current frontier (one ring). Each removed cell seeds
    // its still-filled neighbors with one fewer expansion; a cell whose budget
    // drops to 0 is the last to fall along that path.
    const current = [...this.removalFrontier];
    const next = new IndexedGrid<number>();
    const probeList: Array<{ key: string; budget: number }> = [];
    let anyRemoved = false;

    for (const [[gx, gy], budget] of current) {
      const key = `${gx},${gy}`;
      if (!this.filledCells.has(key)) continue;
      this.filledCells.delete(key);
      this.hideFragmentsForCell(key);
      anyRemoved = true;

      const childBudget = budget - 1;
      if (childBudget <= 0) continue;
      probeList.push({ key, budget: childBudget });
      for (const [dx, dy] of NEIGHBORS_4) {
        const nx = gx + dx;
        const ny = gy + dy;
        if (this.filledCells.has(`${nx},${ny}`)) {
          this.setFrontierMax(next, nx, ny, childBudget);
        }
      }
    }

    this.removalFrontier = next;

    if (anyRemoved) this.replaceBodyColliders();
    if (probeList.length > 0) this.probeNeighborsForRemovedCells(probeList);

    if (this.removalFrontier.size === 0) this.endWave();
  }

  private endWave() {
    this.removalActive = false;
    this.scheduler.cancel("crumbleWave");
    this.checkFullyCrumbled();
  }

  private checkFullyCrumbled() {
    if (this.filledCells.size === 0 && this.finalFadeStartedAt === null) {
      this.finalFadeStartedAt = this.currentMs;
      this.onFullyCrumbled?.();
    }
  }

  // -----------------------------------------------------------------
  // Physics collider rebuild
  // -----------------------------------------------------------------

  // Replace the body's colliders with as-few-as-possible shapes derived
  // from currently filled cells. Strategy:
  //  1. Partition filled cells into 4-connected components.
  //  2. Components made entirely of FULL cells use greedy rectangle
  //     merging into Rapier cuboids (cheapest collider type).
  //  3. Mixed components (any edge cells) get all their cell polygons
  //     unioned via polybooljs, simplified to drop the redundant grid
  //     vertices introduced by union, then convex-decomposed once for the
  //     whole component — producing as few ConvexPolygon colliders as the
  //     decomposition can manage.
  //  4. After all colliders are (re)created, notify the level so its
  //     collider→entityId mappings include the new handles.
  private replaceBodyColliders() {
    if (!this.entity || !this.level) return;
    const body = this.entity.getRigidBody();
    if (!body) return;
    const level = this.level;

    // Remove every existing collider on this body — we own them all once
    // buildGridIfNeeded has run.
    const nc = body.numColliders();
    for (let i = nc - 1; i >= 0; i--) {
      const c = body.collider(i);
      level.world.removeCollider(c, false);
    }
    this.myColliders.length = 0;

    if (this.filledCells.size === 0) {
      this.notifyLevelOfColliderChange();
      return;
    }

    const components = this.findConnectedComponents(this.filledCells);
    for (const comp of components) {
      const allFull = comp.every((k) => this.fullCells.has(k));
      if (allFull) {
        this.createCuboidsFromFullComponent(comp);
      } else {
        this.createConvexFromMixedComponent(comp);
      }
    }

    this.notifyLevelOfColliderChange();
  }

  private notifyLevelOfColliderChange() {
    if (!this.entity || !this.level) return;
    const body = this.entity.getRigidBody();
    if (!body) return;
    // Re-sync the level's colliderHandle → entityId map for the new set
    // of colliders attached to our body. (Stale entries for removed
    // colliders remain in the map but are harmless — Rapier doesn't
    // reuse handles immediately, and any future reuse will be overwritten
    // by the next register/update call.)
    this.level.updateEntityPhysicsHooks({
      entityId: this.entity.id,
      rigidBodyHandle: body.handle
    });
  }

  // Greedy rectangle merge over an all-full-cell component. Emits cuboid
  // colliders for each maximal axis-aligned rectangle.
  private createCuboidsFromFullComponent(comp: string[]) {
    if (!this.entity || !this.level) return;
    const body = this.entity.getRigidBody();
    if (!body) return;
    const level = this.level;

    const inComp = new Set(comp);
    let minGX = Infinity,
      maxGX = -Infinity,
      minGY = Infinity,
      maxGY = -Infinity;
    for (const key of comp) {
      const coords = this.cellGridCoords.get(key);
      if (!coords) continue;
      const [gx, gy] = coords;
      if (gx < minGX) minGX = gx;
      if (gx > maxGX) maxGX = gx;
      if (gy < minGY) minGY = gy;
      if (gy > maxGY) maxGY = gy;
    }
    if (minGX > maxGX) return;
    const visited = new Set<string>();
    for (let gy = minGY; gy <= maxGY; gy++) {
      for (let gx = minGX; gx <= maxGX; gx++) {
        const key = `${gx},${gy}`;
        if (visited.has(key)) continue;
        if (!inComp.has(key)) continue;
        let endX = gx;
        while (endX + 1 <= maxGX) {
          const nk = `${endX + 1},${gy}`;
          if (!visited.has(nk) && inComp.has(nk)) {
            endX++;
          } else {
            break;
          }
        }
        let endY = gy;
        outer: while (endY + 1 <= maxGY) {
          for (let x = gx; x <= endX; x++) {
            const nk = `${x},${endY + 1}`;
            if (!inComp.has(nk) || visited.has(nk)) {
              break outer;
            }
          }
          endY++;
        }
        for (let y = gy; y <= endY; y++) {
          for (let x = gx; x <= endX; x++) visited.add(`${x},${y}`);
        }
        const rectW = (endX - gx + 1) * this.cellSize;
        const rectH = (endY - gy + 1) * this.cellSize;
        const cx = this.gridOriginX + gx * this.cellSize + rectW * 0.5;
        const cy = this.gridOriginY + gy * this.cellSize + rectH * 0.5;
        const desc = level.rapier.ColliderDesc.cuboid(rectW * 0.5, rectH * 0.5)
          .setTranslation(cx, cy)
          .setDensity(1)
          .setFriction(0.5)
          .setCollisionGroups(terrainCollisionGroup);
        if (this.isFilterable || this.isPlatform) {
          desc.setActiveHooks(level.rapier.ActiveHooks.FILTER_CONTACT_PAIRS);
        }
        desc.setActiveEvents(level.rapier.ActiveEvents.COLLISION_EVENTS);
        try {
          this.myColliders.push(level.world.createCollider(desc, body));
        } catch (err) {
          console.error("[CrumbleGrid] failed cuboid collider", err);
        }
      }
    }
  }

  // Union all cell polygons in a mixed (some edge cells) component, then
  // convex-decompose. Simplifies the unioned outline so that long straight
  // runs of cell edges collapse to single edges, dramatically reducing the
  // convex-piece count for slopes / large mixed regions.
  private createConvexFromMixedComponent(comp: string[]) {
    if (!this.level) return;
    const cellPolys: arr2Polygon[] = [];
    for (const key of comp) {
      const cp = this.cellPolygonFor(key);
      if (cp && cp.length >= 3) cellPolys.push(cp);
    }
    if (cellPolys.length === 0) return;

    let mergedRegions: arr2Polygon[];
    try {
      const result = pbUnion(
        { regions: cellPolys, inverted: false },
        { regions: [], inverted: false }
      );
      mergedRegions = result.regions.length > 0 ? result.regions : cellPolys;
    } catch {
      mergedRegions = cellPolys;
    }

    for (const region of mergedRegions) {
      if (region.length < 3) continue;
      // Simplify: drop collinear/duplicate vertices left over from the
      // cell-boundary union seams.
      removeCollinearPoints(region, 0.001);
      removeDuplicatePoints(region, 0.001);
      if (region.length < 3) continue;
      makeCCW(region);
      if (getArea(region) < 0.001) continue;
      this.createConvexColliders(region);
    }
  }

  // 4-connected component traversal over filled cells.
  private findConnectedComponents(filled: Set<string>): string[][] {
    const visited = new Set<string>();
    const components: string[][] = [];
    for (const startKey of filled) {
      if (visited.has(startKey)) continue;
      const comp: string[] = [];
      const stack: string[] = [startKey];
      while (stack.length > 0) {
        const k = stack.pop()!;
        if (visited.has(k)) continue;
        visited.add(k);
        comp.push(k);
        const coords = this.cellGridCoords.get(k);
        if (!coords) continue;
        const [gx, gy] = coords;
        for (const [dx, dy] of NEIGHBORS_4) {
          const nk = `${gx + dx},${gy + dy}`;
          if (filled.has(nk) && !visited.has(nk)) stack.push(nk);
        }
      }
      components.push(comp);
    }
    return components;
  }

  private cellPolygonFor(key: string): arr2Polygon | null {
    if (this.fullCells.has(key)) {
      const coords = this.cellGridCoords.get(key);
      if (!coords) return null;
      const [gx, gy] = coords;
      const x0 = this.gridOriginX + gx * this.cellSize;
      const y0 = this.gridOriginY + gy * this.cellSize;
      const x1 = x0 + this.cellSize;
      const y1 = y0 + this.cellSize;
      return [
        [x0, y0],
        [x1, y0],
        [x1, y1],
        [x0, y1]
      ];
    }
    const edgePoly = this.edgeCellPolygons.get(key);
    return edgePoly ?? null;
  }

  private createConvexColliders(polygon: arr2Polygon) {
    if (!this.level || !this.entity) return;
    const body = this.entity.getRigidBody();
    if (!body) return;
    const { world, rapier } = this.level;

    const components = quickDecomp([...polygon]);
    for (const comp of components) {
      removeCollinearPoints(comp, 0.005);
      removeDuplicatePoints(comp, 0.005);
      if (comp.length < 3) continue;
      if (getArea(comp) < 0.001) continue;
      makeCCW(comp);
      const c = polyCentroid(comp) as [number, number];
      let cxN = c[0];
      let cyN = c[1];
      if (!Number.isFinite(cxN) || !Number.isFinite(cyN)) {
        cxN = 0;
        cyN = 0;
        for (const [x, y] of comp) {
          cxN += x;
          cyN += y;
        }
        cxN /= comp.length;
        cyN /= comp.length;
      }
      const vtxArr = new Float32Array(comp.length * 2);
      for (let i = 0; i < comp.length; i++) {
        vtxArr[i * 2 + 0] = comp[i][0] - cxN;
        vtxArr[i * 2 + 1] = comp[i][1] - cyN;
      }
      const colliderDesc = new rapier.ColliderDesc(
        new rapier.ConvexPolygon(vtxArr, false)
      )
        .setTranslation(cxN, cyN)
        .setDensity(1)
        .setFriction(0.5)
        .setCollisionGroups(terrainCollisionGroup);
      if (this.isFilterable || this.isPlatform) {
        colliderDesc.setActiveHooks(rapier.ActiveHooks.FILTER_CONTACT_PAIRS);
      }
      colliderDesc.setActiveEvents(rapier.ActiveEvents.COLLISION_EVENTS);
      try {
        this.myColliders.push(world.createCollider(colliderDesc, body));
      } catch (err) {
        console.error("[CrumbleGrid] failed convex collider", err);
      }
    }
  }

  private removeAllColliders(level: LevelAPI) {
    for (const c of this.myColliders) {
      try {
        level.world.removeCollider(c, false);
      } catch {
        // ignore
      }
    }
    this.myColliders.length = 0;
  }

  // -----------------------------------------------------------------
  // Cross-terrain propagation
  // -----------------------------------------------------------------

  private probeNeighborsForRemovedCells(
    removed: Array<{ key: string; budget: number }>
  ) {
    if (!this.entity || !this.level) return;
    const level = this.level;
    const ownBody = this.entity.getRigidBody();
    if (!ownBody) return;
    const ownHandle = ownBody.handle;
    const entAngle = this.entity.angle ?? 0;
    const cosA = Math.cos(entAngle);
    const sinA = Math.sin(entAngle);
    const reach = this.cellSize * 1.25;

    for (const { key, budget } of removed) {
      if (budget <= 0) continue;
      const outwardDirs = this.boundaryCells.get(key);
      if (!outwardDirs) continue;
      const coords = this.cellGridCoords.get(key);
      if (!coords) continue;
      const [gx, gy] = coords;
      const localCx = this.gridOriginX + (gx + 0.5) * this.cellSize;
      const localCy = this.gridOriginY + (gy + 0.5) * this.cellSize;
      const worldOx = this.entity.position.x + localCx * cosA - localCy * sinA;
      const worldOy = this.entity.position.y + localCx * sinA + localCy * cosA;
      for (const [dx, dy] of outwardDirs) {
        const wdx = dx * cosA - dy * sinA;
        const wdy = dx * sinA + dy * cosA;
        const ray = new level.rapier.Ray(
          { x: worldOx, y: worldOy },
          { x: wdx, y: wdy }
        );
        const hit = level.world.castRay(
          ray,
          reach,
          true,
          undefined,
          undefined,
          undefined,
          undefined,
          (collider) => {
            if (collider.isSensor()) return false;
            if (collider.parent()?.handle === ownHandle) return false;
            return true;
          }
        );
        if (!hit) continue;
        const otherId = level.getEntityIdForCollider(hit.collider.handle);
        if (!otherId) continue;
        const other = level.getEntity(otherId);
        if (!other) continue;
        if (other.type !== "DestructableTerrain") continue;
        const contactX = worldOx + wdx * hit.timeOfImpact;
        const contactY = worldOy + wdy * hit.timeOfImpact;
        (other as DestructableTerrain).receiveCrumbleProbe(
          new Vector2(contactX, contactY),
          this.entity.id,
          budget
        );
      }
    }
  }

  // -----------------------------------------------------------------
  // Utilities
  // -----------------------------------------------------------------

  private findNearestFilledCellKey(localPoint?: Vector2): string | undefined {
    if (this.filledCells.size === 0) return undefined;
    if (!localPoint) {
      return this.filledCells.values().next().value;
    }
    const gx = Math.floor((localPoint.x - this.gridOriginX) / this.cellSize);
    const gy = Math.floor((localPoint.y - this.gridOriginY) / this.cellSize);
    const directKey = `${gx},${gy}`;
    if (this.filledCells.has(directKey)) return directKey;
    let best: string | undefined;
    let bestDistSq = Infinity;
    for (const key of this.filledCells) {
      const coords = this.cellGridCoords.get(key);
      if (!coords) continue;
      const cx = this.gridOriginX + (coords[0] + 0.5) * this.cellSize;
      const cy = this.gridOriginY + (coords[1] + 0.5) * this.cellSize;
      const ddx = cx - localPoint.x;
      const ddy = cy - localPoint.y;
      const d = ddx * ddx + ddy * ddy;
      if (d < bestDistSq) {
        bestDistSq = d;
        best = key;
      }
    }
    return best;
  }

  // -----------------------------------------------------------------
  // Debug helpers
  // -----------------------------------------------------------------

  getDebugInfo() {
    return {
      gridBuilt: this.gridBuilt,
      cellSize: this.cellSize,
      gridOriginX: this.gridOriginX,
      gridOriginY: this.gridOriginY,
      totalCells: this.cellGridCoords.size,
      fullCellCount: this.fullCells.size,
      edgeCellCount: this.edgeCellPolygons.size,
      filledCellCount: this.filledCells.size,
      boundaryCellCount: this.boundaryCells.size,
      removalActive: this.removalActive,
      frontierLength: this.removalFrontier.size,
      colliderCount: this.myColliders.length
    };
  }

  getFilledCellKeys() {
    return [...this.filledCells];
  }

  getSnapshot(): CrumbleGridSnapshot {
    const frontier: Array<[number, number, number]> = [];
    for (const [[gx, gy], budget] of this.removalFrontier) {
      frontier.push([gx, gy, budget]);
    }
    return {
      gridBuilt: this.gridBuilt,
      filledCells: [...this.filledCells],
      removalFrontier: frontier,
      removalActive: this.removalActive
    };
  }
}

// -----------------------------------------------------------------
// Vertex writer: position + uv + uv2 for one geometry vertex.
//
// World position is entity-local (matches tile.pos's frame). UV maps the
// vertex's location within the parent decal tile's UV rect; uv2 is the
// world-position-in-tile-units value the cracks shader consumes.
// -----------------------------------------------------------------
function writeVertex(
  posArr: Float32Array,
  uvArr: Float32Array,
  uv2Arr: Float32Array,
  vIdx: number,
  worldX: number,
  worldY: number,
  tile: TiledLevelAPI.MapTile,
  tileW: number,
  tileH: number,
  invUvX: number,
  invUvY: number
) {
  posArr[vIdx * 3 + 0] = worldX;
  posArr[vIdx * 3 + 1] = worldY;
  posArr[vIdx * 3 + 2] = 0;

  // UV in source-texture-space for the tile's sub-rect.
  // Position within tile (Y inverted: tile.pos.y is the TOP edge, going
  // down in Tiled / down in render).
  let uInTile = (worldX - tile.pos.x) / tileW;
  let vInTile = (tile.pos.y - worldY) / tileH;
  // Clamp to avoid bleeds beyond the tile (e.g. tiny clip rounding).
  if (uInTile < 0) uInTile = 0;
  else if (uInTile > 1) uInTile = 1;
  if (vInTile < 0) vInTile = 0;
  else if (vInTile > 1) vInTile = 1;

  const tileSheet = tile.def.src.sheet;
  const uvDx = tileSheet.tileSize.x;
  const uvDy = tileSheet.tileSize.y;
  const u = (tile.def.srcPos.x + uInTile * uvDx) * invUvX;
  const v = 1 - (tile.def.srcPos.y + vInTile * uvDy) * invUvY;
  uvArr[vIdx * 2 + 0] = u;
  uvArr[vIdx * 2 + 1] = v;

  // uv2 mirrors entity-local position so the cracks pattern tiles
  // consistently across the world (matches the original DestructableTerrain
  // kludge which assigned uv2 from tile.pos in 0.5-unit increments).
  uv2Arr[vIdx * 2 + 0] = worldX;
  uv2Arr[vIdx * 2 + 1] = worldY;
}
