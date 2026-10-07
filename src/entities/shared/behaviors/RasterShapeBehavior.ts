import { ImpulseJoint, RigidBody } from "@dimforge/rapier2d-compat";
import pointInPolygon from "point-in-polygon";
import {
  makeCCW,
  quickDecomp,
  removeCollinearPoints,
  removeDuplicatePoints
} from "poly-decomp";
import { intersect as pbIntersect } from "polybooljs";
import { centroid } from "polygon-utils";
import simplepolygon from "simplepolygon";
import {
  Box2,
  BufferAttribute,
  BufferGeometry,
  Mesh,
  Object3D,
  RepeatWrapping,
  ShaderMaterial,
  Texture,
  Vector2,
  Vector3
} from "three";

import {
  BaseEntityType,
  ElementalType,
  EntityBehavior,
  EntityHitDetails,
  EntityLifecycleEvents,
  LevelAPI
} from "src/api/entity";
import { CollisionBehavior } from "src/api/physics";
import { createTypedEventEmitter } from "src/api/util";
import { terrainCollisionGroup } from "src/engine/constants/collisionGroups";
import { getAsset } from "src/engine/entity/decorators";
import { RenderLayers } from "src/engine/constants/renderLayers";

import rasterCracksFrag from "./shaders/rasterCracksFrag.glsl";
import rasterCracksVert from "./shaders/rasterCracksVert.glsl";
import { Scheduler } from "src/engine/scheduling/Scheduler";
import {
  IVector2,
  ReadSizeAttributes,
  arr2,
  vector2To3,
  vector2ToArr2,
  vector3To2
} from "src/engine/util/vecTypes";
import { AnyTerrain, isAnyTerrain } from "src/entities/terrain/allTerrain";
import { IndexedGrid } from "src/util/IndexedGrid";
import { MergeCellInput, mergeCellsToPolygons } from "src/util/mergeCells";
import {
  PolygonAndHoles,
  arr2Polygon,
  arr2Polygons,
  convertRegionsToPolygonsAndHoles,
  getArea,
  getPolygonBBox,
  mergeHolesIntoPolygon,
  projectPolygon,
  projectPolygonAndHoles,
  sanitizePolygonAndHoles,
  unProjectPolygonAndHoles
} from "src/util/polygons";

export enum RasterShapeEvents {
  GrowthFinished = "GrowthFinished",
  GeomDestroyed = "GeomDestroyed",
  Subdivided = "Subdivided",
  SizeChanged = "SizeChanged",
  AcceptedWithArea = "AcceptedWithArea",
  RejectedDueToMissingTerrain = "RejectedDueToMissingTerrain",
  RejectedDueToBadGeometry = "RejectedDueToBadGeometry"
}

export type Chunk = {
  position: Vector3;
  shape: arr2Polygon;
  color?: [number, number, number];
  opacity?: number;
};

// Inputs handed to a cell-appearance callback: everything the behavior knows
// about a cell's current visual determination criteria.
export type CellShadeContext = {
  // Full (unit quad) vs edge (clipped) cell.
  full: boolean;
  // Chebyshev distance to the nearest empty cell, scanned up to a radius of 2
  // (1 = outermost ring, 2 = next ring in). Infinity for deeper interior cells.
  // Lets appearance callbacks draw thicker, distance-graded outlines.
  boundaryDistance: number;
  // Normal·up shading factor in ~[0.5, 1.0], already incorporating entity angle.
  shadeFactor: number;
  // Grow-in fade progress, 0..1.
  fadeT: number;
  // Accumulated damage / CELL_DESTROY_DAMAGE, clamped to 0..1.
  damageRatio: number;
};

// Returns the base color and opacity for a cell; cracks are overlaid on top of
// this by the shader. Lets each material (earth, ice, …) define its palette.
export type CellAppearance = {
  color: [number, number, number];
  opacity: number;
};
export type CellAppearanceFn = (ctx: CellShadeContext) => CellAppearance;

// Friction combine rule, resolved against rapier.CoefficientCombineRule.
export type FrictionCombineRule = "average" | "min" | "max" | "multiply";

// Default appearance: the original earth shading (dark→target fade × shade),
// fully opaque.
const defaultCellAppearance: CellAppearanceFn = ({ shadeFactor, fadeT }) => {
  const darkR = 0.15,
    darkG = 0.13,
    darkB = 0.09;
  const targetR = 0.54,
    targetG = 0.47,
    targetB = 0.31;
  const t = fadeT;
  return {
    color: [
      (darkR + (targetR - darkR) * t) * shadeFactor,
      (darkG + (targetG - darkG) * t) * shadeFactor,
      (darkB + (targetB - darkB) * t) * shadeFactor
    ],
    opacity: 1
  };
};

// Consolidated per-cell state, keyed by integer grid coords (gx, gy) in an
// IndexedGrid. One entry exists for every target cell (full or edge); the
// fields track classification, BFS fill state, animation, shading, and where
// the cell's vertices live in the geometry buffer.
type CellState = {
  // Full cells are unit quads; edge cells carry a clipped polygon (edgePoly).
  full: boolean;
  edgePoly?: arr2Polygon;
  // True once the growth flood-fill has reached this cell (i.e. it renders).
  filled: boolean;
  // Accumulated damage; at CELL_DESTROY_DAMAGE the cell is removed.
  damage: number;
  // Time (ms) the cell became filled, driving the fade-in animation.
  birthTime: number;
  // Inward shading normal; undefined until computeCellNormals sets it.
  normal?: [number, number];
  // Slice of the geometry vertex buffer owned by this cell (set during build).
  vertexInfo?: { start: number; count: number };
};

export type RasterShapeEventTypes = {
  [RasterShapeEvents.GrowthFinished]: void;
  [RasterShapeEvents.GeomDestroyed]: void;
  [RasterShapeEvents.Subdivided]: {
    newChunks: Chunk[];
    disappear?: boolean;
  };
  [RasterShapeEvents.SizeChanged]: ReadSizeAttributes;
  [RasterShapeEvents.AcceptedWithArea]: number;
  [RasterShapeEvents.RejectedDueToMissingTerrain]: void;
  [RasterShapeEvents.RejectedDueToBadGeometry]: void;
};

export function entityHasRasterShapeBehavior(
  entity: BaseEntityType
): entity is BaseEntityType<{
  shape: RasterShapeBehavior;
}> {
  if (!entity.behaviors) return false;
  const shapeType = (entity as BaseEntityType<{ shape?: EntityBehavior }>)
    .behaviors.shape?.type;
  return shapeType === "RasterShape";
}

// Gets the terrain intersections and anchor for an anchored raster shape pre-growth.
// This is separated out so we can calculate total area during the casting
// process to determine mana cost and reject if it's too high.
export function getTerrainIntersectionsAndAnchor(
  shape: PolygonAndHoles,
  offset2: Vector2,
  angle: number,
  level: LevelAPI
): [
  PolygonAndHoles[] | null,
  AnyTerrain | BaseEntityType<{ shape: RasterShapeBehavior }> | null,
  Set<AnyTerrain | BaseEntityType>
] {
  const { rapier, world } = level;

  const projectedShape = projectPolygonAndHoles(shape, offset2, angle);

  // Start by making a query to local terrain.
  const queryBBox = getPolygonBBox(projectedShape.outer);
  const querySize = new Vector2();
  const queryCenter = new Vector2();
  queryBBox.getSize(querySize);
  queryBBox.getCenter(queryCenter);
  const queryShape = new rapier.Cuboid(querySize.x, querySize.y);

  let anchorTerrainEntity:
    | AnyTerrain
    | BaseEntityType<{ shape: RasterShapeBehavior }>
    | undefined;
  let anchorTerrainArea: number = -1;
  const allProjectedIntersections: PolygonAndHoles[] = [];
  const allTerrainEntities = new Set<AnyTerrain | BaseEntityType>();

  world.intersectionsWithShape(queryCenter, 0, queryShape, (coll) => {
    const handle = coll.handle;
    const entityId = level.getEntityIdForCollider(handle);
    if (!entityId) return true;
    const entity = level.getEntity(entityId);
    if (!entity) return true;
    let terrainVerts: arr2[][];
    if (isAnyTerrain(entity)) {
      terrainVerts = [
        projectPolygon(
          entity.getVertVectors().map(vector2ToArr2),
          vector3To2(entity.position),
          entity.angle
        )
      ];
    } else if (entityHasRasterShapeBehavior(entity)) {
      terrainVerts =
        entity.behaviors.shape.currentShape
          ?.map(({ outer }) =>
            projectPolygon(outer, vector3To2(entity.position), entity.angle)
          )
          .filter(Boolean) ?? [];
    } else {
      return true;
    }
    const projectedIntersection = pbIntersect(
      {
        regions: [projectedShape.outer, ...projectedShape.holes],
        inverted: false
      },
      {
        regions: terrainVerts,
        inverted: false
      }
    );
    let areaSum = 0;
    for (const intersection of projectedIntersection.regions) {
      areaSum += getArea(intersection);
    }
    if (areaSum > 0) {
      allTerrainEntities.add(entity);
    }
    if (areaSum > anchorTerrainArea) {
      anchorTerrainEntity = entity;
      anchorTerrainArea = areaSum;
    }
    allProjectedIntersections.push(
      ...convertRegionsToPolygonsAndHoles(projectedIntersection.regions)
    );
    return true;
  });

  if (!anchorTerrainEntity) return [null, null, allTerrainEntities];

  const intersections = allProjectedIntersections.map((shape) =>
    unProjectPolygonAndHoles(shape, offset2, angle)
  );
  return [intersections, anchorTerrainEntity, allTerrainEntities];
}

type CollisionHandlingInfo = {
  handleMap: Map<number, Map<number, boolean>>;
};

export class RasterShapeBehavior implements EntityBehavior {
  static type = "RasterShape";
  public type = RasterShapeBehavior.type;
  public object3D = new Object3D();
  public events = createTypedEventEmitter<RasterShapeEventTypes>();

  // Rendering. All raster meshes (growing blocks and shatter chunks) share a
  // single cracks shader material; per-cell color/opacity/crack strength ride
  // on geometry attributes, so the material itself can be shared.
  private geom?: BufferGeometry;
  private mesh?: Mesh;
  private fixedColor?: [number, number, number];
  private fixedOpacity = 1;
  private appearanceFn: CellAppearanceFn = defaultCellAppearance;
  private static sharedCrackMaterial?: ShaderMaterial;
  private static sharedCrackTexture?: Texture;

  // Structural damage. Cells accumulate damage and are removed at
  // CELL_DESTROY_DAMAGE; once the structure's cumulative received damage
  // exceeds originalArea * SHATTER_AREA_CONSTANT the whole block shatters.
  private totalDamage = 0;
  private originalArea = 0;
  private static readonly CELL_DESTROY_DAMAGE = 5;
  private static readonly SHATTER_AREA_CONSTANT = 30;
  // World units per crack-texture tile (texture is RepeatWrapping).
  private static readonly CRACK_TEXTURE_SCALE = 2;

  // Geometry.
  public inputShape?: PolygonAndHoles;
  // Backing field for the lazily-rebuilt union of filled cells. Read through
  // the `currentShape` getter, which refreshes it from the grid when dirty.
  private _currentShape?: PolygonAndHoles[];

  // Public view of the shape's current geometry, kept consistent with the
  // grid as it grows/erodes. External consumers (e.g. anchoring queries in
  // getTerrainIntersectionsAndAnchor) and the obstacle reporter read this.
  get currentShape(): PolygonAndHoles[] | undefined {
    this.ensureCurrentShape();
    return this._currentShape;
  }
  set currentShape(value: PolygonAndHoles[] | undefined) {
    this._currentShape = value;
    // An explicit assignment is authoritative; don't let a lazy rebuild stomp
    // it until the grid changes again.
    this.currentShapeDirty = false;
  }

  // Corner grid: "cx,cy" -> true if corner point is inside input polygon.
  private cornerFilled = new Map<string, boolean>();

  // All per-cell state lives in one grid keyed by integer cell coords.
  private grid = new IndexedGrid<CellState>();

  // BFS frontier: grid coords of the most recently filled cells.
  private frontier: Array<[number, number]> = [];

  // Animation state.
  private currentTime = 0;
  private fadeDuration = 50;
  private animating = false;

  // Per-cell shading normals live on each CellState; this tracks the entity
  // angle at last shading so we can re-shade on rotation.
  private lastShadingAngle = 0;

  // Grid.
  private cellSize = 0.125;
  private gridOriginX = 0;
  private gridOriginY = 0;

  // Lazy currentShape for shatter/damage.
  private currentShapeDirty = true;

  // Physics.
  private rigidBody?: RigidBody;
  private rigidBodyPos?: IVector2;
  private rigidBodyAngle?: number;
  private rigidBodyLinVel?: IVector2;
  private rigidBodyAngVel?: number;

  // Entity system.
  private entity?: BaseEntityType;
  private level?: LevelAPI;

  private spawnFullyGrown = false;
  private canDamage = true;
  private growing = false;
  private growthAreaFinal = 0;
  private growthScheduler = new Scheduler();
  private colls = new Map<string, CollisionHandlingInfo>();

  // Per-instance configuration (defaults reproduce EarthBlock behavior).
  private friction = 0.005;
  // Friction combine rule; undefined = Rapier default (Average). Resolved
  // against the rapier instance at collider-creation time. Ice uses "min".
  private frictionCombineRule?: FrictionCombineRule;
  private enableCcd = false;
  private anchorToTerrain = true;
  private contactDamageType: ElementalType = ElementalType.Earth;
  // Multiplies incoming hit damage by elemental type (e.g. ice: { Fire: 3 }).
  private elementalDamageMultipliers: Partial<Record<ElementalType, number>> =
    {};

  // Ambient melt: every meltIntervalMs, the entire outer ring of cells is
  // removed at once (peeling inward). 0 disables.
  private meltIntervalMs = 0;

  // Optional gate consulted before each ambient ring melt. If it returns true,
  // the ring is spared for that interval (e.g. the owner spent a resource to
  // resist melting). The owner supplies the policy; this behavior stays neutral.
  private meltGuard?: () => boolean;

  private attachedToTerrain = new Set<AnyTerrain | BaseEntityType>();
  private anchorTerrain?: AnyTerrain | BaseEntityType;
  private anchorTerrainOffset?: Vector3;
  private anchorTerrainAngleOffset?: number;
  private attachedToTerrainJoint?: ImpulseJoint;

  constructor() {
    this.growBFS = this.growBFS.bind(this);
  }

  init(entity: BaseEntityType) {
    this.entity = entity;
    this.entity.object3D?.add(this.object3D);
    this.entity.events.on(EntityLifecycleEvents.Step, this.step.bind(this));
    this.entity.events.on(
      EntityLifecycleEvents.Destroy,
      this.dispose.bind(this)
    );
    this.entity.events.on(EntityLifecycleEvents.Hit, (hit) => {
      if (hit.hitImpulse) {
        this.rigidBody?.applyImpulse(hit.hitImpulse, true);
      }
      this.applyDamageFromHit(hit);
    });

    // Update obstacles.
    this.growthScheduler.add({
      id: "reportObstacles",
      invokeFunctionAtComplete: () => {
        if (!this.entity) return;
        let obstaclePolygons: arr2Polygons = [];
        const angle = this.rigidBody?.rotation() ?? 0;
        const origin = new Vector2();
        const tmp = new Vector2();
        if (this.currentShape) {
          for (const polygon of this.currentShape) {
            const outPolygon: arr2Polygon = [];
            for (const vtx of polygon.outer) {
              tmp.set(vtx[0], vtx[1]).rotateAround(origin, angle);
              outPolygon.push([tmp.x, tmp.y]);
            }
            obstaclePolygons.push(outPolygon);
          }
        } else if (this.inputShape) {
          const outPolygon: arr2Polygon = [];
          for (const vtx of this.inputShape.outer) {
            tmp.set(vtx[0], vtx[1]).rotateAround(origin, angle);
            outPolygon.push([tmp.x, tmp.y]);
          }
          obstaclePolygons.push(outPolygon);
        }
        this.level?.navigation?.upsertObstacleWithShape(this.entity.id, {
          type: "polygons",
          x: this.entity.position.x,
          y: this.entity.position.y,
          polygons: obstaclePolygons
        });
      },
      startIn: 500,
      recurring: true
    });

    return this;
  }

  private static readonly BASE_CELL_SIZE = 0.125;
  private static readonly MAX_GRID_CELLS = 1024;

  setShape(shapeIn: arr2[], holes: arr2[][] = []) {
    this.inputShape = sanitizePolygonAndHoles({
      outer: shapeIn,
      holes
    });

    // Fixed reference area (outer minus holes) for the shatter threshold.
    this.originalArea = Math.abs(getArea(this.inputShape.outer));
    for (const hole of this.inputShape.holes) {
      this.originalArea -= Math.abs(getArea(hole));
    }
    this.originalArea = Math.max(0, this.originalArea);

    // Scale cellSize up in powers of two so the grid never exceeds
    // MAX_GRID_CELLS. This avoids performance problems with very large
    // shapes that would otherwise produce thousands of cells.
    const bbox = getPolygonBBox(this.inputShape.outer);
    const w = bbox.max.x - bbox.min.x;
    const h = bbox.max.y - bbox.min.y;
    this.cellSize = RasterShapeBehavior.BASE_CELL_SIZE;
    while (
      Math.ceil(w / this.cellSize) * Math.ceil(h / this.cellSize) >
      RasterShapeBehavior.MAX_GRID_CELLS
    ) {
      this.cellSize *= 2;
    }
  }

  spawnFullGrown() {
    this.anchorToTerrain = false;
    this.spawnFullyGrown = true;
    if (!this.inputShape) return this;
    this.currentShape = [this.inputShape];
    this.applySize();
    return this;
  }

  setColor(color: [number, number, number]) {
    this.fixedColor = color;
    return this;
  }

  setOpacity(opacity: number) {
    this.fixedOpacity = opacity;
    return this;
  }

  // Callback that determines per-cell base color + opacity (cracks overlaid by
  // the shader on top). Defaults to the earth shading.
  setCellAppearance(fn: CellAppearanceFn) {
    this.appearanceFn = fn;
    return this;
  }

  // Collider friction and (optional) combine rule. Ice passes a near-0
  // friction with the "min" combine rule for true slickness.
  setFriction(friction: number, combineRule?: FrictionCombineRule) {
    this.friction = friction;
    this.frictionCombineRule = combineRule;
    return this;
  }

  setEnableCcd(enable: boolean) {
    this.enableCcd = enable;
    return this;
  }

  // When false, the shape grows free-floating (seeded from its center) instead
  // of anchoring into local terrain.
  setAnchorToTerrain(anchor: boolean) {
    this.anchorToTerrain = anchor;
    return this;
  }

  // Elemental type emitted for contact (stab) damage this shape deals.
  setContactDamageType(type: ElementalType) {
    this.contactDamageType = type;
    return this;
  }

  // Multipliers applied to incoming hit damage by elemental type
  // (e.g. ice: { [ElementalType.Fire]: 3 }).
  setElementalDamageMultipliers(
    multipliers: Partial<Record<ElementalType, number>>
  ) {
    this.elementalDamageMultipliers = multipliers;
    return this;
  }

  // Gate ambient melting behind a predicate. Returning true from the guard
  // spares the outer ring for that interval. Pass undefined to clear it.
  setMeltGuard(guard: (() => boolean) | undefined) {
    this.meltGuard = guard;
    return this;
  }

  // Begin (or re-time) ambient melt: after delayMs, the whole outer ring of
  // cells melts at once, then another ring every intervalMs until nothing is
  // left. intervalMs <= 0 disables.
  startMelt(intervalMs: number, delayMs = 0) {
    this.meltIntervalMs = intervalMs;
    this.growthScheduler.cancel("melt");
    this.growthScheduler.cancel("meltStart");
    if (intervalMs <= 0) return this;

    // A guard returning true means the owner spent a resource to spare this
    // ring; skip the melt for this tick but keep the recurring schedule alive.
    const meltTick = () => {
      if (this.meltGuard?.()) return;
      this.meltOuterRing();
    };

    const beginMelting = () => {
      meltTick();
      this.growthScheduler.add({
        id: "melt",
        recurring: true,
        duration: intervalMs,
        invokeFunctionAtComplete: meltTick
      });
    };

    if (delayMs > 0) {
      // One-shot grace period before the first ring melts.
      this.growthScheduler.add({
        id: "meltStart",
        startIn: delayMs,
        invokeFunctionAtComplete: beginMelting
      });
    } else {
      beginMelting();
    }
    return this;
  }

  attachToLevel(level: LevelAPI) {
    this.level = level;

    if (!this.entity || !this.inputShape) return;

    // Fully grown rocks spawn from shattering. Don't find local terrain.
    if (this.spawnFullyGrown) {
      this.applyPolygonThree();
      this.applyPolygonRapier();
      return;
    }

    // Free-floating shapes (e.g. ice) grow from their center, with no terrain
    // anchor/joint and no missing-terrain rejection.
    if (!this.anchorToTerrain) {
      this.buildTargetCells();
      if (this.grid.size === 0) {
        this.events.emit(RasterShapeEvents.RejectedDueToBadGeometry);
        return;
      }
      const seedCount = this.seedFromCenter();
      if (seedCount === 0) {
        this.events.emit(RasterShapeEvents.RejectedDueToBadGeometry);
        return;
      }
      this.computeCellNormals();
      this.growthAreaFinal =
        (this.grid.size - seedCount) * this.cellSize * this.cellSize;
      this.events.emit(
        RasterShapeEvents.AcceptedWithArea,
        this.growthAreaFinal
      );
      this.applyPolygonThree();
      this.applyPolygonRapier();
      this.applySize();
      this.startGrowth();
      return;
    }

    // Query local terrain.
    const offset2 = vector3To2(this.entity.position);
    const dir = this.entity.angle;
    const [intersections, anchorTerrainEntity, allTerrainEntities] =
      getTerrainIntersectionsAndAnchor(
        this.inputShape,
        offset2,
        dir,
        level
      );

    if (!intersections || !anchorTerrainEntity) {
      console.warn("Cannot form raster shape - no anchor terrain.");
      this.events.emit(RasterShapeEvents.RejectedDueToMissingTerrain);
      return;
    }

    // Build raster grid.
    this.buildTargetCells();
    const targetCount = this.grid.size;

    if (targetCount === 0) {
      console.warn("Cannot form raster shape - no target cells found.");
      this.events.emit(RasterShapeEvents.RejectedDueToMissingTerrain);
      return;
    }

    // Seeds are marked filled with birthTime 0 inside buildSeedCells.
    const seedCount = this.buildSeedCells(intersections);

    if (seedCount === 0) {
      console.warn("Cannot form raster shape - no seed cells found.");
      this.events.emit(RasterShapeEvents.RejectedDueToMissingTerrain);
      return;
    }

    this.computeCellNormals();

    // Compute growth area (approximate non-terrain portion).
    this.growthAreaFinal =
      (targetCount - seedCount) * this.cellSize * this.cellSize;
    this.events.emit(RasterShapeEvents.AcceptedWithArea, this.growthAreaFinal);

    // Set up terrain attachment.
    this.attachedToTerrain = allTerrainEntities;
    this.anchorTerrain = anchorTerrainEntity;
    this.anchorTerrainOffset = this.entity.position
      .clone()
      .sub(anchorTerrainEntity.position);
    this.anchorTerrainAngleOffset =
      this.entity.angle - anchorTerrainEntity.angle;

    // Apply initial rendering and physics.
    this.applyPolygonThree();
    this.applyPolygonRapier();
    this.applySize();

    // Start growth sequence.
    this.startGrowth();
  }

  // True if any cell in the grid is currently filled (i.e. has geometry).
  private anyFilled(): boolean {
    for (const [, cell] of this.grid) {
      if (cell.filled) return true;
    }
    return false;
  }

  // Count of filled cells — used by debug helpers only.
  private countFilled(): number {
    let n = 0;
    for (const [, cell] of this.grid) {
      if (cell.filled) n++;
    }
    return n;
  }

  private buildTargetCells() {
    if (!this.inputShape) return;

    const bbox = getPolygonBBox(this.inputShape.outer);

    // Snap grid origin to cell boundaries.
    this.gridOriginX = Math.floor(bbox.min.x / this.cellSize) * this.cellSize;
    this.gridOriginY = Math.floor(bbox.min.y / this.cellSize) * this.cellSize;

    const maxGX = Math.ceil((bbox.max.x - this.gridOriginX) / this.cellSize);
    const maxGY = Math.ceil((bbox.max.y - this.gridOriginY) / this.cellSize);

    // Step 1: Sample all corner points.
    for (let cx = 0; cx <= maxGX; cx++) {
      for (let cy = 0; cy <= maxGY; cy++) {
        const wx = this.gridOriginX + cx * this.cellSize;
        const wy = this.gridOriginY + cy * this.cellSize;
        const pt: arr2 = [wx, wy];

        let inside = pointInPolygon(pt, this.inputShape.outer) as boolean;
        if (inside) {
          for (const hole of this.inputShape.holes) {
            if (pointInPolygon(pt, hole)) {
              inside = false;
              break;
            }
          }
        }
        this.cornerFilled.set(`${cx},${cy}`, inside);
      }
    }

    // Step 2: Rasterize polygon edges onto the grid to find candidate cells
    // that an edge passes through. This catches thin polygon tips where no
    // corner points fall inside the polygon (e.g. a thin triangle tip that
    // passes through a cell diagonally without covering any corners).
    const edgeCandidates = new Set<string>();
    const allRings = [this.inputShape.outer, ...this.inputShape.holes];
    for (const ring of allRings) {
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i];
        const b = ring[(i + 1) % ring.length];
        this.rasterizeEdgeToCells(a, b, maxGX, maxGY, edgeCandidates);
      }
    }

    // Step 3: Classify cells based on corner counts + edge candidates.
    for (let gx = 0; gx < maxGX; gx++) {
      for (let gy = 0; gy < maxGY; gy++) {
        const key = `${gx},${gy}`;
        const c00 = this.cornerFilled.get(`${gx},${gy}`) ?? false;
        const c10 = this.cornerFilled.get(`${gx + 1},${gy}`) ?? false;
        const c11 = this.cornerFilled.get(`${gx + 1},${gy + 1}`) ?? false;
        const c01 = this.cornerFilled.get(`${gx},${gy + 1}`) ?? false;

        const filledCount =
          (c00 ? 1 : 0) + (c10 ? 1 : 0) + (c11 ? 1 : 0) + (c01 ? 1 : 0);

        if (filledCount === 0 && !edgeCandidates.has(key)) continue;

        if (filledCount === 4) {
          this.grid.set(gx, gy, {
            full: true,
            filled: false,
            damage: 0,
            birthTime: 0
          });
        } else {
          // 0-3 corners filled but edge passes through (or 1-3 corners):
          // clip cell quad against input polygon.
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
              {
                regions: [this.inputShape.outer, ...this.inputShape.holes],
                inverted: false
              }
            );
            if (clipped.regions.length > 0 && clipped.regions[0].length >= 3) {
              const poly = clipped.regions[0];
              makeCCW(poly);
              this.grid.set(gx, gy, {
                full: false,
                edgePoly: poly,
                filled: false,
                damage: 0,
                birthTime: 0
              });
            }
          } catch {
            // Boolean op failed — skip this edge cell.
          }
        }
      }
    }
  }

  // Rasterize a line segment onto the cell grid using a DDA approach.
  // Marks every cell that the segment passes through as a candidate.
  private rasterizeEdgeToCells(
    a: arr2,
    b: arr2,
    maxGX: number,
    maxGY: number,
    out: Set<string>
  ) {
    // Convert world coords to continuous grid coords.
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
      // Also mark the adjacent cell if we're very close to a grid line,
      // to avoid missing cells at exact boundaries.
      const fracX = px - gx;
      const fracY = py - gy;
      if (fracX < 0.01 && gx - 1 >= 0) {
        out.add(`${gx - 1},${gy}`);
      }
      if (fracX > 0.99 && gx + 1 < maxGX) {
        out.add(`${gx + 1},${gy}`);
      }
      if (fracY < 0.01 && gy - 1 >= 0) {
        out.add(`${gx},${gy - 1}`);
      }
      if (fracY > 0.99 && gy + 1 < maxGY) {
        out.add(`${gx},${gy + 1}`);
      }
      px += stepX;
      py += stepY;
    }
  }

  // Seeds growth from the single target cell nearest the input-shape centroid
  // (free-floating mode). Returns the seed count (0 or 1).
  private seedFromCenter(): number {
    if (!this.inputShape) return 0;
    let cx = 0,
      cy = 0;
    for (const [x, y] of this.inputShape.outer) {
      cx += x;
      cy += y;
    }
    cx /= this.inputShape.outer.length;
    cy /= this.inputShape.outer.length;

    let best: CellState | undefined;
    let bestCoords: [number, number] | undefined;
    let bestDistSq = Infinity;
    for (const [[gx, gy], cell] of this.grid) {
      const ccx = this.gridOriginX + (gx + 0.5) * this.cellSize;
      const ccy = this.gridOriginY + (gy + 0.5) * this.cellSize;
      const dx = ccx - cx;
      const dy = ccy - cy;
      const d = dx * dx + dy * dy;
      if (d < bestDistSq) {
        bestDistSq = d;
        best = cell;
        bestCoords = [gx, gy];
      }
    }
    if (!best || !bestCoords) return 0;
    best.filled = true;
    best.birthTime = 0;
    this.frontier.push(bestCoords);
    return 1;
  }

  private buildSeedCells(intersections: PolygonAndHoles[]): number {
    let seedCount = 0;
    const halfCell = this.cellSize * 0.5;

    for (const [[gx, gy], cell] of this.grid) {
      const cx = this.gridOriginX + (gx + 0.5) * this.cellSize;
      const cy = this.gridOriginY + (gy + 0.5) * this.cellSize;

      // Test center + 4 corners so thin intersection strips along edges
      // still seed the cells they overlap.
      const testPoints: arr2[] = [
        [cx, cy],
        [cx - halfCell, cy - halfCell],
        [cx + halfCell, cy - halfCell],
        [cx + halfCell, cy + halfCell],
        [cx - halfCell, cy + halfCell]
      ];

      let isSeed = false;
      for (const intersection of intersections) {
        for (const pt of testPoints) {
          if (!pointInPolygon(pt, intersection.outer)) continue;
          let inHole = false;
          for (const hole of intersection.holes) {
            if (pointInPolygon(pt, hole)) {
              inHole = true;
              break;
            }
          }
          if (!inHole) {
            isSeed = true;
            break;
          }
        }
        if (isSeed) break;
      }

      if (isSeed) {
        cell.filled = true;
        cell.birthTime = 0;
        this.frontier.push([gx, gy]);
        seedCount++;
      }
    }

    return seedCount;
  }

  private computeCellNormals() {
    if (!this.inputShape) return;

    // Collect all polygon edges (outer ring + holes).
    const rings: arr2[][] = [this.inputShape.outer];
    if (this.inputShape.holes) {
      for (const hole of this.inputShape.holes) {
        rings.push(hole);
      }
    }

    // First pass: compute normals for filled full cells only.
    const edgeCells: Array<[number, number, CellState]> = [];
    for (const [[gx, gy], cell] of this.grid) {
      if (!cell.filled) continue;
      if (!cell.full) {
        edgeCells.push([gx, gy, cell]);
        continue;
      }
      const cx = this.gridOriginX + (gx + 0.5) * this.cellSize;
      const cy = this.gridOriginY + (gy + 0.5) * this.cellSize;

      let closestDist = Infinity;
      let closestPtX = cx;
      let closestPtY = cy;

      for (const ring of rings) {
        for (let i = 0; i < ring.length; i++) {
          const ax = ring[i][0];
          const ay = ring[i][1];
          const bx = ring[(i + 1) % ring.length][0];
          const by = ring[(i + 1) % ring.length][1];

          // Project cell center onto edge segment.
          const edgeDx = bx - ax;
          const edgeDy = by - ay;
          const lenSq = edgeDx * edgeDx + edgeDy * edgeDy;

          let nearX: number, nearY: number;
          if (lenSq < 1e-12) {
            nearX = ax;
            nearY = ay;
          } else {
            let t = ((cx - ax) * edgeDx + (cy - ay) * edgeDy) / lenSq;
            t = Math.max(0, Math.min(1, t));
            nearX = ax + t * edgeDx;
            nearY = ay + t * edgeDy;
          }

          const dx = cx - nearX;
          const dy = cy - nearY;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < closestDist) {
            closestDist = dist;
            closestPtX = nearX;
            closestPtY = nearY;
          }
        }
      }

      // Normal = direction from closest edge point toward cell center (inward).
      const nx = cx - closestPtX;
      const ny = cy - closestPtY;
      const nLen = Math.sqrt(nx * nx + ny * ny);
      if (nLen > 1e-6) {
        cell.normal = [nx / nLen, ny / nLen];
      } else {
        cell.normal = [0, 1];
      }
    }

    // Second pass: edge (partial) cells copy normal from nearest full neighbor.
    const neighborOffsets: [number, number][] = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [-1, 1],
      [1, -1],
      [-1, -1]
    ];
    for (const [gx, gy, cell] of edgeCells) {
      let found = false;
      for (const [dx, dy] of neighborOffsets) {
        const neighbor = this.grid.get(gx + dx, gy + dy);
        if (neighbor?.full && neighbor.normal) {
          cell.normal = [neighbor.normal[0], neighbor.normal[1]];
          found = true;
          break;
        }
      }
      if (!found) {
        cell.normal = [0, 1];
      }
    }
  }

  startGrowth() {
    this.growing = true;
    this.animating = true;
    this.growthScheduler.cancel("growth");
    this.growthScheduler.add({
      id: "growth",
      recurring: true,
      duration: 33,
      invokeFunctionAtComplete: this.growBFS
    });
  }

  private growBFS() {
    if (!this.growing) {
      this.growthScheduler.cancel("growth");
      return;
    }

    if (this.frontier.length === 0) {
      this.growing = false;
      this.growthScheduler.cancel("growth");
      this.events.emit(RasterShapeEvents.GrowthFinished);
      return;
    }

    const nextFrontier: Array<[number, number]> = [];
    const neighbors: [number, number][] = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1]
    ];

    for (const [gx, gy] of this.frontier) {
      for (const [dx, dy] of neighbors) {
        const nx = gx + dx;
        const ny = gy + dy;

        const neighbor = this.grid.get(nx, ny);
        if (!neighbor || neighbor.filled) continue;

        neighbor.filled = true;
        neighbor.birthTime = this.currentTime;
        nextFrontier.push([nx, ny]);
      }
    }

    this.frontier = nextFrontier;
    this.currentShapeDirty = true;
    this.animating = true;
    this.computeCellNormals();

    // Rebuild geometry from grid.
    this.applyPolygonThree();
    this.applyPolygonRapier();
    this.applySize();
  }

  private ensureCurrentShape() {
    // Shatter chunks have no cell grid; their currentShape is assigned
    // explicitly in spawnFullGrown and must not be rebuilt from the (empty)
    // grid, which would null it out.
    if (this.spawnFullyGrown) return;
    if (!this.currentShapeDirty && this._currentShape) return;
    if (!this.anyFilled()) {
      this._currentShape = undefined;
      this.currentShapeDirty = false;
      return;
    }

    // Merge all filled cells into their union outline. This mimics the terrain
    // tile-merging algorithm (cancel shared cell-side edges, stitch the rest
    // into loops) instead of running an expensive polygon-boolean union, while
    // preserving edge cells' exact clipped outlines.
    const mergeCells: MergeCellInput[] = [];
    for (const [[gx, gy], cell] of this.grid) {
      if (!cell.filled) continue;
      if (cell.full) {
        mergeCells.push({ gx, gy, full: true });
      } else if (cell.edgePoly) {
        mergeCells.push({ gx, gy, full: false, edgePoly: cell.edgePoly });
      }
    }

    const merged = mergeCellsToPolygons(
      mergeCells,
      this.cellSize,
      this.gridOriginX,
      this.gridOriginY
    );

    this._currentShape = merged.length > 0 ? merged : undefined;
    this.currentShapeDirty = false;
  }

  shatterAll() {
    if (!this.inputShape) return;
    this.growing = false;
    this.growthScheduler.cancel("growth");
    this.shatterAllCells();
    this.currentShape = undefined;
    this.grid.clear();
    this.currentShapeDirty = true;
    this.applyPolygonRapier();
    this.applyPolygonThree();
  }

  // Applies an incoming hit's damage to the cell grid. Damage is spread
  // evenly across the cells the hit covers; cells reaching the destroy
  // threshold are removed with their overflow spilling to neighbors; and the
  // whole block shatters once cumulative received damage passes the area
  // threshold.
  private applyDamageFromHit(hit: EntityHitDetails) {
    // Only the growing cell-grid block takes structural damage — fully-grown
    // shatter chunks have no grid.
    if (this.spawnFullyGrown) return;
    if (!this.entity || hit.damage <= 0) return;
    if (!this.anyFilled()) return;

    // Apply elemental damage multipliers (e.g. fire is 3× vs ice).
    const elementalMult =
      (hit.elementalDamageType &&
        this.elementalDamageMultipliers[hit.elementalDamageType]) ||
      1;
    const damage = hit.damage * elementalMult;

    // Resolve a world-space circle for the hit: explicit circular hit shape,
    // or a small circle at the attacker's contact point for shapeless hits.
    let centerX: number;
    let centerY: number;
    let radius: number;
    if (hit.hitShape?.type === "circle") {
      centerX = hit.hitShape.center.x;
      centerY = hit.hitShape.center.y;
      radius = hit.hitShape.radius;
    } else {
      const src = hit.hittingEntity ?? hit.sourceEntity;
      if (!src?.position) return;
      centerX = src.position.x;
      centerY = src.position.y;
      radius = this.cellSize;
    }

    // Transform the hit center into local (pre-rotation) grid space.
    const local = new Vector2(
      centerX - this.entity.position.x,
      centerY - this.entity.position.y
    ).rotateAround(new Vector2(0, 0), -this.entity.angle);

    // Collect covered filled cells, tracking the nearest as a fallback for
    // point hits that land between cell centers.
    const covered: Array<[number, number]> = [];
    let nearest: [number, number] | undefined;
    let nearestDistSq = Infinity;
    const radiusSq = radius * radius;
    for (const [[gx, gy], cell] of this.grid) {
      if (!cell.filled) continue;
      const cx = this.gridOriginX + (gx + 0.5) * this.cellSize;
      const cy = this.gridOriginY + (gy + 0.5) * this.cellSize;
      const dx = cx - local.x;
      const dy = cy - local.y;
      const distSq = dx * dx + dy * dy;
      if (distSq <= radiusSq) covered.push([gx, gy]);
      if (distSq < nearestDistSq) {
        nearestDistSq = distSq;
        nearest = [gx, gy];
      }
    }
    if (covered.length === 0) {
      if (!nearest) return;
      covered.push(nearest);
    }

    // Record received damage once, then split it evenly across cells.
    this.totalDamage += damage;
    const perCell = damage / covered.length;
    const overflowed: Array<[number, number]> = [];
    for (const [gx, gy] of covered) {
      const cell = this.grid.get(gx, gy);
      if (!cell) continue;
      cell.damage += perCell;
      if (cell.damage >= RasterShapeBehavior.CELL_DESTROY_DAMAGE) {
        overflowed.push([gx, gy]);
      }
    }

    const removedAny = this.destroyOverflowedCells(overflowed);

    // Whole-block failure once cumulative damage passes the area threshold.
    if (
      this.totalDamage >
      this.originalArea * RasterShapeBehavior.SHATTER_AREA_CONSTANT
    ) {
      this.shatterAll();
      return;
    }

    if (removedAny) {
      this.currentShapeDirty = true;
      if (!this.anyFilled()) {
        // Eroded to nothing — tear down like a shatter.
        this.events.emit(RasterShapeEvents.GeomDestroyed);
        return;
      }
      this.applyPolygonThree();
      this.applyPolygonRapier();
      this.applySize();
      this.animating = true;
    } else {
      // No topology change — just refresh the crack overlay in place.
      this.updateCrackAmounts();
    }
  }

  // Removes cells that have reached the destroy threshold, distributing each
  // removed cell's overflow damage evenly among its filled 4-neighbors. The
  // cascade is iterative so chain reactions resolve in one pass. Overflow
  // that reaches no filled neighbor is dropped. Returns true if any cell was
  // removed.
  private destroyOverflowedCells(seed: Array<[number, number]>): boolean {
    const neighbors: [number, number][] = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1]
    ];
    const queue = [...seed];
    let removed = false;
    while (queue.length > 0) {
      const [gx, gy] = queue.pop()!;
      const cell = this.grid.get(gx, gy);
      if (!cell || !cell.filled) continue;
      if (cell.damage < RasterShapeBehavior.CELL_DESTROY_DAMAGE) continue;

      const spill = cell.damage - RasterShapeBehavior.CELL_DESTROY_DAMAGE;
      this.grid.delete(gx, gy);
      removed = true;

      const filledNeighbors: Array<[number, number]> = [];
      for (const [dx, dy] of neighbors) {
        const n = this.grid.get(gx + dx, gy + dy);
        if (n?.filled) filledNeighbors.push([gx + dx, gy + dy]);
      }
      if (spill > 0 && filledNeighbors.length > 0) {
        const share = spill / filledNeighbors.length;
        for (const [nx, ny] of filledNeighbors) {
          const n = this.grid.get(nx, ny);
          if (!n) continue;
          n.damage += share;
          if (n.damage >= RasterShapeBehavior.CELL_DESTROY_DAMAGE) {
            queue.push([nx, ny]);
          }
        }
      }
    }
    return removed;
  }

  // One melt wave: removes the entire current outer ring of cells (every
  // filled cell with a missing/unfilled neighbor) at once, peeling the shape
  // inward. Tears the shape down once nothing is left.
  private meltOuterRing() {
    if (this.spawnFullyGrown || !this.anyFilled()) return;

    // Snapshot the full boundary ring before deleting, so removals don't
    // reshape the ring mid-pass.
    const ring: Array<[number, number]> = [];
    for (const [[gx, gy], cell] of this.grid) {
      // Outermost ring = cells touching empty space (distance 1).
      if (cell.filled && this.boundaryCellDistance(gx, gy) === 1) {
        ring.push([gx, gy]);
      }
    }
    if (ring.length === 0) return;
    for (const [gx, gy] of ring) this.grid.delete(gx, gy);

    this.currentShapeDirty = true;
    if (!this.anyFilled()) {
      this.applyPolygonRapier();
      this.applyPolygonThree();
      this.events.emit(RasterShapeEvents.GeomDestroyed);
      return;
    }
    this.applyPolygonThree();
    this.applyPolygonRapier();
    this.applySize();
    this.animating = true;
  }

  // Lazily builds the cracks shader material shared by all earth meshes. The
  // texture tiles (RepeatWrapping) so cracks read continuously across cells;
  // per-cell strength comes from the geometry's crackAmount attribute, so a
  // single material instance serves every block and chunk.
  private static getCrackMaterial(): ShaderMaterial {
    if (!RasterShapeBehavior.sharedCrackMaterial) {
      const tex = getAsset("terrainCracks").clone();
      tex.wrapS = RepeatWrapping;
      tex.wrapT = RepeatWrapping;
      RasterShapeBehavior.sharedCrackTexture = tex;
      RasterShapeBehavior.sharedCrackMaterial = new ShaderMaterial({
        vertexShader: rasterCracksVert,
        fragmentShader: rasterCracksFrag,
        transparent: true,
        uniforms: {
          cracks: { value: tex }
        }
      });
    }
    return RasterShapeBehavior.sharedCrackMaterial;
  }

  // Refreshes only the per-vertex crackAmount attribute in place (no geometry
  // rebuild), used when damage was applied but no cell was removed.
  private updateCrackAmounts() {
    if (!this.geom) return;
    const attr = this.geom.getAttribute("crackAmount") as
      | BufferAttribute
      | undefined;
    if (!attr) return;
    const arr = attr.array as Float32Array;
    for (const [, cell] of this.grid) {
      const info = cell.vertexInfo;
      if (!cell.filled || !info) continue;
      const amount = Math.min(
        cell.damage / RasterShapeBehavior.CELL_DESTROY_DAMAGE,
        1
      );
      for (let vi = 0; vi < info.count; vi++) {
        arr[info.start + vi] = amount;
      }
    }
    attr.needsUpdate = true;
  }

  step(ms: number) {
    this.currentTime += ms;
    this.growthScheduler.step(ms);
    if (!this.entity) return;

    // Update vertex colors/opacity during animation.
    if (this.animating) {
      this.updateCellAppearance();
    }

    if (this.rigidBody) {
      const pos = this.rigidBody.translation();
      const rot = this.rigidBody.rotation();
      this.rigidBodyPos = pos;
      this.rigidBodyAngle = rot;
      this.rigidBodyLinVel = this.rigidBody.linvel();
      this.rigidBodyAngVel = this.rigidBody.angvel();
      this.entity.position.x = pos.x;
      this.entity.position.y = pos.y;
      this.entity.angle = rot;
      if (this.entity.object3D) {
        this.entity.object3D.position.copy(this.entity.position);
        this.entity.object3D.rotation.z = this.entity.angle;
      }
      this.checkPointsForDamageToOtherEntities();
    } else if (
      this.rigidBodyPos !== undefined &&
      this.rigidBodyLinVel !== undefined &&
      this.rigidBodyAngle !== undefined &&
      this.rigidBodyAngVel !== undefined
    ) {
      this.rigidBodyPos.x += this.rigidBodyLinVel.x * ms * 0.001;
      this.rigidBodyPos.y += this.rigidBodyLinVel.y * ms * 0.001;
      this.rigidBodyAngle += this.rigidBodyAngVel * ms * 0.001;
      this.entity.position.x = this.rigidBodyPos.x;
      this.entity.position.y = this.rigidBodyPos.y;
      this.entity.angle = this.rigidBodyAngle;
      if (this.entity.object3D) {
        this.entity.object3D.position.copy(this.entity.position);
        this.entity.object3D.rotation.z = this.entity.angle;
      }
    }

    // Re-shade when the entity rotates.
    const currentAngle = this.entity?.angle ?? 0;
    if (Math.abs(currentAngle - this.lastShadingAngle) > 0.01) {
      this.lastShadingAngle = currentAngle;
      this.animating = true;
    }
  }

  // Resolves the configured friction combine rule to a rapier enum value.
  private resolveFrictionCombineRule(
    rapier: LevelAPI["rapier"]
  ): number | undefined {
    switch (this.frictionCombineRule) {
      case "min":
        return rapier.CoefficientCombineRule.Min;
      case "max":
        return rapier.CoefficientCombineRule.Max;
      case "multiply":
        return rapier.CoefficientCombineRule.Multiply;
      case "average":
        return rapier.CoefficientCombineRule.Average;
      default:
        return undefined;
    }
  }

  // Chebyshev distance from a filled cell to the nearest empty/unfilled cell,
  // scanning outward up to a radius cap of 2. Returns 1 for an outermost (edge)
  // cell, 2 for the next ring in, and Infinity when every cell within radius 2
  // is filled (deeper interior).
  private boundaryCellDistance(gx: number, gy: number): number {
    const CAP = 2;
    let best = Infinity;
    for (let dx = -CAP; dx <= CAP; dx++) {
      for (let dy = -CAP; dy <= CAP; dy++) {
        if (dx === 0 && dy === 0) continue;
        const c = this.grid.get(gx + dx, gy + dy);
        if (!c || !c.filled) {
          const d = Math.max(Math.abs(dx), Math.abs(dy));
          if (d < best) best = d;
        }
      }
    }
    return best;
  }

  // Resolves a cell's base color + opacity via the appearance callback, after
  // computing the shared determination criteria (fade, normal shading, etc).
  private computeCellAppearance(
    gx: number,
    gy: number,
    cell: CellState
  ): CellAppearance {
    const fadeT = Math.min(
      Math.max((this.currentTime - cell.birthTime) / this.fadeDuration, 0),
      1
    );

    // Normal-based shading: dot of cell normal with rotated "up" vector.
    let shadeFactor = 1.0;
    const normal = cell.normal;
    if (normal) {
      const angle = this.entity?.angle ?? 0;
      const upX = Math.sin(-angle);
      const upY = -Math.cos(-angle);
      const dot = normal[0] * upX + normal[1] * upY;
      // Map dot [-1, 1] to shading [0.5, 1.0].
      shadeFactor = 0.75 + 0.25 * dot;
    }

    const damageRatio = Math.min(
      cell.damage / RasterShapeBehavior.CELL_DESTROY_DAMAGE,
      1
    );

    return this.appearanceFn({
      full: cell.full,
      boundaryDistance: this.boundaryCellDistance(gx, gy),
      shadeFactor,
      fadeT,
      damageRatio
    });
  }

  private updateCellAppearance() {
    if (!this.geom) return;

    const colorAttr = this.geom.getAttribute("color") as BufferAttribute;
    const alphaAttr = this.geom.getAttribute("alpha") as
      | BufferAttribute
      | undefined;
    if (!colorAttr) return;
    const colorArr = colorAttr.array as Float32Array;
    const alphaArr = alphaAttr?.array as Float32Array | undefined;

    let allDone = true;

    for (const [[gx, gy], cell] of this.grid) {
      const info = cell.vertexInfo;
      if (!cell.filled || !info) continue;
      if (cell.birthTime + this.fadeDuration > this.currentTime) {
        allDone = false;
      }

      const { color, opacity } = this.computeCellAppearance(gx, gy, cell);
      for (let vi = 0; vi < info.count; vi++) {
        const idx = info.start + vi;
        colorArr[idx * 3] = color[0];
        colorArr[idx * 3 + 1] = color[1];
        colorArr[idx * 3 + 2] = color[2];
        if (alphaArr) alphaArr[idx] = opacity;
      }
    }

    colorAttr.needsUpdate = true;
    if (alphaAttr) alphaAttr.needsUpdate = true;

    if (allDone) {
      this.animating = false;
    }
  }

  private applyPolygonThree() {
    if (!this.anyFilled() && !this.spawnFullyGrown) {
      if (this.mesh) {
        this.object3D.remove(this.mesh);
        this.geom?.dispose();
        this.mesh = undefined;
        this.geom = undefined;
      }
      return;
    }

    // For fully-grown spawned shapes (shatter chunks), use currentShape
    // rendering like the original.
    if (this.spawnFullyGrown) {
      this.applyPolygonThreeFromCurrentShape();
      return;
    }

    const posArr: number[] = [];
    const colorArr: number[] = [];
    const alphaArr: number[] = [];
    const crackUvArr: number[] = [];
    const crackAmountArr: number[] = [];
    const indexArr: number[] = [];
    const crackScale = RasterShapeBehavior.CRACK_TEXTURE_SCALE;

    for (const [[gx, gy], cell] of this.grid) {
      if (!cell.filled) continue;

      const vertexStart = posArr.length / 3;
      const crackAmt = Math.min(
        cell.damage / RasterShapeBehavior.CELL_DESTROY_DAMAGE,
        1
      );
      const { color: cellColor, opacity: cellOpacity } =
        this.computeCellAppearance(gx, gy, cell);

      if (cell.full) {
        // Full cell: 2 triangles forming a quad.
        const x0 = this.gridOriginX + gx * this.cellSize;
        const y0 = this.gridOriginY + gy * this.cellSize;
        const x1 = x0 + this.cellSize;
        const y1 = y0 + this.cellSize;

        // 4 vertices.
        const verts: arr2[] = [
          [x0, y0],
          [x1, y0],
          [x1, y1],
          [x0, y1]
        ];
        const baseIdx = posArr.length / 3;

        for (const [vx, vy] of verts) {
          posArr.push(vx, vy, 0);
          colorArr.push(cellColor[0], cellColor[1], cellColor[2]);
          alphaArr.push(cellOpacity);
          crackUvArr.push(vx * crackScale, vy * crackScale);
          crackAmountArr.push(crackAmt);
        }

        // Two triangles: (0,1,2) and (0,2,3).
        indexArr.push(baseIdx, baseIdx + 1, baseIdx + 2);
        indexArr.push(baseIdx, baseIdx + 2, baseIdx + 3);

        cell.vertexInfo = {
          start: vertexStart,
          count: 4
        };
      } else {
        // Edge cell: triangulate clipped polygon via centroid fan.
        const edgePoly = cell.edgePoly;
        if (!edgePoly || edgePoly.length < 3) {
          cell.vertexInfo = undefined;
          continue;
        }

        // Compute centroid.
        let centX = 0,
          centY = 0;
        for (const [px, py] of edgePoly) {
          centX += px;
          centY += py;
        }
        centX /= edgePoly.length;
        centY /= edgePoly.length;

        const baseIdx = posArr.length / 3;

        // Center vertex.
        posArr.push(centX, centY, 0);
        colorArr.push(cellColor[0], cellColor[1], cellColor[2]);
        alphaArr.push(cellOpacity);
        crackUvArr.push(centX * crackScale, centY * crackScale);
        crackAmountArr.push(crackAmt);

        // Edge vertices.
        for (const [px, py] of edgePoly) {
          posArr.push(px, py, 0);
          colorArr.push(cellColor[0], cellColor[1], cellColor[2]);
          alphaArr.push(cellOpacity);
          crackUvArr.push(px * crackScale, py * crackScale);
          crackAmountArr.push(crackAmt);
        }

        // Fan triangles.
        for (let i = 0; i < edgePoly.length; i++) {
          indexArr.push(
            baseIdx,
            baseIdx + 1 + i,
            baseIdx + 1 + ((i + 1) % edgePoly.length)
          );
        }

        cell.vertexInfo = {
          start: vertexStart,
          count: 1 + edgePoly.length
        };
      }
    }

    if (posArr.length === 0) {
      if (this.mesh) {
        this.object3D.remove(this.mesh);
        this.geom?.dispose();
        this.mesh = undefined;
        this.geom = undefined;
      }
      return;
    }

    if (!this.geom) this.geom = new BufferGeometry();

    this.geom.setAttribute(
      "position",
      new BufferAttribute(new Float32Array(posArr), 3)
    );
    this.geom.setAttribute(
      "color",
      new BufferAttribute(new Float32Array(colorArr), 3)
    );
    this.geom.setAttribute(
      "alpha",
      new BufferAttribute(new Float32Array(alphaArr), 1)
    );
    this.geom.setAttribute(
      "crackUv",
      new BufferAttribute(new Float32Array(crackUvArr), 2)
    );
    this.geom.setAttribute(
      "crackAmount",
      new BufferAttribute(new Float32Array(crackAmountArr), 1)
    );
    this.geom.setIndex(indexArr);
    this.geom.computeBoundingSphere();

    if (!this.mesh) {
      this.mesh = new Mesh(this.geom, RasterShapeBehavior.getCrackMaterial());
      this.mesh.layers.set(RenderLayers.default);
      this.object3D.add(this.mesh);
    }
  }

  // Used for fully-grown spawn (shatter chunks) which have currentShape
  // but no cell grid.
  private applyPolygonThreeFromCurrentShape() {
    if (!this.currentShape || !this.currentShape.length) {
      if (this.mesh) {
        this.object3D.remove(this.mesh);
        this.geom?.dispose();
        this.mesh = undefined;
        this.geom = undefined;
      }
      return;
    }

    const [cr, cg, cb] = this.fixedColor ?? [0.54, 0.47, 0.31];
    const posArr: number[] = [];
    const colorArr: number[] = [];
    const indexArr: number[] = [];
    for (const shape of this.currentShape) {
      const ring = mergeHolesIntoPolygon(shape.outer, ...shape.holes);
      const decompedOuter: arr2[][] = quickDecomp(ring);
      for (const poly of decompedOuter) {
        if (poly.length < 3) continue;
        const polyCenter = centroid(poly);
        posArr.push(polyCenter[0], polyCenter[1], 0);
        colorArr.push(cr, cg, cb);
        const indexOffset = posArr.length / 3;
        posArr.push(poly[0][0], poly[0][1], 0);
        colorArr.push(cr, cg, cb);
        for (let i = 1; i < poly.length; i++) {
          posArr.push(poly[i][0], poly[i][1], 0);
          colorArr.push(cr, cg, cb);
          indexArr.push(indexOffset, indexOffset + i - 1, indexOffset + i);
        }
      }
    }

    if (!this.geom) this.geom = new BufferGeometry();

    const vertCount = posArr.length / 3;
    const alphaArr = new Float32Array(vertCount).fill(this.fixedOpacity);
    this.geom.setAttribute(
      "position",
      new BufferAttribute(new Float32Array(posArr), 3)
    );
    this.geom.setAttribute(
      "color",
      new BufferAttribute(new Float32Array(colorArr), 3)
    );
    this.geom.setAttribute("alpha", new BufferAttribute(alphaArr, 1));
    // Chunks never take damage, but the shared cracks shader expects these
    // attributes; zeroed crackAmount disables the overlay (renders pure color).
    this.geom.setAttribute(
      "crackUv",
      new BufferAttribute(new Float32Array(vertCount * 2), 2)
    );
    this.geom.setAttribute(
      "crackAmount",
      new BufferAttribute(new Float32Array(vertCount), 1)
    );
    this.geom.setIndex(indexArr);
    this.geom.computeBoundingSphere();

    if (!this.mesh) {
      this.mesh = new Mesh(this.geom, RasterShapeBehavior.getCrackMaterial());
      this.mesh.layers.set(RenderLayers.default);
      this.object3D.add(this.mesh);
    }
  }

  scheduleRandomizedDisappear(duration: number = 2500) {
    this.growthScheduler.add({
      id: "disappear",
      startIn: Math.random() * duration * 0.5,
      duration: Math.random() * duration * 0.5,
      invokeFunctionAtStart: () => {
        if (this.entity && this.rigidBody && this.level) {
          this.currentShape = undefined;
          this.grid.clear();
          this.currentShapeDirty = true;
          this.applyPolygonRapier();
        }
      },
      invokeFunction: (t) => {
        if (!this.mesh) return;
        this.mesh.scale.set(1, 1, 1).multiplyScalar(1 - t);
      },
      invokeFunctionAtComplete: () => {
        this.events.emit(RasterShapeEvents.GeomDestroyed);
      }
    });
    return this;
  }

  private applyPolygonRapier() {
    if (!this.level || !this.entity) return;
    const { world, rapier } = this.level;

    const hasFilledCells = this.anyFilled();
    const hasCurrentShape =
      this.spawnFullyGrown && this.currentShape && this.currentShape.length > 0;

    // Remove rigid body if there's nothing left.
    if (!hasFilledCells && !hasCurrentShape) {
      if (this.rigidBody) {
        this.level.removeEntityPhysicsHooks(this.entity.id);
        if (this.attachedToTerrainJoint !== undefined) {
          this.level.world.removeImpulseJoint(
            this.attachedToTerrainJoint,
            true
          );
          this.attachedToTerrainJoint = undefined;
        }
        this.level.world.removeRigidBody(this.rigidBody);
        this.rigidBody = undefined;
      }
      return;
    }

    // Spawn rigid body if necessary.
    if (!this.rigidBody) {
      this.rigidBody = world.createRigidBody(rapier.RigidBodyDesc.dynamic());
      this.rigidBody.setTranslation(this.entity.position, true);
      this.rigidBody.setRotation(this.entity.angle, true);
      if (this.enableCcd) this.rigidBody.enableCcd(true);
      this.level.registerEntityPhysicsHooks({
        entityId: this.entity.id,
        rigidBodyHandle: this.rigidBody.handle,
        beginCollision: (
          _thisEntity,
          otherEntity,
          _normal,
          thisCollHandle,
          otherCollHandle
        ) => {
          if (!otherEntity) return;

          // We want to embed stone within terrain - don't collide with it.
          if (this.attachedToTerrain.has(otherEntity)) {
            return CollisionBehavior.NoCollide;
          }

          if (otherEntity.hit === undefined) return;
          let coll = this.colls.get(otherEntity.id);
          if (!coll) {
            coll = {
              handleMap: new Map()
            };
            this.colls.set(otherEntity.id, coll);
          }
          let contactDamageMap = coll.handleMap.get(thisCollHandle);
          if (!contactDamageMap) {
            contactDamageMap = new Map();
            coll.handleMap.set(thisCollHandle, contactDamageMap);
          }
          contactDamageMap.set(otherCollHandle, false);
        },
        endCollision: (
          _thisEntity,
          otherEntity,
          thisCollHandle,
          otherCollHandle
        ) => {
          if (!otherEntity) return;
          const coll = this.colls.get(otherEntity.id);
          if (!coll) return;
          const contactMap = coll.handleMap.get(thisCollHandle);
          if (contactMap) contactMap.delete(otherCollHandle);
          if (contactMap?.size === 0) coll.handleMap.delete(thisCollHandle);
          if (coll.handleMap.size === 0) this.colls.delete(otherEntity.id);
        }
      });
    }

    // Create a joint to the terrain that we spawned on.
    if (
      this.anchorTerrain !== undefined &&
      this.anchorTerrainOffset !== undefined &&
      this.anchorTerrainAngleOffset !== undefined &&
      this.attachedToTerrainJoint === undefined
    ) {
      let terrainRigidBody: RigidBody | undefined;
      if (isAnyTerrain(this.anchorTerrain)) {
        terrainRigidBody = this.anchorTerrain.getRigidBody();
      } else {
        // Access rigid body via runtime property access (may be private on
        // the other behavior class).
        terrainRigidBody = (this.anchorTerrain as any)?.behaviors?.shape
          ?.rigidBody;
      }
      if (terrainRigidBody) {
        const jointParams = rapier.JointData.fixed(
          { x: 0, y: 0 },
          0,
          this.anchorTerrainOffset,
          this.anchorTerrainAngleOffset
        );
        this.attachedToTerrainJoint = world.createImpulseJoint(
          jointParams,
          this.rigidBody,
          terrainRigidBody,
          true
        );
      }
    }

    // Clear all colliders currently attached to the rigid body.
    const nc = this.rigidBody.numColliders();
    for (let ci = nc - 1; ci >= 0; ci--) {
      const coll = this.rigidBody.collider(ci);
      this.level?.world.removeCollider(coll, false);
    }

    if (this.spawnFullyGrown && this.currentShape) {
      // For fully-grown shapes, use the original polygon-based collider
      // creation.
      this.createCollidersFromCurrentShape();
    } else {
      // Per-cell colliders with greedy rectangle merging.
      this.createCollidersFromCellGrid();
    }

    if (this.rigidBody.numColliders() === 0) {
      if (this.attachedToTerrainJoint) {
        world.removeImpulseJoint(this.attachedToTerrainJoint, false);
        this.attachedToTerrainJoint = undefined;
      }
      world.removeRigidBody(this.rigidBody);
      this.level.removeEntityPhysicsHooks(this.entity.id);
      this.rigidBody = undefined;
    } else {
      this.level.updateEntityPhysicsHooks({
        entityId: this.entity.id,
        rigidBodyHandle: this.rigidBody.handle
      });
    }
  }

  private createCollidersFromCellGrid() {
    if (!this.level || !this.rigidBody) return;
    const { world, rapier } = this.level;

    const isFilledFull = (gx: number, gy: number): boolean => {
      const cell = this.grid.get(gx, gy);
      return !!cell && cell.filled && cell.full;
    };

    // Greedy rectangle merging for full cells.
    const visited = new Set<string>();

    // Find the grid bounds of filled full cells.
    let minGX = Infinity,
      maxGX = -Infinity;
    let minGY = Infinity,
      maxGY = -Infinity;
    for (const [[gx, gy], cell] of this.grid) {
      if (!cell.filled || !cell.full) continue;
      minGX = Math.min(minGX, gx);
      maxGX = Math.max(maxGX, gx);
      minGY = Math.min(minGY, gy);
      maxGY = Math.max(maxGY, gy);
    }

    if (minGX <= maxGX) {
      // Scan rows left-to-right, bottom-to-top for greedy merging.
      for (let gy = minGY; gy <= maxGY; gy++) {
        for (let gx = minGX; gx <= maxGX; gx++) {
          const key = `${gx},${gy}`;
          if (visited.has(key)) continue;
          if (!isFilledFull(gx, gy)) continue;

          // Extend right as far as possible.
          let endX = gx;
          while (endX + 1 <= maxGX) {
            if (!visited.has(`${endX + 1},${gy}`) && isFilledFull(endX + 1, gy)) {
              endX++;
            } else {
              break;
            }
          }

          // Extend that horizontal span downward (gy+1, gy+2, ...).
          let endY = gy;
          outer: while (endY + 1 <= maxGY) {
            for (let x = gx; x <= endX; x++) {
              if (visited.has(`${x},${endY + 1}`) || !isFilledFull(x, endY + 1)) {
                break outer;
              }
            }
            endY++;
          }

          // Mark all cells in this rectangle as visited.
          for (let y = gy; y <= endY; y++) {
            for (let x = gx; x <= endX; x++) {
              visited.add(`${x},${y}`);
            }
          }

          // Create box collider for this merged rectangle.
          const rectW = (endX - gx + 1) * this.cellSize;
          const rectH = (endY - gy + 1) * this.cellSize;
          const cx = this.gridOriginX + gx * this.cellSize + rectW * 0.5;
          const cy = this.gridOriginY + gy * this.cellSize + rectH * 0.5;

          const colliderDesc = rapier.ColliderDesc.cuboid(
            rectW * 0.5,
            rectH * 0.5
          )
            .setTranslation(cx, cy)
            .setDensity(1)
            .setFriction(this.friction)
            .setCollisionGroups(terrainCollisionGroup);

          const boxCombineRule = this.resolveFrictionCombineRule(rapier);
          if (boxCombineRule !== undefined) {
            colliderDesc.setFrictionCombineRule(boxCombineRule);
          }

          colliderDesc.setActiveHooks(
            this.level.rapier.ActiveHooks.FILTER_CONTACT_PAIRS
          );
          colliderDesc.setActiveEvents(
            rapier.ActiveEvents.COLLISION_EVENTS |
              rapier.ActiveEvents.CONTACT_FORCE_EVENTS
          );

          try {
            world.createCollider(colliderDesc, this.rigidBody);
          } catch (err) {
            console.error("Failed to create box collider", err);
          }
        }
      }
    }

    // Edge cells: convex decompose each clipped polygon.
    for (const [, cell] of this.grid) {
      if (!cell.filled || cell.full) continue;
      const edgePoly = cell.edgePoly;
      if (!edgePoly || edgePoly.length < 3) continue;

      this.createConvexColliders(edgePoly);
    }

    this.rigidBody?.wakeUp();
  }

  private createConvexColliders(polygon: arr2Polygon) {
    if (!this.level || !this.rigidBody) return;
    const { world, rapier } = this.level;

    const componentPolygons = quickDecomp([...polygon]);
    for (const componentPolygonRaw of componentPolygons) {
      removeCollinearPoints(componentPolygonRaw, 0.005);
      removeDuplicatePoints(componentPolygonRaw, 0.005);
      if (getArea(componentPolygonRaw) < 0.00125) continue;
      const splitFeature = simplepolygon({
        type: "Feature",
        properties: {},
        geometry: {
          type: "Polygon",
          coordinates: [componentPolygonRaw]
        }
      });
      const componentPolygon = splitFeature.features
        .at(0)
        ?.geometry.coordinates?.at(0) as arr2Polygon;
      if (!componentPolygon) continue;
      removeCollinearPoints(componentPolygon, 0.005);
      removeDuplicatePoints(componentPolygon, 0.005);
      if (componentPolygon.length < 3) continue;
      if (getArea(componentPolygon) < 0.00125) continue;
      makeCCW(componentPolygon);
      const componentCentroid = centroid(componentPolygon);
      let [componentCentroidX, componentCentroidY] = componentCentroid;
      if (
        !Number.isFinite(componentCentroidX) ||
        !Number.isFinite(componentCentroidY)
      ) {
        componentCentroidX = 0;
        componentCentroidY = 0;
        for (const [x, y] of componentPolygon) {
          componentCentroidX += x;
          componentCentroidY += y;
        }
        componentCentroidX /= componentPolygon.length;
        componentCentroidY /= componentPolygon.length;
      }
      const offsetComponentPolygon = [];
      for (const [x, y] of componentPolygon) {
        offsetComponentPolygon.push([
          x - componentCentroidX,
          y - componentCentroidY
        ]);
      }
      const vtxArr = new Float32Array(offsetComponentPolygon.length * 2);
      for (let i = 0; i < offsetComponentPolygon.length; i++) {
        const vtx = offsetComponentPolygon[i];
        vtxArr[i * 2 + 0] = vtx[0];
        vtxArr[i * 2 + 1] = vtx[1];
      }
      const colliderDesc = new rapier.ColliderDesc(
        new rapier.ConvexPolygon(vtxArr, false)
      )
        .setTranslation(componentCentroidX, componentCentroidY)
        .setDensity(1)
        .setFriction(this.friction)
        .setCollisionGroups(terrainCollisionGroup);

      const convexCombineRule = this.resolveFrictionCombineRule(rapier);
      if (convexCombineRule !== undefined) {
        colliderDesc.setFrictionCombineRule(convexCombineRule);
      }

      colliderDesc.setActiveHooks(
        this.level.rapier.ActiveHooks.FILTER_CONTACT_PAIRS
      );
      colliderDesc.setActiveEvents(
        rapier.ActiveEvents.COLLISION_EVENTS |
          rapier.ActiveEvents.CONTACT_FORCE_EVENTS
      );

      try {
        world.createCollider(colliderDesc, this.rigidBody);
      } catch (err) {
        console.error("Failed to create collider", err, vtxArr);
      }
    }
  }

  private createCollidersFromCurrentShape() {
    if (!this.currentShape || !this.level || !this.rigidBody) return;
    for (const shape of this.currentShape) {
      const combinedPolygon = mergeHolesIntoPolygon(
        shape.outer,
        ...shape.holes
      );
      this.createConvexColliders(combinedPolygon);
    }
  }

  private applySize() {
    if (!this.anyFilled() && !this.spawnFullyGrown) return;

    if (this.spawnFullyGrown && this.currentShape) {
      const box2 = new Box2();
      const pnt = new Vector2();
      for (const shape of this.currentShape) {
        for (const pt of shape.outer) {
          pnt.set(pt[0], pt[1]);
          box2.expandByPoint(pnt);
        }
      }
      this.events.emit(RasterShapeEvents.SizeChanged, {
        width: box2.max.x - box2.min.x,
        height: box2.max.y - box2.min.y
      });
      return;
    }

    // Compute bounding box from filled cells.
    let minX = Infinity,
      maxX = -Infinity;
    let minY = Infinity,
      maxY = -Infinity;
    for (const [[gx, gy], cell] of this.grid) {
      if (!cell.filled) continue;
      const x0 = this.gridOriginX + gx * this.cellSize;
      const y0 = this.gridOriginY + gy * this.cellSize;
      const x1 = x0 + this.cellSize;
      const y1 = y0 + this.cellSize;
      minX = Math.min(minX, x0);
      maxX = Math.max(maxX, x1);
      minY = Math.min(minY, y0);
      maxY = Math.max(maxY, y1);
    }

    if (minX < Infinity) {
      this.events.emit(RasterShapeEvents.SizeChanged, {
        width: maxX - minX,
        height: maxY - minY
      });
    }
  }

  private checkPointsForDamageToOtherEntities() {
    if (!this.entity || !this.level || !this.rigidBody || !this.inputShape)
      return;

    if (!this.canDamage) return;

    // Only check against the original input polygon's vertices, not the
    // rasterized cell union which has many artificial grid-aligned vertices.
    const rings = [this.inputShape.outer, ...this.inputShape.holes];

    const origin = new Vector2();
    const delta = new Vector2();
    for (const [otherEntityId, coll] of this.colls) {
      const entity = this.level?.getEntity(otherEntityId);
      if (!entity) {
        this.colls.delete(otherEntityId);
        continue;
      }
      for (const [thisHandle, thoseHandles] of coll.handleMap) {
        const thisColl = this.level.world.getCollider(thisHandle);
        for (const [thatHandle, alreadyDidDamage] of thoseHandles) {
          if (alreadyDidDamage) continue;
          const thatColl = this.level.world.getCollider(thatHandle);
          if (!thisColl || !thatColl) continue;
          const contact = thisColl.contactCollider(thatColl, 0);
          if (!contact) continue;
          const contactPoint = contact.point2;
          const contactNormal = contact.normal1;
          const relativeNormal = new Vector2(contactNormal.x, contactNormal.y);
          relativeNormal.rotateAround(origin, -this.entity.angle);
          const relativeContactPoint = new Vector2(
            contactPoint.x,
            contactPoint.y
          );
          relativeContactPoint.x -= this.entity.position.x;
          relativeContactPoint.y -= this.entity.position.y;
          relativeContactPoint.rotateAround(origin, -this.entity.angle);
          const thisPointVelRaw = this.rigidBody.velocityAtPoint(
            contact.point1
          );
          const thatPointVelRaw =
            thatColl.parent()?.velocityAtPoint(contact.point2) ??
            thatColl.parent()?.linvel();
          if (thatPointVelRaw === undefined) continue;
          const velDelta = new Vector2(
            thatPointVelRaw.x - thisPointVelRaw.x,
            thatPointVelRaw.y - thisPointVelRaw.y
          );
          velDelta.rotateAround(origin, -this.entity.angle);
          const vDiff = velDelta.length();

          // Find the nearest vertex on the original input polygon.
          let nearestRingIndex = -1;
          let nearestVertIndex = -1;
          let nearestVertDistSq = Number.MAX_VALUE;
          for (let ri = 0; ri < rings.length; ri++) {
            const ring = rings[ri];
            for (let i = 0; i < ring.length; i++) {
              const [x, y] = ring[i];
              delta.set(x, y);
              delta.sub(relativeContactPoint);
              const lenSq = delta.lengthSq();
              if (lenSq < nearestVertDistSq) {
                nearestRingIndex = ri;
                nearestVertDistSq = lenSq;
                nearestVertIndex = i;
              }
            }
          }
          if (
            nearestRingIndex === -1 ||
            nearestVertIndex === -1 ||
            nearestVertDistSq > vDiff * vDiff + 0.25
          ) {
            continue;
          }
          const ring = rings[nearestRingIndex];
          const pLeft = ring.at(nearestVertIndex - 1);
          const pCenter = ring.at(nearestVertIndex);
          const pRight = ring.at((nearestVertIndex + 1) % ring.length);
          if (!pLeft || !pCenter || !pRight) continue;
          const vtxBehind = new Vector2(
            pLeft[0] + pRight[0],
            pLeft[1] + pRight[1]
          ).multiplyScalar(0.5);
          const vtx = new Vector2(pCenter[0], pCenter[1]);
          const vNorm = vtx.clone().sub(vtxBehind);
          vNorm.normalize();
          const hitAligned = Math.abs(relativeNormal.dot(vNorm)) > 0.65;
          if (!hitAligned) continue;
          const vLeft = new Vector2(pLeft[0], pLeft[1]).sub(vtx).normalize();
          const vRight = new Vector2(pRight[0], pRight[1]).sub(vtx).normalize();
          if (vLeft.dot(vRight) < 0.5) continue;
          const stabAmount = Math.abs(velDelta.dot(vNorm));
          if (stabAmount < 0.25) continue;
          thoseHandles.set(thatHandle, true);
          entity.hit?.({
            hittingEntity: this.entity,
            sourceEntity: this.entity,
            damage: stabAmount,
            elementalDamageType: this.contactDamageType
          });
        }
      }
    }
  }

  private shatterAllCells() {
    if (!this.entity) return;
    if (!this.anyFilled()) {
      this.events.emit(RasterShapeEvents.GeomDestroyed);
      return;
    }

    const offset = this.entity.position;
    const angle = this.entity.angle;
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    const newChunks: Chunk[] = [];

    for (const [[gx, gy], cell] of this.grid) {
      if (!cell.filled) continue;

      let cellPoly: arr2Polygon;
      if (cell.full) {
        const x0 = this.gridOriginX + gx * this.cellSize;
        const y0 = this.gridOriginY + gy * this.cellSize;
        const x1 = x0 + this.cellSize;
        const y1 = y0 + this.cellSize;
        cellPoly = [
          [x0, y0],
          [x1, y0],
          [x1, y1],
          [x0, y1]
        ];
      } else {
        const edgePoly = cell.edgePoly;
        if (!edgePoly || edgePoly.length < 3) continue;
        cellPoly = edgePoly;
      }

      // Compute centroid of the cell polygon in local space.
      let cx = 0,
        cy = 0;
      for (const [px, py] of cellPoly) {
        cx += px;
        cy += py;
      }
      cx /= cellPoly.length;
      cy /= cellPoly.length;

      // Rotate centroid and shape vertices by entity angle so chunks
      // spawn in world-aligned coordinates.
      const position = offset
        .clone()
        .add(
          vector2To3(new Vector2(cx * cosA - cy * sinA, cx * sinA + cy * cosA))
        );
      const shape: arr2Polygon = cellPoly.map(([x, y]) => {
        const dx = x - cx;
        const dy = y - cy;
        return [dx * cosA - dy * sinA, dx * sinA + dy * cosA];
      });

      const { color, opacity } = this.computeCellAppearance(gx, gy, cell);
      newChunks.push({ position, shape, color, opacity });
    }

    if (newChunks.length === 0) {
      this.events.emit(RasterShapeEvents.GeomDestroyed);
      return;
    }

    this.events.emit(RasterShapeEvents.Subdivided, {
      newChunks,
      disappear: true
    });
    this.events.emit(RasterShapeEvents.GeomDestroyed);
  }

  detachFromLevel() {
    if (!this.level) return;
    if (this.attachedToTerrainJoint) {
      this.level.world?.removeImpulseJoint(this.attachedToTerrainJoint, true);
    }
    if (this.rigidBody) {
      this.level.world.removeRigidBody(this.rigidBody);
    }
    if (this.entity) {
      this.level?.navigation?.deleteObstacle(this.entity.id);
    }
  }

  dispose() {
    // The cracks material/texture are shared statics — never disposed here.
    this.geom?.dispose();
    this.geom = undefined;
    this.rigidBody = undefined;
  }

  // Detach from terrain.
  detach() {
    this.growing = false;
    if (this.attachedToTerrainJoint) {
      this.level?.world?.removeImpulseJoint(this.attachedToTerrainJoint, true);
    }
    this.attachedToTerrainJoint = undefined;
    this.attachedToTerrain.clear();
    this.anchorTerrain = undefined;
    this.anchorTerrainOffset = undefined;
    this.anchorTerrainAngleOffset = undefined;

    // Rebuild colliders so Rapier re-evaluates contact pairs. Without this,
    // the cached NoCollide state from the attached terrain persists and the
    // block falls through the terrain it was built on.
    this.applyPolygonRapier();
  }

  // --- Public debug methods for MCP/console inspection ---

  getDebugInfo() {
    let fullCellCount = 0;
    let edgeCellCount = 0;
    for (const [, cell] of this.grid) {
      if (cell.full) fullCellCount++;
      else edgeCellCount++;
    }
    return {
      cellSize: this.cellSize,
      gridOriginX: this.gridOriginX,
      gridOriginY: this.gridOriginY,
      fullCellCount,
      edgeCellCount,
      totalTargetCells: this.grid.size,
      filledCellCount: this.countFilled(),
      frontierLength: this.frontier.length,
      growing: this.growing,
      animating: this.animating,
      currentTime: this.currentTime,
      hasRigidBody: !!this.rigidBody,
      numColliders: this.rigidBody?.numColliders() ?? 0,
      hasMesh: !!this.mesh,
      inputShapeVerts: this.inputShape?.outer.length ?? 0,
      inputShapeHoles: this.inputShape?.holes.length ?? 0,
      cornerFilledCount: [...this.cornerFilled.values()].filter(Boolean).length,
      cornerTotalCount: this.cornerFilled.size
    };
  }

  getFullCellKeys(): string[] {
    const keys: string[] = [];
    for (const [[gx, gy], cell] of this.grid) {
      if (cell.full) keys.push(`${gx},${gy}`);
    }
    return keys;
  }

  getEdgeCellKeys(): string[] {
    const keys: string[] = [];
    for (const [[gx, gy], cell] of this.grid) {
      if (!cell.full) keys.push(`${gx},${gy}`);
    }
    return keys;
  }

  getFilledCellKeys(): string[] {
    const keys: string[] = [];
    for (const [[gx, gy], cell] of this.grid) {
      if (cell.filled) keys.push(`${gx},${gy}`);
    }
    return keys;
  }

  getEdgeCellPolygon(cellKey: string): arr2Polygon | undefined {
    const [gx, gy] = cellKey.split(",").map(Number);
    const cell = this.grid.get(gx, gy);
    return cell && !cell.full ? cell.edgePoly : undefined;
  }

  getCellWorldBounds(cellKey: string):
    | {
        x0: number;
        y0: number;
        x1: number;
        y1: number;
      }
    | undefined {
    const [gx, gy] = cellKey.split(",").map(Number);
    if (!this.grid.has(gx, gy)) return undefined;
    return {
      x0: this.gridOriginX + gx * this.cellSize,
      y0: this.gridOriginY + gy * this.cellSize,
      x1: this.gridOriginX + (gx + 1) * this.cellSize,
      y1: this.gridOriginY + (gy + 1) * this.cellSize
    };
  }

  // Returns a 2D ASCII grid visualization of the cell state.
  // F = full, E = edge, . = empty target, ' ' = not a target
  // Seed/filled cells are shown in UPPERCASE, unfilled in lowercase.
  getDebugGrid(): string {
    if (this.grid.size === 0) return "(no cells)";

    let minGX = Infinity,
      maxGX = -Infinity;
    let minGY = Infinity,
      maxGY = -Infinity;
    for (const [[gx, gy]] of this.grid) {
      minGX = Math.min(minGX, gx);
      maxGX = Math.max(maxGX, gx);
      minGY = Math.min(minGY, gy);
      maxGY = Math.max(maxGY, gy);
    }

    const rows: string[] = [];
    // Render top-to-bottom (high Y first).
    for (let gy = maxGY; gy >= minGY; gy--) {
      let row = "";
      for (let gx = minGX; gx <= maxGX; gx++) {
        const cell = this.grid.get(gx, gy);
        if (!cell) {
          row += " ";
        } else if (cell.full) {
          row += cell.filled ? "F" : "f";
        } else {
          row += cell.filled ? "E" : "e";
        }
      }
      rows.push(`${String(gy).padStart(3)} |${row}|`);
    }

    // Column labels.
    const colNums = [];
    for (let gx = minGX; gx <= maxGX; gx++) {
      colNums.push(String(gx % 10));
    }
    rows.push(`    ${colNums.join("")}`);

    return rows.join("\n");
  }

  getInputShapeOuter(): arr2Polygon | undefined {
    return this.inputShape?.outer;
  }

  getInputShapeHoles(): arr2Polygons | undefined {
    return this.inputShape?.holes;
  }

  setCanDamage(canDamage: boolean) {
    this.canDamage = canDamage;
    return this;
  }

  getCanDamage() {
    return this.canDamage;
  }
}
