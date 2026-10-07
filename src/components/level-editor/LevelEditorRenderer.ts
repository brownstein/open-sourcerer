import {
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  Color,
  FrontSide,
  LineBasicMaterial,
  LineDashedMaterial,
  LineSegments,
  LinearSRGBColorSpace,
  Mesh,
  MeshBasicMaterial,
  NearestFilter,
  NoToneMapping,
  Object3D,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  Texture,
  Vector2,
  Vector3,
  WebGLRenderer
} from "three";

import { RenderLayers } from "src/engine/constants/renderLayers";
import { kInvPixelScale, kPixelScale } from "src/engine/constants/scaling";
import { createEntityAssetLoader } from "src/engine/entity/createEntityAssetLoader";
import { Level } from "src/engine/level/Level";
import type { TilesetTileDefs } from "src/engine/level/tiled/api";
import { parseMap } from "src/engine/level/tiled/parseMap";
import { parseTileset } from "src/engine/level/tiled/parseTileset";
import { entityClassRegistry } from "src/entities/allEntities";
import { Text } from "src/entities/environment/Text";
import { createEntityForMapTerrain } from "src/entities/terrain/allTerrain";

import { DEFAULT_ENTITY_SIZE, HANDLE_SIZE, TILE_SIZE } from "./constants";
import { ENTITY_DEFAULTS } from "./entityDefaults";
import { toRuntimeEntityRefProperties } from "./entityRefs";
import {
  EditorLayer,
  EntityLayer,
  EntityPlacement,
  LevelEditorState,
  TilePlacement,
  UnknownLayer
} from "./levelEditorState";
import { buildTMJFromState } from "./tmjBuilder";

// --- Constants ---

const TILE_WORLD = TILE_SIZE / kPixelScale; // = 0.5
const MAX_GRID_LINES = 600;
/** Opacity multiplier for non-active layers while highlight mode is on. */
const HIGHLIGHT_DIM = 0.3;

/** Layer alpha factor given the highlight-active-layer mode. */
function layerDimFactor(isActive: boolean, highlight: boolean): number {
  return isActive || !highlight ? 1 : HIGHLIGHT_DIM;
}

// --- Shared helpers (exported for use by LevelEditorCanvas) ---

export type SpawnedEntityInfo = {
  levelEntityId: string;
  type: string;
  tileX: number;
  tileY: number;
  w: number;
  h: number;
  angle: number;
  layerZ: number;
  propsJson: string;
};

export function getEntityPixelSize(entity: EntityPlacement): {
  width: number;
  height: number;
} {
  const defaults = ENTITY_DEFAULTS[entity.type] || DEFAULT_ENTITY_SIZE;
  return {
    width: entity.width ?? defaults.width,
    height: entity.height ?? defaults.height
  };
}

// Colors for entity type categories
const ENTITY_COLORS: Record<string, string> = {
  Player: "#4488ff",
  default: "#ff8844"
};

function getEntityColor(type: string): string {
  return ENTITY_COLORS[type] || ENTITY_COLORS.default;
}

// --- Overlay types ---

type OverlayRefs = {
  rootScene: Scene;
  editorOverlay: Object3D;
  tileGroup: Object3D;
  imageGroup: Object3D;
  entityOverlayGroup: Object3D;
  textLabelGroup: Object3D;
  imageTextLabels: Text[];
  gridLines: LineSegments;
  gridMaterial: LineBasicMaterial;
  gridPositions: Float32Array;
  originLines: LineSegments;
  originMaterial: LineBasicMaterial;
  originPositions: Float32Array;
  selectionGroup: Object3D;
  refArrowGroup: Object3D;
  refArrowKey: string;
  hoverLines: LineSegments;
  hoverMaterial: LineDashedMaterial;
  hoverPositions: Float32Array;
  tileSelectionGroup: Object3D;
  tileSelectionKeys: string[];
  previewGroup: Object3D;
  sessionLines: LineSegments;
  sessionMaterial: LineBasicMaterial;
  sessionPositions: Float32Array;
};

/** One entityRef prop drawn as an arrow; incoming references draw dimmed. */
export type RefArrowLink = {
  from: EntityPlacement;
  to: EntityPlacement;
  dimmed: boolean;
};

const REF_ARROW_COLOR = 0x4fc3f7;
const REF_ARROW_HIGHLIGHT_COLOR = 0xffd24d;
const REF_ARROW_HEAD_LENGTH = 0.2;
const REF_ARROW_HEAD_HALF_WIDTH = 0.1;
/** Above the entity overlays and tile highlights, below the session band. */
const REF_ARROW_Z = 5.3;

/** Max segments in the polyline-session rubber band. */
const SESSION_LINE_SEGMENTS = 4;

const HOVER_LINE_SEGMENTS = 4;

/** Two-triangle indices for a batch of quads (4 vertices each). 16-bit
 *  indices top out at vertex 65535, so batches past 16384 quads (large tile
 *  layers) need 32-bit indices or every later quad wraps onto the first
 *  quads' vertices and renders invisibly on top of them. */
function quadIndexArray(quadCount: number): Uint16Array | Uint32Array {
  const idxArr =
    quadCount * 4 > 65536
      ? new Uint32Array(quadCount * 6)
      : new Uint16Array(quadCount * 6);
  for (let i = 0; i < quadCount; i++) {
    idxArr[i * 6 + 0] = i * 4 + 0;
    idxArr[i * 6 + 1] = i * 4 + 1;
    idxArr[i * 6 + 2] = i * 4 + 2;
    idxArr[i * 6 + 3] = i * 4 + 0;
    idxArr[i * 6 + 4] = i * 4 + 2;
    idxArr[i * 6 + 5] = i * 4 + 3;
  }
  return idxArr;
}

// --- Helper: dispose a group's children ---

function disposeGroup(group: Object3D) {
  while (group.children.length > 0) {
    const child = group.children[0];
    group.remove(child);
    if (child instanceof Mesh) {
      child.geometry?.dispose();
      if (Array.isArray(child.material)) {
        child.material.forEach((m) => m.dispose());
      } else {
        child.material?.dispose();
      }
    }
    if (child instanceof LineSegments) {
      child.geometry?.dispose();
      if (Array.isArray(child.material)) {
        child.material.forEach((m) => m.dispose());
      } else {
        child.material?.dispose();
      }
    }
    // Recurse for nested Object3D groups (e.g. entity rotation groups)
    if (child instanceof Object3D && child.children.length > 0) {
      disposeGroup(child);
    }
  }
}

// --- Tileset texture cache type ---

export type TilesetTextureCache = Map<
  string,
  { texture: Texture; img: HTMLImageElement }
>;

export type TilesetMeta = Map<
  string,
  { columns: number; tileWidth: number; tileHeight: number; tilecount: number }
>;

type SpawnedGhostEntity = {
  id: string;
  object3D?: Object3D;
  teleport?: (p: Vector3) => void;
  destroy?: () => void;
};

type RemoteEntityGhost = {
  type: string;
  entity: SpawnedGhostEntity | null;
  heightPx: number;
  targetX: number;
  targetY: number;
};

type ConstructedGhost = Awaited<
  ReturnType<Level["constructEntityAfterPreload"]>
>;

const REMOTE_GHOST_DIM = 0.45;

// --- Render loop state getter ---

export type RenderLoopState = {
  camera: { x: number; y: number; zoom: number };
  canvasSize: { width: number; height: number };
  state: LevelEditorState;
  mouseTile: { x: number; y: number } | null;
  tileDragOffset?: { dx: number; dy: number };
  previewTiles?: { dx: number; dy: number; tile: TilePlacement }[] | null;
  /** Rubber-band strip for an active polyline session, in absolute Tiled px. */
  polylinePreview?: { x: number; y: number }[] | null;
  /** Snapped fractional tile position for the placement ghost, if showing. */
  ghostPosition?: { tileX: number; tileY: number } | null;
};

// =============================================================================
// LevelEditorRenderer — owns all Three.js / WebGL lifecycle
// =============================================================================

export class LevelEditorRenderer {
  level: Level | undefined;
  private renderer: WebGLRenderer | undefined;
  private camera: OrthographicCamera | undefined;
  private overlay: OverlayRefs | null = null;
  private spawned = new Map<string, SpawnedEntityInfo>();
  private generation = 0;
  private imageLayerTextureCache = new Map<
    string,
    { texture: Texture; img: HTMLImageElement }
  >();
  private animId = 0;
  private disposed = false;
  private liveMode = false;
  private lastFrameTime = 0;
  private lastPreviewKey: {
    tiles: { dx: number; dy: number; tile: TilePlacement }[];
    mtx: number;
    mty: number;
    offX: number;
    offY: number;
  } | null = null;
  private terrainEntityIds: string[] = [];
  /** Anchor positions for dynamic rigid bodies — used to clamp drift in live mode. */
  private bodyAnchors = new Map<number, { x: number; y: number }>();
  // Placement-tool ghost: one real entity spawned per selected type and moved
  // under the cursor each frame (spawning per mousemove would be far too slow
  // for asset-heavy entities).
  private ghostEntity: SpawnedGhostEntity | null = null;
  private ghostType: string | null = null;
  private ghostHeightPx = 0;
  private ghostGeneration = 0;
  private ghostPositionVec = new Vector3();
  // Remote peers' placement ghosts: one real entity per peer, so
  // collaborators see the same sprite the placing user sees, just faded.
  private remoteEntityGhosts = new Map<string, RemoteEntityGhost>();
  // Callback to trigger React re-render when image layers load
  private onImageLoad: (() => void) | null = null;
  // Cached references for tile preview rendering
  private cachedTilesetTextures: TilesetTextureCache = new Map();
  private cachedTilesetMeta: TilesetMeta = new Map();

  /** True once init() completes successfully. */
  get ready(): boolean {
    return !!this.level && !!this.renderer;
  }

  // -------------------------------------------------------------------------
  // Init
  // -------------------------------------------------------------------------

  async init(
    canvas: HTMLCanvasElement,
    onImageLoad?: () => void
  ): Promise<void> {
    this.onImageLoad = onImageLoad ?? null;

    const rapier = await import("@dimforge/rapier2d-compat");
    const origWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      if (
        typeof args[0] === "string" &&
        args[0].includes("deprecated parameters")
      )
        return;
      origWarn.apply(console, args);
    };
    await rapier.init();
    console.warn = origWarn;
    if (this.disposed) return;

    const level = new Level("editor-preview", rapier);
    level.scene.background = null;

    level.setEntityLoaderProvider({
      async preloadEntityType(typeName: string) {
        const EntityClass = entityClassRegistry.get(typeName);
        if (!EntityClass) throw new Error(`Unknown entity type: ${typeName}`);
        await createEntityAssetLoader(
          [EntityClass],
          new Set([typeName])
        ).load();
      },
      constructEntity(props: any) {
        const EntityClass = entityClassRegistry.get(props.type);
        if (!EntityClass) return null;
        return new EntityClass(props) as any;
      }
    });

    if (this.disposed) return;

    const renderer = new WebGLRenderer({
      canvas,
      alpha: false,
      antialias: false
    });
    renderer.setClearColor(0x1a1a2e, 1);
    renderer.outputColorSpace = LinearSRGBColorSpace;
    renderer.toneMapping = NoToneMapping;

    const cam = new OrthographicCamera(0, 100, 100, 0, 0, 256);
    cam.position.set(0, 0, 128);
    // Text entities default to RenderLayers.text (2); the game runtime handles this
    // with a multi-pass renderer, but the editor renders in a single pass — enable
    // the text layer here so Text entities (and our type labels) render directly.
    cam.layers.enable(RenderLayers.text);

    const rootScene = new Scene();
    rootScene.add(level.scene);

    const editorOverlay = new Object3D();
    editorOverlay.name = "editorOverlay";
    level.scene.add(editorOverlay);

    const tileGroup = new Object3D();
    tileGroup.name = "tileGroup";
    editorOverlay.add(tileGroup);

    const imageGroup = new Object3D();
    imageGroup.name = "imageGroup";
    editorOverlay.add(imageGroup);

    const entityOverlayGroup = new Object3D();
    entityOverlayGroup.name = "entityOverlayGroup";
    editorOverlay.add(entityOverlayGroup);

    // Text labels: own group so disposeGroup doesn't destroy troika internals
    const textLabelGroup = new Object3D();
    textLabelGroup.name = "textLabelGroup";
    editorOverlay.add(textLabelGroup);

    // Grid
    const gridPositions = new Float32Array(MAX_GRID_LINES * 2 * 3);
    const gridGeom = new BufferGeometry();
    gridGeom.setAttribute("position", new BufferAttribute(gridPositions, 3));
    gridGeom.setDrawRange(0, 0);
    const gridMaterial = new LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.1
    });
    const gridLines = new LineSegments(gridGeom, gridMaterial);
    gridLines.name = "gridLines";
    gridLines.renderOrder = 4;
    gridLines.frustumCulled = false;
    editorOverlay.add(gridLines);

    // Origin crosshair
    const originPositions = new Float32Array(4 * 3);
    const originGeom = new BufferGeometry();
    originGeom.setAttribute(
      "position",
      new BufferAttribute(originPositions, 3)
    );
    originGeom.setDrawRange(0, 0);
    const originMaterial = new LineBasicMaterial({
      color: 0xff6464,
      transparent: true,
      opacity: 0.3,
      linewidth: 2
    });
    const originLines = new LineSegments(originGeom, originMaterial);
    originLines.name = "originLines";
    originLines.renderOrder = 4;
    originLines.frustumCulled = false;
    editorOverlay.add(originLines);

    // Selection group
    const selectionGroup = new Object3D();
    selectionGroup.name = "selectionGroup";
    selectionGroup.renderOrder = 5;
    editorOverlay.add(selectionGroup);

    // Reference arrows between entityRef props and their targets
    const refArrowGroup = new Object3D();
    refArrowGroup.name = "refArrowGroup";
    refArrowGroup.renderOrder = 5;
    editorOverlay.add(refArrowGroup);

    // Hover highlight
    const hoverPositions = new Float32Array(HOVER_LINE_SEGMENTS * 2 * 3);
    const hoverGeom = new BufferGeometry();
    hoverGeom.setAttribute("position", new BufferAttribute(hoverPositions, 3));
    hoverGeom.setDrawRange(0, 0);
    const hoverMaterial = new LineDashedMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.4,
      dashSize: 0.15 * kInvPixelScale,
      gapSize: 0.1 * kInvPixelScale,
      linewidth: 2
    });
    const hoverLines = new LineSegments(hoverGeom, hoverMaterial);
    hoverLines.name = "hoverLines";
    hoverLines.renderOrder = 6;
    hoverLines.frustumCulled = false;
    editorOverlay.add(hoverLines);

    // Tile selection highlight group (filled rectangles for selected tiles)
    const tileSelectionGroup = new Object3D();
    tileSelectionGroup.name = "tileSelectionGroup";
    tileSelectionGroup.renderOrder = 4;
    editorOverlay.add(tileSelectionGroup);

    // Tile preview group (ghost tiles shown at cursor in paint mode)
    const previewGroup = new Object3D();
    previewGroup.name = "previewGroup";
    previewGroup.renderOrder = 5;
    editorOverlay.add(previewGroup);

    // Polyline session rubber band (segment from the anchor point to cursor)
    const sessionPositions = new Float32Array(SESSION_LINE_SEGMENTS * 2 * 3);
    const sessionGeom = new BufferGeometry();
    sessionGeom.setAttribute(
      "position",
      new BufferAttribute(sessionPositions, 3)
    );
    sessionGeom.setDrawRange(0, 0);
    const sessionMaterial = new LineBasicMaterial({
      color: 0x88ffcc,
      transparent: true,
      opacity: 0.8,
      linewidth: 2
    });
    const sessionLines = new LineSegments(sessionGeom, sessionMaterial);
    sessionLines.name = "sessionLines";
    sessionLines.renderOrder = 6;
    sessionLines.frustumCulled = false;
    editorOverlay.add(sessionLines);

    this.overlay = {
      rootScene,
      editorOverlay,
      tileGroup,
      imageGroup,
      entityOverlayGroup,
      textLabelGroup,
      imageTextLabels: [],
      gridLines,
      gridMaterial,
      gridPositions,
      originLines,
      originMaterial,
      originPositions,
      selectionGroup,
      refArrowGroup,
      refArrowKey: "",
      hoverLines,
      hoverMaterial,
      hoverPositions,
      tileSelectionGroup,
      tileSelectionKeys: [] as string[],
      previewGroup,
      sessionLines,
      sessionMaterial,
      sessionPositions
    };

    this.level = level;
    this.renderer = renderer;
    this.camera = cam;
  }

  // -------------------------------------------------------------------------
  // Dispose
  // -------------------------------------------------------------------------

  dispose(): void {
    this.disposed = true;
    this.stopRenderLoop();

    for (const [, info] of this.spawned) {
      this.removeEntityAndChildren(info.levelEntityId);
    }
    this.spawned.clear();
    if (this.ghostEntity) {
      this.removeEntityAndChildren(this.ghostEntity.id);
      this.ghostEntity = null;
    }
    this.ghostGeneration++;
    for (const ghost of this.remoteEntityGhosts.values()) {
      if (ghost.entity) this.removeEntityAndChildren(ghost.entity.id);
    }
    this.remoteEntityGhosts.clear();
    this.removeTerrainEntities();
    this.level?.dispose();
    this.renderer?.dispose();
    this.level = undefined;
    this.renderer = undefined;
    this.camera = undefined;
    this.generation++;

    if (this.overlay) {
      for (const cached of this.entityOverlayCache.values()) {
        this.disposeEntityLayerOverlay(cached);
      }
      this.entityOverlayCache.clear();
      disposeGroup(this.overlay.tileGroup);
      disposeGroup(this.overlay.imageGroup);
      disposeGroup(this.overlay.entityOverlayGroup);
      disposeGroup(this.overlay.selectionGroup);
      disposeGroup(this.overlay.refArrowGroup);
      this.disposeTextLabels(this.overlay.imageTextLabels);
      disposeGroup(this.overlay.tileSelectionGroup);
      this.overlay.gridLines.geometry.dispose();
      this.overlay.gridMaterial.dispose();
      this.overlay.originLines.geometry.dispose();
      this.overlay.originMaterial.dispose();
      this.overlay.hoverLines.geometry.dispose();
      this.overlay.hoverMaterial.dispose();
      this.overlay.sessionLines.geometry.dispose();
      this.overlay.sessionMaterial.dispose();
      this.overlay = null;
    }
  }

  setBackgroundColor(color: string): void {
    this.renderer?.setClearColor(new Color(color), 1);
  }

  // -------------------------------------------------------------------------
  // Text label lifecycle
  // -------------------------------------------------------------------------

  private disposeTextLabels(labels: Text[]): void {
    for (const t of labels) {
      // Remove the label (or its wrapper group) from the scene graph
      const parent = t.object3D.parent;
      if (parent) {
        const grandparent = parent.parent;
        if (grandparent) {
          // Parent is a wrapper Object3D group — remove the wrapper from textLabelGroup
          grandparent.remove(parent);
        } else {
          parent.remove(t.object3D);
        }
      }
      // Destroy the Text entity (cleans up behaviors, emits lifecycle events)
      try {
        t.destroy();
      } catch {
        /* ignore */
      }
      // CoreEntity.destroy() does not free troika's GPU resources — without
      // this, every label rebuild leaks.
      t.object3D.traverse((child) => {
        (child as { dispose?: () => void }).dispose?.();
      });
    }
    labels.length = 0;
  }

  // -------------------------------------------------------------------------
  // Live mode
  // -------------------------------------------------------------------------

  setLiveMode(live: boolean): void {
    if (this.liveMode === live) return;
    this.liveMode = live;
    this.lastFrameTime = 0;
    this.bodyAnchors.clear();
    if (!live) {
      this.forceRecreateAllEntities();
    } else {
      // Snapshot current body positions as anchors for drift clamping
      this.captureBodyAnchors();
    }
  }

  /** Record the current translation of every dynamic rigid body as its anchor. */
  private captureBodyAnchors(): void {
    this.bodyAnchors.clear();
    if (!this.level) return;
    this.level.world.forEachRigidBody((rb) => {
      // bodyType 0 = Dynamic
      if (rb.bodyType() === 0) {
        const t = rb.translation();
        this.bodyAnchors.set(rb.handle, { x: t.x, y: t.y });
      }
    });
  }

  private forceRecreateAllEntities(): void {
    if (!this.level) return;
    for (const [, info] of this.spawned) {
      this.removeEntityAndChildren(info.levelEntityId);
    }
    this.spawned.clear();
    this.bodyAnchors.clear();
    this.removeTerrainEntities();
  }

  private removeTerrainEntities(): void {
    if (!this.level) return;
    for (const id of this.terrainEntityIds) {
      this.removeEntityAndChildren(id);
    }
    this.terrainEntityIds = [];
  }

  /** Remove an entity and any children it owns from the level. */
  private removeEntityAndChildren(id: string): void {
    if (!this.level) return;
    const entity = this.level.getEntity(id);
    if (!entity) return;
    if (entity.children) {
      for (const child of [...entity.children]) {
        this.level.removeEntity(child.id);
        try {
          child.destroy?.();
        } catch {
          /* ignore */
        }
      }
    }
    this.level.removeEntity(id);
    try {
      entity.destroy?.();
    } catch {
      /* ignore */
    }
  }

  // -------------------------------------------------------------------------
  // Placement ghost
  // -------------------------------------------------------------------------

  /** Spawn (or replace) the entity rendered under the cursor while the
   *  placement tool is active. Pass null to remove it. */
  setPlacementGhost(
    type: string | null,
    properties?: Record<string, unknown>
  ): void {
    if (this.ghostType === type) return;
    this.ghostType = type;
    this.ghostGeneration++;
    const gen = this.ghostGeneration;
    if (this.ghostEntity) {
      this.removeEntityAndChildren(this.ghostEntity.id);
      this.ghostEntity = null;
    }
    const level = this.level;
    if (!type || !level) return;

    this.ghostHeightPx = this.spawnGhostEntity(
      type,
      "editor-placement-ghost",
      properties,
      (entity) => {
        if (gen !== this.ghostGeneration || !this.level) {
          entity?.destroy?.();
          return;
        }
        if (entity) {
          level.addEntity(entity);
          if (entity.object3D) entity.object3D.visible = false;
          this.ghostEntity = entity;
        }
      }
    );
  }

  /** Construct a ghost-sized entity for preview rendering and hand it to the
   *  caller once spawned (null on failure). Returns the ghost's pixel height
   *  synchronously for anchoring. Shared by the local placement ghost and
   *  remote peers' ghosts so the spawn recipe cannot drift between them. */
  private spawnGhostEntity(
    type: string,
    id: string,
    properties: Record<string, unknown> | undefined,
    onSpawned: (entity: ConstructedGhost | null) => void
  ): number {
    const level = this.level;
    const { width, height } = getEntityPixelSize({
      type,
      tileX: 0,
      tileY: 0,
      id
    });
    if (!level) return height;
    void (async () => {
      try {
        const entity = await level.constructEntityAfterPreload(type, {
          ...properties,
          id,
          position: { x: 0, y: 0, z: 5 },
          size: { width: width / kPixelScale, height: height / kPixelScale }
        });
        onSpawned(entity ?? null);
      } catch (e) {
        console.warn(`[LevelEditor] Failed to spawn ghost "${type}":`, e);
        onSpawned(null);
      }
    })();
    return height;
  }

  /** Anchor a ghost sprite so its feet sit on the target tile row, matching
   *  where the entity will actually be created. */
  private positionGhostEntityAt(
    entity: SpawnedGhostEntity,
    tileX: number,
    tileY: number,
    heightPx: number
  ): void {
    this.ghostPositionVec.set(
      (tileX * TILE_SIZE + TILE_SIZE / 2) / kPixelScale,
      -((tileY + 1) * TILE_SIZE - heightPx / 2) / kPixelScale,
      5
    );
    entity.teleport?.(this.ghostPositionVec);
    if (entity.object3D) entity.object3D.visible = true;
  }

  // -------------------------------------------------------------------------
  // Remote placement ghosts
  // -------------------------------------------------------------------------

  /** Mirror remote peers' entity placement intent as real entities at ghost
   *  opacity. Called at the presence cadence with the full wanted set; ghosts
   *  not in it are removed. */
  syncRemoteEntityGhosts(
    ghosts: { key: string; type: string; tileX: number; tileY: number }[]
  ): void {
    if (!this.level) return;
    const wanted = new Map(ghosts.map((g) => [g.key, g]));

    for (const [key, ghost] of [...this.remoteEntityGhosts]) {
      const next = wanted.get(key);
      if (!next || next.type !== ghost.type) {
        if (ghost.entity) this.removeEntityAndChildren(ghost.entity.id);
        this.remoteEntityGhosts.delete(key);
      }
    }

    for (const [key, g] of wanted) {
      let ghost = this.remoteEntityGhosts.get(key);
      if (!ghost) {
        ghost = {
          type: g.type,
          entity: null,
          heightPx: 0,
          targetX: g.tileX,
          targetY: g.tileY
        };
        this.remoteEntityGhosts.set(key, ghost);
        this.spawnRemoteEntityGhost(key, ghost);
      }
      ghost.targetX = g.tileX;
      ghost.targetY = g.tileY;
      this.positionRemoteEntityGhost(ghost);
    }
  }

  private spawnRemoteEntityGhost(key: string, ghost: RemoteEntityGhost): void {
    ghost.heightPx = this.spawnGhostEntity(
      ghost.type,
      `editor-remote-ghost-${key}`,
      undefined,
      (entity) => {
        // The ghost may have been retyped or removed while spawning.
        if (this.remoteEntityGhosts.get(key) !== ghost || !this.level) {
          entity?.destroy?.();
          return;
        }
        if (entity) {
          this.level.addEntity(entity);
          ghost.entity = entity;
          if (entity.object3D) {
            this.setObjectDim(entity.object3D, REMOTE_GHOST_DIM);
          }
          this.positionRemoteEntityGhost(ghost);
        }
      }
    );
  }

  private positionRemoteEntityGhost(ghost: RemoteEntityGhost): void {
    if (!ghost.entity?.object3D) return;
    this.positionGhostEntityAt(
      ghost.entity,
      ghost.targetX,
      ghost.targetY,
      ghost.heightPx
    );
  }

  // -------------------------------------------------------------------------
  // Sync terrain entities (live mode only)
  // -------------------------------------------------------------------------

  syncTerrainEntities(state: LevelEditorState): void {
    if (!this.level) return;

    // Remove old terrain entities
    this.removeTerrainEntities();

    if (!this.liveMode) return;

    // Build TMJ from current editor state
    const { tiledJson, usedTilesets } = buildTMJFromState(state);

    // Parse tilesets
    const parsedTilesets: Record<string, TilesetTileDefs> = {};
    for (const [name, def] of Object.entries(usedTilesets)) {
      parsedTilesets[name] = parseTileset(def.tileSetJson);
    }

    // Parse map
    const levelMap = parseMap({
      levelJson: tiledJson,
      tileSets: parsedTilesets
    });

    // Create terrain entities from map layers
    for (const layer of levelMap.layers) {
      if (layer.type !== "tiles") continue;
      for (const terrain of layer.terrain) {
        const entity = createEntityForMapTerrain(layer, terrain);
        if (!entity) continue;
        if (entity.object3D) entity.object3D.visible = false;
        this.level.addEntity(entity);
        this.terrainEntityIds.push(entity.id);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Sync entities → Level (sprite previews)
  // -------------------------------------------------------------------------

  syncEntities(layers: EditorLayer[]): void {
    if (!this.level) return;

    this.generation++;
    const gen = this.generation;
    const level = this.level;

    const current = new Map<
      string,
      {
        type: string;
        tileX: number;
        tileY: number;
        w: number;
        h: number;
        angle: number;
        layerZ: number;
        layerId: string;
        properties?: Record<string, unknown>;
        polygon?: { x: number; y: number }[];
        polyline?: { x: number; y: number }[];
        propsJson: string;
      }
    >();
    for (let layerIdx = 0; layerIdx < layers.length; layerIdx++) {
      const layer = layers[layerIdx];
      if (layer.kind !== "entity" || !layer.visible) continue;
      const layerZ = layerIdx * 0.1;
      for (const entity of layer.entities) {
        const { width, height } = getEntityPixelSize(entity);
        // Signature covers properties AND polygon/polyline so vertex edits re-spawn the preview
        const propsJson = JSON.stringify({
          properties: entity.properties ?? null,
          polygon: entity.polygon ?? null,
          polyline: entity.polyline ?? null
        });
        current.set(entity.id, {
          type: entity.type,
          tileX: entity.tileX,
          tileY: entity.tileY,
          w: width,
          h: height,
          angle: entity.angle ?? 0,
          layerZ,
          layerId: layer.id,
          // Constructed entities expect runtime TiledObjectRef numbers, not
          // the editor's placement-id refs.
          properties: toRuntimeEntityRefProperties(
            entity.type,
            entity.properties,
            layers
          ),
          polygon: entity.polygon,
          polyline: entity.polyline,
          propsJson
        });
      }
    }

    // Despawn any preview whose editor definition changed or was deleted.
    // Anything still present is respawned from scratch below so that entities
    // which derive their appearance from position (shapes, zones, parallax
    // backgrounds) recompute correctly rather than being silently teleported.
    for (const [editorId, spawnedPreview] of this.spawned) {
      const desiredDefinition = current.get(editorId);
      const previewMatchesDefinition =
        desiredDefinition &&
        desiredDefinition.type === spawnedPreview.type &&
        desiredDefinition.tileX === spawnedPreview.tileX &&
        desiredDefinition.tileY === spawnedPreview.tileY &&
        desiredDefinition.w === spawnedPreview.w &&
        desiredDefinition.h === spawnedPreview.h &&
        desiredDefinition.angle === spawnedPreview.angle &&
        desiredDefinition.layerZ === spawnedPreview.layerZ &&
        desiredDefinition.propsJson === spawnedPreview.propsJson;
      if (previewMatchesDefinition) continue;
      this.removeEntityAndChildren(spawnedPreview.levelEntityId);
      this.spawned.delete(editorId);
    }

    // Collect entities to spawn
    const toSpawn: Array<{
      editorId: string;
      type: string;
      tileX: number;
      tileY: number;
      w: number;
      h: number;
      angle: number;
      layerZ: number;
      layerId: string;
      properties?: Record<string, unknown>;
      polygon?: { x: number; y: number }[];
      polyline?: { x: number; y: number }[];
      propsJson: string;
    }> = [];
    for (const [editorId, info] of current) {
      if (!this.spawned.has(editorId)) {
        toSpawn.push({ editorId, ...info });
      }
    }
    if (toSpawn.length === 0) return;

    (async () => {
      for (const item of toSpawn) {
        if (this.generation !== gen || !this.level) return;

        // Shape entities (polygon/polyline) anchor at their origin with zero size —
        // matches parseMap/tmjBuilder. Non-shape entities anchor at the tile-cell center.
        const hasShape = !!(item.polygon?.length || item.polyline?.length);
        const worldX = hasShape
          ? (item.tileX * TILE_SIZE) / kPixelScale
          : (item.tileX * TILE_SIZE + TILE_SIZE / 2) / kPixelScale;
        const worldY = hasShape
          ? -(item.tileY * TILE_SIZE) / kPixelScale
          : -((item.tileY + 1) * TILE_SIZE - item.h / 2) / kPixelScale;
        const sizeW = hasShape ? 0 : item.w / kPixelScale;
        const sizeH = hasShape ? 0 : item.h / kPixelScale;

        try {
          const engineAngle = -(item.angle * Math.PI) / 180;
          // Tiled pixel points → game world units (Y-up), matching parseObjectProperties()
          const polygon = item.polygon?.length
            ? item.polygon.map(
                (p) => new Vector2(p.x * kInvPixelScale, -p.y * kInvPixelScale)
              )
            : undefined;
          const polyline = item.polyline?.length
            ? item.polyline.map(
                (p) => new Vector2(p.x * kInvPixelScale, -p.y * kInvPixelScale)
              )
            : undefined;
          const entity = await level.constructEntityAfterPreload(item.type, {
            ...item.properties,
            id: `editor-${item.editorId}`,
            position: { x: worldX, y: worldY, z: item.layerZ },
            size: { width: sizeW, height: sizeH },
            angle: engineAngle,
            ...(polygon ? { polygon } : {}),
            ...(polyline ? { polyline } : {})
          });
          if (this.generation !== gen || !this.level) {
            entity?.destroy?.();
            return;
          }
          if (entity) {
            entity.angle = engineAngle;
            if (entity.object3D && engineAngle !== 0) {
              entity.object3D.rotation.z = engineAngle;
            }
            level.addEntity(entity);
            // Capture anchor for any new dynamic bodies (for live mode drift clamping)
            if (this.liveMode) {
              this.captureBodyAnchors();
            }
            if (entity.object3D) {
              this.setObjectDim(
                entity.object3D,
                layerDimFactor(
                  item.layerId === this.spriteDim.activeLayerId,
                  this.spriteDim.highlight
                )
              );
            }
            this.spawned.set(item.editorId, {
              levelEntityId: entity.id,
              type: item.type,
              tileX: item.tileX,
              tileY: item.tileY,
              w: item.w,
              h: item.h,
              angle: item.angle,
              layerZ: item.layerZ,
              propsJson: item.propsJson
            });
          }
        } catch (e) {
          console.warn(`[LevelEditor] Failed to spawn "${item.type}":`, e);
        }
      }
    })();
  }

  // -------------------------------------------------------------------------
  // Entity sprite dimming (highlight-active-layer mode)
  // -------------------------------------------------------------------------

  /** Latest dim parameters; also applied to sprites that finish spawning
   *  after this call. */
  private spriteDim = { activeLayerId: "", highlight: false };

  /** Best-effort opacity dim on a spawned entity's materials. The original
   *  opacity is stashed in material.userData so toggling off restores it. */
  private setObjectDim(obj: Object3D, dim: number): void {
    obj.traverse((child) => {
      const material = (child as Mesh).material as
        | (MeshBasicMaterial & {
            uniforms?: { opacity?: { value: number } };
            userData: Record<string, unknown>;
          })
        | undefined;
      if (!material || typeof material !== "object") return;
      for (const mat of Array.isArray(material) ? material : [material]) {
        if (mat.uniforms?.opacity) {
          // ShaderMaterial with an opacity uniform (e.g. WireConnector)
          if (mat.userData.editorBaseOpacity === undefined) {
            mat.userData.editorBaseOpacity = mat.uniforms.opacity.value;
          }
          mat.uniforms.opacity.value =
            (mat.userData.editorBaseOpacity as number) * dim;
        } else if (typeof mat.opacity === "number") {
          if (mat.userData.editorBaseOpacity === undefined) {
            mat.userData.editorBaseOpacity = mat.opacity;
          }
          mat.opacity = (mat.userData.editorBaseOpacity as number) * dim;
          if (dim < 1) mat.transparent = true;
        }
      }
    });
  }

  /** Dim entity sprites on non-active layers when highlight mode is on. */
  applySpriteDimming(
    layers: EditorLayer[],
    activeLayerId: string,
    highlight: boolean
  ): void {
    this.spriteDim = { activeLayerId, highlight };
    if (!this.level) return;
    for (const layer of layers) {
      if (layer.kind !== "entity") continue;
      const dim = layerDimFactor(layer.id === activeLayerId, highlight);
      for (const entity of layer.entities) {
        const info = this.spawned.get(entity.id);
        if (!info) continue;
        const spawnedEntity = this.level.getEntity(info.levelEntityId);
        if (spawnedEntity?.object3D) {
          this.setObjectDim(spawnedEntity.object3D, dim);
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // Sync tile layers → Three.js meshes
  // -------------------------------------------------------------------------

  /** Inputs of the last tile/image rebuild — entity-only edits (e.g. polyline
   *  sessions, entity drags) must not re-batch every tile mesh. */
  private lastTileSync: {
    entries: { idx: number; layer: EditorLayer }[];
    activeLayerId: string;
    highlight: boolean;
    texCount: number;
    meta: TilesetMeta;
  } | null = null;

  private lastImageSync: {
    entries: { idx: number; layer: EditorLayer }[];
    activeLayerId: string;
    highlight: boolean;
    texCount: number;
  } | null = null;

  private static layerEntriesOfKind(
    layers: EditorLayer[],
    kinds: EditorLayer["kind"][]
  ): { idx: number; layer: EditorLayer }[] {
    const entries: { idx: number; layer: EditorLayer }[] = [];
    layers.forEach((layer, idx) => {
      if (kinds.includes(layer.kind)) entries.push({ idx, layer });
    });
    return entries;
  }

  private static sameLayerEntries(
    a: { idx: number; layer: EditorLayer }[],
    b: { idx: number; layer: EditorLayer }[]
  ): boolean {
    return (
      a.length === b.length &&
      a.every((e, i) => e.layer === b[i].layer && e.idx === b[i].idx)
    );
  }

  syncTileLayers(
    layers: EditorLayer[],
    activeLayerId: string,
    highlightActive: boolean,
    tilesetTextures: TilesetTextureCache,
    tilesetMeta: TilesetMeta
  ): void {
    const overlay = this.overlay;
    if (!overlay) return;

    // Cache for preview rendering
    this.cachedTilesetTextures = tilesetTextures;
    this.cachedTilesetMeta = tilesetMeta;

    const entries = LevelEditorRenderer.layerEntriesOfKind(layers, ["tile"]);
    const prev = this.lastTileSync;
    if (
      prev &&
      prev.activeLayerId === activeLayerId &&
      prev.highlight === highlightActive &&
      prev.texCount === tilesetTextures.size &&
      prev.meta === tilesetMeta &&
      LevelEditorRenderer.sameLayerEntries(prev.entries, entries)
    ) {
      return;
    }
    this.lastTileSync = {
      entries,
      activeLayerId,
      highlight: highlightActive,
      texCount: tilesetTextures.size,
      meta: tilesetMeta
    };

    disposeGroup(overlay.tileGroup);

    for (let layerIdx = 0; layerIdx < layers.length; layerIdx++) {
      const layer = layers[layerIdx];
      if (layer.kind !== "tile" || !layer.visible) continue;

      const isActive = layer.id === activeLayerId;
      const layerAlpha =
        layer.opacity * layerDimFactor(isActive, highlightActive);
      // Higher array index = top of visual list = foreground = closer to camera
      const layerZ = layerIdx * 0.1;

      // Group tiles by tileset
      const tilesByTileset = new Map<
        string,
        Array<{
          tileX: number;
          tileY: number;
          gid: number;
          flipH?: boolean;
          flipV?: boolean;
          flipD?: boolean;
        }>
      >();
      for (const [key, placement] of layer.tiles) {
        const [tileX, tileY] = key.split(",").map(Number);
        let arr = tilesByTileset.get(placement.tilesetName);
        if (!arr) {
          arr = [];
          tilesByTileset.set(placement.tilesetName, arr);
        }
        arr.push({
          tileX,
          tileY,
          gid: placement.gid,
          flipH: placement.flipH,
          flipV: placement.flipV,
          flipD: placement.flipD
        });
      }

      // Create a batched mesh per tileset
      for (const [tilesetName, tiles] of tilesByTileset) {
        const texInfo = tilesetTextures.get(tilesetName);
        const meta = tilesetMeta.get(tilesetName);
        if (!texInfo || !texInfo.img.complete || !meta) {
          // Fallback: colored rectangles
          const quadCount = tiles.length;
          const posArr = new Float32Array(quadCount * 4 * 3);

          for (let i = 0; i < quadCount; i++) {
            const t = tiles[i];
            const wx0 = t.tileX * TILE_WORLD;
            const wy0 = -(t.tileY + 1) * TILE_WORLD;
            const wx1 = (t.tileX + 1) * TILE_WORLD;
            const wy1 = -t.tileY * TILE_WORLD;

            posArr[i * 12 + 0] = wx0;
            posArr[i * 12 + 1] = wy0;
            posArr[i * 12 + 2] = layerZ;
            posArr[i * 12 + 3] = wx1;
            posArr[i * 12 + 4] = wy0;
            posArr[i * 12 + 5] = layerZ;
            posArr[i * 12 + 6] = wx1;
            posArr[i * 12 + 7] = wy1;
            posArr[i * 12 + 8] = layerZ;
            posArr[i * 12 + 9] = wx0;
            posArr[i * 12 + 10] = wy1;
            posArr[i * 12 + 11] = layerZ;
          }

          const geom = new BufferGeometry();
          geom.setIndex(new BufferAttribute(quadIndexArray(quadCount), 1));
          geom.setAttribute("position", new BufferAttribute(posArr, 3));

          const mat = new MeshBasicMaterial({
            color: isActive ? 0x446688 : 0x334455,
            transparent: true,
            opacity: layerAlpha,
            side: FrontSide
          });

          const mesh = new Mesh(geom, mat);
          const isParallax =
            (layer.parallaxx !== undefined && layer.parallaxx !== 1) ||
            (layer.parallaxy !== undefined && layer.parallaxy !== 1);
          if (isParallax) {
            mesh.userData.parallaxX = 1 - (layer.parallaxx ?? 1);
            mesh.userData.parallaxY = 1 - (layer.parallaxy ?? 1);
          }
          overlay.tileGroup.add(mesh);
          continue;
        }

        const imgW = texInfo.img.naturalWidth;
        const imgH = texInfo.img.naturalHeight;
        const quadCount = tiles.length;

        const posArr = new Float32Array(quadCount * 4 * 3);
        const uvArr = new Float32Array(quadCount * 4 * 2);

        for (let i = 0; i < quadCount; i++) {
          const t = tiles[i];
          const wx0 = t.tileX * TILE_WORLD;
          const wy0 = -(t.tileY + 1) * TILE_WORLD;
          const wx1 = (t.tileX + 1) * TILE_WORLD;
          const wy1 = -t.tileY * TILE_WORLD;

          posArr[i * 12 + 0] = wx0;
          posArr[i * 12 + 1] = wy0;
          posArr[i * 12 + 2] = layerZ;
          posArr[i * 12 + 3] = wx1;
          posArr[i * 12 + 4] = wy0;
          posArr[i * 12 + 5] = layerZ;
          posArr[i * 12 + 6] = wx1;
          posArr[i * 12 + 7] = wy1;
          posArr[i * 12 + 8] = layerZ;
          posArr[i * 12 + 9] = wx0;
          posArr[i * 12 + 10] = wy1;
          posArr[i * 12 + 11] = layerZ;

          const srcCol = t.gid % meta.columns;
          const srcRow = Math.floor(t.gid / meta.columns);
          const srcX = srcCol * meta.tileWidth;
          const srcY = srcRow * meta.tileHeight;

          const u0 = srcX / imgW;
          const u1 = (srcX + meta.tileWidth) / imgW;
          const vTop = srcY / imgH;
          const vBottom = (srcY + meta.tileHeight) / imgH;

          // Vertex order: 0=BL, 1=BR, 2=TR, 3=TL
          // Default UVs (no flip):
          //   BL=(u0,vBottom) BR=(u1,vBottom) TR=(u1,vTop) TL=(u0,vTop)
          // Apply Tiled flip convention: diagonal first, then horizontal, then vertical
          // We track the UV at each vertex as [u,v] and transform them.
          const uvBL: [number, number] = [u0, vBottom];
          const uvBR: [number, number] = [u1, vBottom];
          const uvTR: [number, number] = [u1, vTop];
          const uvTL: [number, number] = [u0, vTop];

          if (t.flipD) {
            // Diagonal flip = transpose: swap x,y in UV space relative to tile center
            // Equivalent to swapping BL↔TR corner UVs after a transpose
            // For UV coords: TL↔BR swap in the diagonal sense
            // The correct transform: swap the u,v components
            // BL(0,1)->BL(1,0), BR(1,1)->BR(1,1), TR(1,0)->TR(0,1), TL(0,0)->TL(0,0)
            // Actually diagonal flip swaps x and y axes, which for UVs means:
            // rotate the UVs 90° by swapping assignments: TL↔BR stay, BL↔TR swap
            const tmp0 = uvBL[0];
            const tmp1 = uvBL[1];
            uvBL[0] = uvTR[0];
            uvBL[1] = uvTR[1];
            uvTR[0] = tmp0;
            uvTR[1] = tmp1;
          }
          if (t.flipH) {
            // Horizontal flip: swap left and right
            let tmp0 = uvBL[0];
            let tmp1 = uvBL[1];
            uvBL[0] = uvBR[0];
            uvBL[1] = uvBR[1];
            uvBR[0] = tmp0;
            uvBR[1] = tmp1;
            tmp0 = uvTL[0];
            tmp1 = uvTL[1];
            uvTL[0] = uvTR[0];
            uvTL[1] = uvTR[1];
            uvTR[0] = tmp0;
            uvTR[1] = tmp1;
          }
          if (t.flipV) {
            // Vertical flip: swap top and bottom
            let tmp0 = uvBL[0];
            let tmp1 = uvBL[1];
            uvBL[0] = uvTL[0];
            uvBL[1] = uvTL[1];
            uvTL[0] = tmp0;
            uvTL[1] = tmp1;
            tmp0 = uvBR[0];
            tmp1 = uvBR[1];
            uvBR[0] = uvTR[0];
            uvBR[1] = uvTR[1];
            uvTR[0] = tmp0;
            uvTR[1] = tmp1;
          }

          uvArr[i * 8 + 0] = uvBL[0];
          uvArr[i * 8 + 1] = uvBL[1];
          uvArr[i * 8 + 2] = uvBR[0];
          uvArr[i * 8 + 3] = uvBR[1];
          uvArr[i * 8 + 4] = uvTR[0];
          uvArr[i * 8 + 5] = uvTR[1];
          uvArr[i * 8 + 6] = uvTL[0];
          uvArr[i * 8 + 7] = uvTL[1];
        }

        const geom = new BufferGeometry();
        geom.setIndex(new BufferAttribute(quadIndexArray(quadCount), 1));
        geom.setAttribute("position", new BufferAttribute(posArr, 3));
        geom.setAttribute("uv", new BufferAttribute(uvArr, 2));

        const mat = new MeshBasicMaterial({
          map: texInfo.texture,
          transparent: true,
          opacity: layerAlpha,
          side: FrontSide,
          alphaTest: 0.01
        });

        const mesh = new Mesh(geom, mat);
        const isParallax =
          (layer.parallaxx !== undefined && layer.parallaxx !== 1) ||
          (layer.parallaxy !== undefined && layer.parallaxy !== 1);
        if (isParallax) {
          mesh.userData.parallaxX = 1 - (layer.parallaxx ?? 1);
          mesh.userData.parallaxY = 1 - (layer.parallaxy ?? 1);
        }
        overlay.tileGroup.add(mesh);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Sync image layers → Three.js textured planes
  // -------------------------------------------------------------------------

  syncImageLayers(
    layers: EditorLayer[],
    activeLayerId: string,
    highlightActive: boolean
  ): void {
    const overlay = this.overlay;
    if (!overlay) return;

    // Unknown layers ride along here: they render the same dashed placeholder
    // treatment as a missing image, so preserved content stays visible.
    const entries = LevelEditorRenderer.layerEntriesOfKind(layers, [
      "image",
      "unknown"
    ]);
    const prev = this.lastImageSync;
    if (
      prev &&
      prev.activeLayerId === activeLayerId &&
      prev.highlight === highlightActive &&
      prev.texCount === this.imageLayerTextureCache.size &&
      LevelEditorRenderer.sameLayerEntries(prev.entries, entries)
    ) {
      return;
    }
    this.lastImageSync = {
      entries,
      activeLayerId,
      highlight: highlightActive,
      texCount: this.imageLayerTextureCache.size
    };

    disposeGroup(overlay.imageGroup);
    this.disposeTextLabels(overlay.imageTextLabels);

    for (let layerIdx = 0; layerIdx < layers.length; layerIdx++) {
      const layer = layers[layerIdx];
      if (!layer.visible) continue;
      if (layer.kind === "unknown") {
        this.addUnknownLayerPlaceholder(
          overlay,
          layer,
          layerIdx,
          layerDimFactor(layer.id === activeLayerId, highlightActive)
        );
        continue;
      }
      if (layer.kind !== "image") continue;

      const isActive = layer.id === activeLayerId;
      const imgAlpha =
        layer.opacity * layerDimFactor(isActive, highlightActive);
      const layerZ = layerIdx * 0.1;

      const imgWorldX = layer.offsetx / kPixelScale;
      const imgWorldY = -layer.offsety / kPixelScale;

      if (layer.imageUrl) {
        let cachedEntry = this.imageLayerTextureCache.get(layer.id);
        if (
          cachedEntry &&
          cachedEntry.img.complete &&
          cachedEntry.img.naturalWidth > 0
        ) {
          const imgWorldW = cachedEntry.img.naturalWidth / kPixelScale;
          const imgWorldH = cachedEntry.img.naturalHeight / kPixelScale;

          const geom = new PlaneGeometry(imgWorldW, imgWorldH);
          const mat = new MeshBasicMaterial({
            map: cachedEntry.texture,
            transparent: true,
            opacity: imgAlpha,
            side: FrontSide
          });
          const mesh = new Mesh(geom, mat);
          mesh.position.set(
            imgWorldX + imgWorldW / 2,
            imgWorldY - imgWorldH / 2,
            layerZ
          );
          // Store base position and parallax for render-loop offset
          mesh.userData.baseX = mesh.position.x;
          mesh.userData.baseY = mesh.position.y;
          mesh.userData.parallaxX = 1 - (layer.parallaxx ?? 1);
          mesh.userData.parallaxY = 1 - (layer.parallaxy ?? 1);
          overlay.imageGroup.add(mesh);
        } else if (!cachedEntry) {
          const img = new Image();
          img.src = layer.imageUrl;
          img.onload = () => {
            const tex = new Texture(img);
            tex.magFilter = NearestFilter;
            tex.minFilter = NearestFilter;
            tex.colorSpace = LinearSRGBColorSpace;
            tex.needsUpdate = true;
            this.imageLayerTextureCache.set(layer.id, { texture: tex, img });
            this.onImageLoad?.();
          };
        }
      } else {
        const placeholderW = 200 / kPixelScale;
        const placeholderH = 100 / kPixelScale;

        const x0 = imgWorldX;
        const y0 = imgWorldY;
        const x1 = imgWorldX + placeholderW;
        const y1 = imgWorldY - placeholderH;

        const positions = new Float32Array([
          x0,
          y0,
          layerZ,
          x1,
          y0,
          layerZ,
          x1,
          y0,
          layerZ,
          x1,
          y1,
          layerZ,
          x1,
          y1,
          layerZ,
          x0,
          y1,
          layerZ,
          x0,
          y1,
          layerZ,
          x0,
          y0,
          layerZ
        ]);

        const geom = new BufferGeometry();
        geom.setAttribute("position", new BufferAttribute(positions, 3));
        const mat = new LineDashedMaterial({
          color: 0x8888cc,
          transparent: true,
          opacity: imgAlpha,
          dashSize: 0.3 * kInvPixelScale,
          gapSize: 0.2 * kInvPixelScale
        });
        const lines = new LineSegments(geom, mat);
        lines.computeLineDistances();
        lines.userData.parallaxX = 1 - (layer.parallaxx ?? 1);
        lines.userData.parallaxY = 1 - (layer.parallaxy ?? 1);
        overlay.imageGroup.add(lines);

        try {
          const labelText = new Text({
            type: "Text",
            text: `[img] ${layer.imageName}`,
            troika: true,
            textFont: "Compass",
            textPixelSize: 8,
            textColor: "#ffffff",
            position: { x: x0 + 0.1, y: y0 - 0.1, z: layerZ + 0.01 }
          });
          labelText.object3D.traverse((child) => {
            child.layers.set(0);
          });
          // Wrap label in a group so parallax can offset it
          const labelGroup = new Object3D();
          labelGroup.add(labelText.object3D);
          labelGroup.userData.parallaxX = 1 - (layer.parallaxx ?? 1);
          labelGroup.userData.parallaxY = 1 - (layer.parallaxy ?? 1);
          labelGroup.userData.isImageLabel = true;
          overlay.textLabelGroup.add(labelGroup);
          overlay.imageTextLabels.push(labelText);
        } catch {
          /* Text font not loaded yet */
        }
      }
    }
  }

  /** Dashed box plus a name label where an unknown layer sits, so preserved
   *  content the editor can't render still has a visible footprint. */
  private addUnknownLayerPlaceholder(
    overlay: OverlayRefs,
    layer: UnknownLayer,
    layerIdx: number,
    alpha: number
  ): void {
    const layerZ = layerIdx * 0.1;
    const rawOffsetX = layer.raw.offsetx;
    const rawOffsetY = layer.raw.offsety;
    const worldX =
      (typeof rawOffsetX === "number" ? rawOffsetX : 0) / kPixelScale;
    const worldY =
      -(typeof rawOffsetY === "number" ? rawOffsetY : 0) / kPixelScale;
    const placeholderW = 200 / kPixelScale;
    const placeholderH = 100 / kPixelScale;

    const x0 = worldX;
    const y0 = worldY;
    const x1 = worldX + placeholderW;
    const y1 = worldY - placeholderH;

    const positions = new Float32Array([
      x0,
      y0,
      layerZ,
      x1,
      y0,
      layerZ,
      x1,
      y0,
      layerZ,
      x1,
      y1,
      layerZ,
      x1,
      y1,
      layerZ,
      x0,
      y1,
      layerZ,
      x0,
      y1,
      layerZ,
      x0,
      y0,
      layerZ
    ]);

    const geom = new BufferGeometry();
    geom.setAttribute("position", new BufferAttribute(positions, 3));
    const mat = new LineDashedMaterial({
      color: 0xcc8844,
      transparent: true,
      opacity: alpha,
      dashSize: 0.3 * kInvPixelScale,
      gapSize: 0.2 * kInvPixelScale
    });
    const lines = new LineSegments(geom, mat);
    lines.computeLineDistances();
    overlay.imageGroup.add(lines);

    try {
      const labelText = new Text({
        type: "Text",
        text: `[?] ${layer.name}`,
        troika: true,
        textFont: "Compass",
        textPixelSize: 8,
        textColor: "#ffcc88",
        position: { x: x0 + 0.1, y: y0 - 0.1, z: layerZ + 0.01 }
      });
      labelText.object3D.traverse((child) => {
        child.layers.set(0);
      });
      // disposeTextLabels expects every label inside a wrapper group.
      const labelGroup = new Object3D();
      labelGroup.add(labelText.object3D);
      overlay.textLabelGroup.add(labelGroup);
      overlay.imageTextLabels.push(labelText);
    } catch {
      /* Text font not loaded yet */
    }
  }

  // -------------------------------------------------------------------------
  // Sync entity overlays → Three.js meshes + labels + selection handles
  // -------------------------------------------------------------------------

  /** Per-layer overlay cache — rebuilding every overlay (and troika label)
   *  on each state change was the editor's main interaction lag. */
  private entityOverlayCache = new Map<
    string,
    {
      layerRef: EditorLayer;
      key: string;
      group: Object3D;
      labelGroup: Object3D;
      labels: Text[];
    }
  >();

  syncEntityOverlays(
    layers: EditorLayer[],
    activeLayerId: string,
    highlightActive: boolean,
    selectedEntityIds: Set<string>,
    zoom: number,
    selectedPolyPoint?: { entityId: string; pointIndex: number } | null,
    closeTargetPoint?: { entityId: string; pointIndex: number } | null,
    hoveredPoint?: { entityId: string; pointIndex: number } | null
  ): void {
    const overlay = this.overlay;
    if (!overlay) return;

    disposeGroup(overlay.selectionGroup);

    const pointKey = (
      layer: EntityLayer,
      p?: { entityId: string; pointIndex: number } | null
    ) =>
      p && layer.entities.some((e) => e.id === p.entityId)
        ? `${p.entityId}:${p.pointIndex}`
        : "";

    const seen = new Set<string>();
    for (let layerIdx = 0; layerIdx < layers.length; layerIdx++) {
      const layer = layers[layerIdx];
      if (layer.kind !== "entity" || !layer.visible) continue;
      seen.add(layer.id);

      const isActive = layer.id === activeLayerId;
      const selectedInLayer = layer.entities
        .filter((e) => selectedEntityIds.has(e.id))
        .map((e) => e.id);
      const key = [
        layerIdx,
        isActive,
        highlightActive,
        zoom,
        selectedInLayer.join(","),
        pointKey(layer, selectedPolyPoint),
        pointKey(layer, closeTargetPoint),
        pointKey(layer, hoveredPoint)
      ].join("|");

      let cached = this.entityOverlayCache.get(layer.id);
      if (!cached || cached.layerRef !== layer || cached.key !== key) {
        if (cached) this.disposeEntityLayerOverlay(cached);
        const built = this.buildEntityLayerOverlay(
          layer,
          layerIdx,
          isActive,
          highlightActive,
          zoom,
          selectedEntityIds,
          selectedPolyPoint ?? null,
          closeTargetPoint ?? null,
          hoveredPoint ?? null
        );
        overlay.entityOverlayGroup.add(built.group);
        overlay.textLabelGroup.add(built.labelGroup);
        cached = { layerRef: layer, key, ...built };
        this.entityOverlayCache.set(layer.id, cached);
      }

      this.buildEntitySelectionHandles(
        layer,
        layerIdx,
        selectedEntityIds,
        zoom
      );
    }

    for (const [layerId, cached] of this.entityOverlayCache) {
      if (!seen.has(layerId)) {
        this.disposeEntityLayerOverlay(cached);
        this.entityOverlayCache.delete(layerId);
      }
    }
  }

  private disposeEntityLayerOverlay(cached: {
    group: Object3D;
    labelGroup: Object3D;
    labels: Text[];
  }): void {
    disposeGroup(cached.group);
    cached.group.parent?.remove(cached.group);
    this.disposeTextLabels(cached.labels);
    cached.labelGroup.parent?.remove(cached.labelGroup);
  }

  private buildEntityLayerOverlay(
    layer: EntityLayer,
    layerIdx: number,
    isActive: boolean,
    highlightActive: boolean,
    zoom: number,
    selectedEntityIds: Set<string>,
    selectedPolyPoint: { entityId: string; pointIndex: number } | null,
    closeTargetPoint: { entityId: string; pointIndex: number } | null,
    hoveredPoint: { entityId: string; pointIndex: number } | null
  ): { group: Object3D; labelGroup: Object3D; labels: Text[] } {
    const group = new Object3D();
    const labelLayerGroup = new Object3D();
    const labels: Text[] = [];
    const entityLayerAlpha = layerDimFactor(isActive, highlightActive);
    const layerZ = layerIdx * 0.1;

    for (const entity of layer.entities) {
      const { width: pixW, height: pixH } = getEntityPixelSize(entity);
      const worldW = pixW / kPixelScale;
      const worldH = pixH / kPixelScale;
      const isSelected = selectedEntityIds.has(entity.id);
      const angleDeg = entity.angle ?? 0;
      const angleRad = -(angleDeg * Math.PI) / 180;

      const cx = (entity.tileX * TILE_SIZE + TILE_SIZE / 2) / kPixelScale;
      const cy = -((entity.tileY + 1) * TILE_SIZE - pixH / 2) / kPixelScale;

      const color = new Color(getEntityColor(entity.type));
      const hasShape = !!(entity.polyline || entity.polygon);

      // Wrap entity overlay in a group so rotation applies to bg + border together
      const entityGroup = new Object3D();
      entityGroup.position.set(cx, cy, 0);
      // Shape entities pivot about their origin (handled in the shape block
      // below), not the tile-cell center, so don't rotate the group for them.
      if (angleRad !== 0 && !hasShape) {
        entityGroup.rotation.z = angleRad;
      }

      const bgZ = layerZ - 0.02;
      const borderZ = bgZ + 0.01;

      if (!hasShape) {
        // Background fill — render behind the entity sprite to avoid z-fighting
        const bgGeom = new PlaneGeometry(worldW, worldH);
        const bgMat = new MeshBasicMaterial({
          color,
          transparent: true,
          opacity: (isSelected ? 0.3 : 0.12) * entityLayerAlpha,
          depthWrite: false,
          side: FrontSide
        });
        const bgMesh = new Mesh(bgGeom, bgMat);
        bgMesh.position.set(0, 0, bgZ);
        entityGroup.add(bgMesh);

        const hw = worldW / 2;
        const hh = worldH / 2;
        const borderPositions = new Float32Array([
          -hw,
          -hh,
          borderZ,
          hw,
          -hh,
          borderZ,
          hw,
          -hh,
          borderZ,
          hw,
          hh,
          borderZ,
          hw,
          hh,
          borderZ,
          -hw,
          hh,
          borderZ,
          -hw,
          hh,
          borderZ,
          -hw,
          -hh,
          borderZ
        ]);
        const borderGeom = new BufferGeometry();
        borderGeom.setAttribute(
          "position",
          new BufferAttribute(borderPositions, 3)
        );
        const borderMat = new LineBasicMaterial({
          color: isSelected ? 0xffffff : color,
          transparent: true,
          opacity: entityLayerAlpha,
          linewidth: isSelected ? 3 : 1.5
        });
        entityGroup.add(new LineSegments(borderGeom, borderMat));

        // Rotation indicator line when rotated
        if (angleDeg !== 0) {
          const indicatorGeom = new BufferGeometry();
          indicatorGeom.setAttribute(
            "position",
            new BufferAttribute(
              new Float32Array([0, 0, borderZ, 0, hh, borderZ]),
              3
            )
          );
          const indicatorMat = new LineBasicMaterial({
            color: 0xffff00,
            transparent: true,
            opacity: 0.6
          });
          entityGroup.add(new LineSegments(indicatorGeom, indicatorMat));
        }
      }

      // Polyline / polygon rendering
      const shapePoints = entity.polyline || entity.polygon;
      if (shapePoints && shapePoints.length >= 2) {
        const isClosed = !!entity.polygon;
        const segCount = isClosed ? shapePoints.length : shapePoints.length - 1;
        const linePositions = new Float32Array(segCount * 2 * 3);
        // Shape entities pivot about their origin (tileX,tileY in pixels), NOT
        // the tile-cell center — matches parseMap/tmjBuilder.
        const originWorldX = (entity.tileX * TILE_SIZE) / kPixelScale;
        const originWorldY = -(entity.tileY * TILE_SIZE) / kPixelScale;
        const shapeGroup = new Object3D();
        shapeGroup.position.set(originWorldX - cx, originWorldY - cy, 0);
        if (angleRad !== 0) shapeGroup.rotation.z = angleRad;
        entityGroup.add(shapeGroup);

        for (let i = 0; i < segCount; i++) {
          const p0 = shapePoints[i];
          const p1 = shapePoints[(i + 1) % shapePoints.length];
          const base = i * 6;
          linePositions[base] = p0.x / kPixelScale;
          linePositions[base + 1] = -p0.y / kPixelScale;
          linePositions[base + 2] = borderZ + 0.01;
          linePositions[base + 3] = p1.x / kPixelScale;
          linePositions[base + 4] = -p1.y / kPixelScale;
          linePositions[base + 5] = borderZ + 0.01;
        }

        const lineGeom = new BufferGeometry();
        lineGeom.setAttribute(
          "position",
          new BufferAttribute(linePositions, 3)
        );
        const lineMat = new LineBasicMaterial({
          color: isSelected ? 0x88ffcc : 0x00ff88,
          transparent: true,
          opacity: entityLayerAlpha,
          linewidth: isSelected ? 3 : 2
        });
        shapeGroup.add(new LineSegments(lineGeom, lineMat));

        // Vertex dots: light circles over a dark halo so they read clearly
        // against the segment color. Interactive points (finish / close)
        // grow while hovered.
        const isPolySelected =
          isSelected && selectedPolyPoint?.entityId === entity.id;
        for (let pi = 0; pi < shapePoints.length; pi++) {
          const pt = shapePoints[pi];
          const isPointSelected =
            isPolySelected && selectedPolyPoint!.pointIndex === pi;
          const isCloseTarget =
            closeTargetPoint?.entityId === entity.id &&
            closeTargetPoint.pointIndex === pi;
          const isHovered =
            hoveredPoint?.entityId === entity.id &&
            hoveredPoint.pointIndex === pi;
          // Size/color hierarchy: plain points < last-placed cursor point <
          // close-target endpoint. Interactive points grow while hovered.
          let radius = isCloseTarget
            ? 0.13
            : isPointSelected
              ? 0.1
              : isSelected
                ? 0.07
                : 0.055;
          if (isHovered) radius *= 1.45;
          const fillColor = isCloseTarget
            ? 0xffd24d
            : isPointSelected
              ? 0xffffff
              : isSelected
                ? 0xd9fff0
                : 0xaee8cf;
          const dotX = pt.x / kPixelScale;
          const dotY = -pt.y / kPixelScale;

          const halo = new Mesh(
            new CircleGeometry(radius * 1.5, 16),
            new MeshBasicMaterial({
              color: isPointSelected ? 0x4a7a63 : 0x07211a,
              transparent: true,
              opacity: 0.85 * entityLayerAlpha,
              depthWrite: false
            })
          );
          halo.position.set(dotX, dotY, borderZ + 0.019);
          shapeGroup.add(halo);

          const dot = new Mesh(
            new CircleGeometry(radius, 16),
            new MeshBasicMaterial({
              color: fillColor,
              transparent: true,
              opacity: entityLayerAlpha,
              depthWrite: false
            })
          );
          dot.position.set(dotX, dotY, borderZ + 0.02);
          shapeGroup.add(dot);
        }
      }

      group.add(entityGroup);

      // Labels stay upright and declutter away from dimmed layers.
      if (zoom >= 1 && (isActive || !highlightActive)) {
        try {
          const hw = worldW / 2;
          const hh = worldH / 2;
          const sinA = Math.sin(angleRad);
          const cosA = Math.cos(angleRad);
          const aabbHalfH = Math.max(
            -hw * sinA + hh * cosA,
            hw * sinA + hh * cosA,
            -hw * sinA - hh * cosA,
            hw * sinA - hh * cosA
          );

          const labelText = new Text({
            type: "Text",
            text: entity.type,
            troika: true,
            textFont: "Compass",
            textPixelSize: 8,
            textColor: "#ffffff",
            outline: true,
            position: { x: 0, y: aabbHalfH + 0.05, z: layerZ + 0.02 }
          });
          // Move text to the default render layer so the editor camera can
          // see it without the game's multi-pass renderer.
          labelText.object3D.traverse((child) => {
            child.layers.set(0);
          });
          const labelGroup = new Object3D();
          labelGroup.position.set(cx, cy, 0);
          labelGroup.add(labelText.object3D);
          labelLayerGroup.add(labelGroup);
          labels.push(labelText);

          const entityName = entity.properties?.name;
          if (entityName && typeof entityName === "string") {
            const nameText = new Text({
              type: "Text",
              text: entityName,
              troika: true,
              textFont: "Compass",
              textPixelSize: 6,
              textColor: "#aaddff",
              outline: true,
              position: { x: 0, y: aabbHalfH - 0.17, z: layerZ + 0.02 }
            });
            nameText.object3D.traverse((child) => {
              child.layers.set(0);
            });
            labelGroup.add(nameText.object3D);
            labels.push(nameText);
          }
        } catch {
          /* Text font not loaded yet */
        }
      }
    }

    return { group, labelGroup: labelLayerGroup, labels };
  }

  private buildEntitySelectionHandles(
    layer: EntityLayer,
    layerIdx: number,
    selectedEntityIds: Set<string>,
    zoom: number
  ): void {
    const overlay = this.overlay;
    if (!overlay) return;
    const layerZ = layerIdx * 0.1;

    for (const entity of layer.entities) {
      if (!selectedEntityIds.has(entity.id)) continue;
      if (entity.polyline || entity.polygon) continue;

      const { width: pixW, height: pixH } = getEntityPixelSize(entity);
      const worldW = pixW / kPixelScale;
      const worldH = pixH / kPixelScale;
      const angleRad = -((entity.angle ?? 0) * Math.PI) / 180;
      const cx = (entity.tileX * TILE_SIZE + TILE_SIZE / 2) / kPixelScale;
      const cy = -((entity.tileY + 1) * TILE_SIZE - pixH / 2) / kPixelScale;
      const handleWorldSize = HANDLE_SIZE / (kPixelScale * zoom);

      const selGroup = new Object3D();
      selGroup.position.set(cx, cy, 0);
      if (angleRad !== 0) {
        selGroup.rotation.z = angleRad;
      }

      const lhw = worldW / 2;
      const lhh = worldH / 2;

      const corners = [
        { hx: -lhw, hy: -lhh },
        { hx: lhw, hy: -lhh },
        { hx: -lhw, hy: lhh },
        { hx: lhw, hy: lhh }
      ];
      for (const { hx, hy } of corners) {
        const handleMesh = new Mesh(
          new PlaneGeometry(handleWorldSize, handleWorldSize),
          new MeshBasicMaterial({ color: 0xffffff, side: FrontSide })
        );
        handleMesh.position.set(hx, hy, layerZ + 0.03);
        selGroup.add(handleMesh);

        const hhs = handleWorldSize / 2;
        const handleBorderPositions = new Float32Array([
          hx - hhs,
          hy - hhs,
          layerZ + 0.031,
          hx + hhs,
          hy - hhs,
          layerZ + 0.031,
          hx + hhs,
          hy - hhs,
          layerZ + 0.031,
          hx + hhs,
          hy + hhs,
          layerZ + 0.031,
          hx + hhs,
          hy + hhs,
          layerZ + 0.031,
          hx - hhs,
          hy + hhs,
          layerZ + 0.031,
          hx - hhs,
          hy + hhs,
          layerZ + 0.031,
          hx - hhs,
          hy - hhs,
          layerZ + 0.031
        ]);
        const handleBorderGeom = new BufferGeometry();
        handleBorderGeom.setAttribute(
          "position",
          new BufferAttribute(handleBorderPositions, 3)
        );
        selGroup.add(
          new LineSegments(
            handleBorderGeom,
            new LineBasicMaterial({ color: 0x000000 })
          )
        );
      }

      // Rotation handle above the top edge
      const rotHandleLocalY = lhh + handleWorldSize * 2;
      const rotHandleMesh = new Mesh(
        new PlaneGeometry(handleWorldSize, handleWorldSize),
        new MeshBasicMaterial({ color: 0xffff00, side: FrontSide })
      );
      rotHandleMesh.position.set(0, rotHandleLocalY, layerZ + 0.03);
      selGroup.add(rotHandleMesh);

      const rotLineGeom = new BufferGeometry();
      rotLineGeom.setAttribute(
        "position",
        new BufferAttribute(
          new Float32Array([
            0,
            lhh,
            layerZ + 0.031,
            0,
            rotHandleLocalY,
            layerZ + 0.031
          ]),
          3
        )
      );
      selGroup.add(
        new LineSegments(
          rotLineGeom,
          new LineBasicMaterial({
            color: 0xffff00,
            transparent: true,
            opacity: 0.6
          })
        )
      );

      overlay.selectionGroup.add(selGroup);
    }
  }

  // -------------------------------------------------------------------------
  // Reference arrows (entityRef props → their targets)
  // -------------------------------------------------------------------------

  /** Center of an entity's footprint in world space. Shape entities pivot on
   *  their origin rather than a tile cell, matching the overlay builder. */
  private entityAnchorWorld(entity: EntityPlacement): { x: number; y: number } {
    if (entity.polyline || entity.polygon) {
      return {
        x: (entity.tileX * TILE_SIZE) / kPixelScale,
        y: -(entity.tileY * TILE_SIZE) / kPixelScale
      };
    }
    const { height: pixH } = getEntityPixelSize(entity);
    return {
      x: (entity.tileX * TILE_SIZE + TILE_SIZE / 2) / kPixelScale,
      y: -((entity.tileY + 1) * TILE_SIZE - pixH / 2) / kPixelScale
    };
  }

  syncRefArrows(
    links: RefArrowLink[],
    highlightEntity: EntityPlacement | null
  ): void {
    const overlay = this.overlay;
    if (!overlay) return;

    const key = [
      ...links.map((link) => {
        const from = this.entityAnchorWorld(link.from);
        const to = this.entityAnchorWorld(link.to);
        return `${from.x},${from.y}>${to.x},${to.y}:${link.dimmed ? "d" : ""}`;
      }),
      highlightEntity
        ? `h${highlightEntity.id}:${highlightEntity.tileX},${highlightEntity.tileY}`
        : ""
    ].join("|");
    if (key === overlay.refArrowKey) return;
    overlay.refArrowKey = key;
    disposeGroup(overlay.refArrowGroup);

    for (const link of links) {
      const from = this.entityAnchorWorld(link.from);
      const to = this.entityAnchorWorld(link.to);
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const length = Math.hypot(dx, dy);
      if (length < 1e-4) continue;
      const dirX = dx / length;
      const dirY = dy / length;
      const opacity = link.dimmed ? 0.35 : 0.9;

      const shaftGeom = new BufferGeometry();
      shaftGeom.setAttribute(
        "position",
        new BufferAttribute(
          new Float32Array([
            from.x,
            from.y,
            REF_ARROW_Z,
            to.x,
            to.y,
            REF_ARROW_Z
          ]),
          3
        )
      );
      const shaft = new LineSegments(
        shaftGeom,
        new LineDashedMaterial({
          color: REF_ARROW_COLOR,
          transparent: true,
          opacity,
          dashSize: 0.12,
          gapSize: 0.08
        })
      );
      // Dashes only appear once the per-vertex distances exist.
      shaft.computeLineDistances();
      shaft.frustumCulled = false;
      overlay.refArrowGroup.add(shaft);

      const baseX = to.x - dirX * REF_ARROW_HEAD_LENGTH;
      const baseY = to.y - dirY * REF_ARROW_HEAD_LENGTH;
      const halfX = -dirY * REF_ARROW_HEAD_HALF_WIDTH;
      const halfY = dirX * REF_ARROW_HEAD_HALF_WIDTH;
      const headGeom = new BufferGeometry();
      headGeom.setAttribute(
        "position",
        new BufferAttribute(
          new Float32Array([
            to.x,
            to.y,
            REF_ARROW_Z,
            baseX + halfX,
            baseY + halfY,
            REF_ARROW_Z,
            to.x,
            to.y,
            REF_ARROW_Z,
            baseX - halfX,
            baseY - halfY,
            REF_ARROW_Z
          ]),
          3
        )
      );
      const head = new LineSegments(
        headGeom,
        new LineBasicMaterial({
          color: REF_ARROW_COLOR,
          transparent: true,
          opacity,
          linewidth: 2
        })
      );
      head.frustumCulled = false;
      overlay.refArrowGroup.add(head);
    }

    if (highlightEntity) {
      const { width: pixW, height: pixH } = getEntityPixelSize(highlightEntity);
      const halfW = pixW / kPixelScale / 2;
      const halfH = pixH / kPixelScale / 2;
      const anchor = this.entityAnchorWorld(highlightEntity);
      const outlineGroup = new Object3D();
      outlineGroup.position.set(anchor.x, anchor.y, 0);
      const angleRad = -((highlightEntity.angle ?? 0) * Math.PI) / 180;
      if (angleRad !== 0) outlineGroup.rotation.z = angleRad;
      const outlineGeom = new BufferGeometry();
      outlineGeom.setAttribute(
        "position",
        new BufferAttribute(
          new Float32Array([
            -halfW,
            -halfH,
            REF_ARROW_Z,
            halfW,
            -halfH,
            REF_ARROW_Z,
            halfW,
            -halfH,
            REF_ARROW_Z,
            halfW,
            halfH,
            REF_ARROW_Z,
            halfW,
            halfH,
            REF_ARROW_Z,
            -halfW,
            halfH,
            REF_ARROW_Z,
            -halfW,
            halfH,
            REF_ARROW_Z,
            -halfW,
            -halfH,
            REF_ARROW_Z
          ]),
          3
        )
      );
      const outline = new LineSegments(
        outlineGeom,
        new LineBasicMaterial({
          color: REF_ARROW_HIGHLIGHT_COLOR,
          transparent: true,
          opacity: 0.9,
          linewidth: 2
        })
      );
      outline.frustumCulled = false;
      outlineGroup.add(outline);
      overlay.refArrowGroup.add(outlineGroup);
    }
  }

  // -------------------------------------------------------------------------
  // Render loop
  // -------------------------------------------------------------------------

  startRenderLoop(getState: () => RenderLoopState): void {
    this.stopRenderLoop();

    const animate = () => {
      this.animId = requestAnimationFrame(animate);
      this.renderFrame(getState());
    };
    this.animId = requestAnimationFrame(animate);
  }

  stopRenderLoop(): void {
    if (this.animId) {
      cancelAnimationFrame(this.animId);
      this.animId = 0;
    }
  }

  private renderFrame(loopState: RenderLoopState): void {
    if (!this.level || !this.renderer || !this.camera || !this.overlay) return;

    const { width, height } = loopState.canvasSize;
    if (width === 0 || height === 0) return;

    // Update entity animations
    const now = performance.now();
    const deltaMs =
      this.liveMode && this.lastFrameTime > 0
        ? Math.min(now - this.lastFrameTime, 50)
        : 0;
    this.lastFrameTime = now;

    // Step the physics world in live mode so collision queries work
    if (this.liveMode && deltaMs > 0) {
      this.level.world.step();
    }

    for (const entity of this.level.getEntities().values()) {
      try {
        if (this.liveMode && deltaMs > 0) {
          entity.step?.(deltaMs);
        }
        entity.postStep?.(deltaMs);
      } catch {
        /* ignore */
      }
    }

    // Clamp dynamic bodies that drift too far from their anchor positions
    if (this.liveMode) {
      const MAX_DRIFT = 0.5;
      this.level.world.forEachRigidBody((rb) => {
        if (rb.bodyType() !== 0) return; // only Dynamic bodies
        const anchor = this.bodyAnchors.get(rb.handle);
        if (!anchor) return;
        const t = rb.translation();
        const dx = t.x - anchor.x;
        const dy = t.y - anchor.y;
        if (Math.abs(dx) > MAX_DRIFT || Math.abs(dy) > MAX_DRIFT) {
          rb.setTranslation({ x: anchor.x, y: anchor.y }, true);
          rb.setLinvel({ x: 0, y: 0 }, true);
          rb.setAngvel(0, true);
        }
      });
    }

    const cam = loopState.camera;
    const st = loopState.state;
    const zoom = cam.zoom;
    const tilePixels = TILE_SIZE * zoom;
    const offsetX = width / 2 - cam.x * tilePixels;
    const offsetY = height / 2 - cam.y * tilePixels;

    // Scene transform
    const scaleVal = kPixelScale * zoom;
    this.level.scene.scale.set(scaleVal, scaleVal, 1);
    this.level.scene.position.set(offsetX, height - offsetY, 0);

    // Apply parallax offset to image layer meshes based on camera position
    const camWorldX = cam.x * TILE_WORLD;
    const camWorldY = -cam.y * TILE_WORLD;
    for (const child of this.overlay.imageGroup.children) {
      const { parallaxX, parallaxY, baseX, baseY } = child.userData;
      if (parallaxX !== undefined && parallaxY !== undefined) {
        child.position.x = (baseX ?? 0) + parallaxX * camWorldX;
        child.position.y = (baseY ?? 0) + parallaxY * camWorldY;
      }
    }
    // Apply parallax offset to tile layer meshes based on camera position
    for (const child of this.overlay.tileGroup.children) {
      const { parallaxX, parallaxY } = child.userData;
      if (parallaxX !== undefined && parallaxY !== undefined) {
        child.position.x = parallaxX * camWorldX;
        child.position.y = parallaxY * camWorldY;
      }
    }

    // Also offset parallax label groups in the text label group
    for (const child of this.overlay.textLabelGroup.children) {
      if (child.userData.isImageLabel) {
        const { parallaxX, parallaxY } = child.userData;
        if (parallaxX !== undefined && parallaxY !== undefined) {
          child.position.x = parallaxX * camWorldX;
          child.position.y = parallaxY * camWorldY;
        }
      }
    }

    // Grid
    const gridVisible = st.gridVisible && zoom >= 1;
    this.overlay.gridLines.visible = gridVisible;
    this.overlay.originLines.visible = gridVisible;

    if (gridVisible) {
      const gridZ = 3;
      const startTileX = Math.floor(-offsetX / tilePixels) - 1;
      const startTileY = Math.floor(-offsetY / tilePixels) - 1;
      const endTileX = Math.ceil((width - offsetX) / tilePixels) + 1;
      const endTileY = Math.ceil((height - offsetY) / tilePixels) + 1;

      const positions = this.overlay.gridPositions;
      let lineIdx = 0;
      const maxLineIdx = MAX_GRID_LINES;

      for (let tx = startTileX; tx <= endTileX && lineIdx < maxLineIdx; tx++) {
        const wx = tx * TILE_WORLD;
        const base = lineIdx * 6;
        positions[base + 0] = wx;
        positions[base + 1] = -endTileY * TILE_WORLD;
        positions[base + 2] = gridZ;
        positions[base + 3] = wx;
        positions[base + 4] = -startTileY * TILE_WORLD;
        positions[base + 5] = gridZ;
        lineIdx++;
      }
      for (let ty = startTileY; ty <= endTileY && lineIdx < maxLineIdx; ty++) {
        const wy = -ty * TILE_WORLD;
        const base = lineIdx * 6;
        positions[base + 0] = startTileX * TILE_WORLD;
        positions[base + 1] = wy;
        positions[base + 2] = gridZ;
        positions[base + 3] = endTileX * TILE_WORLD;
        positions[base + 4] = wy;
        positions[base + 5] = gridZ;
        lineIdx++;
      }

      this.overlay.gridLines.geometry.setDrawRange(0, lineIdx * 2);
      (
        this.overlay.gridLines.geometry.getAttribute(
          "position"
        ) as BufferAttribute
      ).needsUpdate = true;
      this.overlay.gridMaterial.opacity = Math.min(0.15, zoom * 0.03);

      const originZ = gridZ + 0.01;
      const oPos = this.overlay.originPositions;
      oPos[0] = 0;
      oPos[1] = -endTileY * TILE_WORLD;
      oPos[2] = originZ;
      oPos[3] = 0;
      oPos[4] = -startTileY * TILE_WORLD;
      oPos[5] = originZ;
      oPos[6] = startTileX * TILE_WORLD;
      oPos[7] = 0;
      oPos[8] = originZ;
      oPos[9] = endTileX * TILE_WORLD;
      oPos[10] = 0;
      oPos[11] = originZ;
      this.overlay.originLines.geometry.setDrawRange(0, 4);
      (
        this.overlay.originLines.geometry.getAttribute(
          "position"
        ) as BufferAttribute
      ).needsUpdate = true;
    }

    // Tile selection highlight
    const selectedTileKeys = st.selectedTileKeys || [];
    const selKeysStr = selectedTileKeys.join("|");
    if (selKeysStr !== this.overlay.tileSelectionKeys.join("|")) {
      this.overlay.tileSelectionKeys = [...selectedTileKeys];
      disposeGroup(this.overlay.tileSelectionGroup);
      const selZ = 4.5;
      for (const key of selectedTileKeys) {
        const [tx, ty] = key.split(",").map(Number);
        const x0 = tx * TILE_WORLD;
        const y0 = -(ty + 1) * TILE_WORLD;
        const x1 = (tx + 1) * TILE_WORLD;
        const y1 = -ty * TILE_WORLD;
        // Fill
        const fillGeom = new PlaneGeometry(TILE_WORLD, TILE_WORLD);
        const fillMat = new MeshBasicMaterial({
          color: 0x4fc3f7,
          transparent: true,
          opacity: 0.25,
          depthWrite: false,
          side: FrontSide
        });
        const fillMesh = new Mesh(fillGeom, fillMat);
        fillMesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, selZ);
        this.overlay.tileSelectionGroup.add(fillMesh);
        // Border
        const borderPositions = new Float32Array([
          x0,
          y0,
          selZ + 0.01,
          x1,
          y0,
          selZ + 0.01,
          x1,
          y0,
          selZ + 0.01,
          x1,
          y1,
          selZ + 0.01,
          x1,
          y1,
          selZ + 0.01,
          x0,
          y1,
          selZ + 0.01,
          x0,
          y1,
          selZ + 0.01,
          x0,
          y0,
          selZ + 0.01
        ]);
        const borderGeom = new BufferGeometry();
        borderGeom.setAttribute(
          "position",
          new BufferAttribute(borderPositions, 3)
        );
        const borderMat = new LineBasicMaterial({
          color: 0x4fc3f7,
          transparent: true,
          opacity: 0.7
        });
        const borderLines = new LineSegments(borderGeom, borderMat);
        this.overlay.tileSelectionGroup.add(borderLines);
      }
    }

    // Apply drag offset to tile selection group
    const dragOff = loopState.tileDragOffset;
    if (dragOff && (dragOff.dx !== 0 || dragOff.dy !== 0)) {
      this.overlay.tileSelectionGroup.position.set(
        dragOff.dx * TILE_WORLD,
        -dragOff.dy * TILE_WORLD,
        0
      );
    } else {
      this.overlay.tileSelectionGroup.position.set(0, 0, 0);
    }

    // Compute parallax offset for hover/preview alignment
    const activeLayer = st.layers.find(
      (l: EditorLayer) => l.id === st.activeLayerId
    );
    let hoverOffX = 0;
    let hoverOffY = 0;
    if (
      activeLayer &&
      (activeLayer.kind === "tile" || activeLayer.kind === "image")
    ) {
      const px = (activeLayer as { parallaxx?: number }).parallaxx;
      const py = (activeLayer as { parallaxy?: number }).parallaxy;
      if (px !== undefined && px !== 1) hoverOffX = (1 - px) * camWorldX;
      if (py !== undefined && py !== 1) hoverOffY = (1 - py) * camWorldY;
    }

    // Hover highlight
    const mt = loopState.mouseTile;
    if (mt) {
      const hoverZ = 5;
      const hx0 = mt.x * TILE_WORLD + hoverOffX;
      const hy0 = -(mt.y + 1) * TILE_WORLD + hoverOffY;
      const hx1 = (mt.x + 1) * TILE_WORLD + hoverOffX;
      const hy1 = -mt.y * TILE_WORLD + hoverOffY;
      const hp = this.overlay.hoverPositions;
      hp[0] = hx0;
      hp[1] = hy0;
      hp[2] = hoverZ;
      hp[3] = hx1;
      hp[4] = hy0;
      hp[5] = hoverZ;
      hp[6] = hx1;
      hp[7] = hy0;
      hp[8] = hoverZ;
      hp[9] = hx1;
      hp[10] = hy1;
      hp[11] = hoverZ;
      hp[12] = hx1;
      hp[13] = hy1;
      hp[14] = hoverZ;
      hp[15] = hx0;
      hp[16] = hy1;
      hp[17] = hoverZ;
      hp[18] = hx0;
      hp[19] = hy1;
      hp[20] = hoverZ;
      hp[21] = hx0;
      hp[22] = hy0;
      hp[23] = hoverZ;
      this.overlay.hoverLines.geometry.setDrawRange(0, 8);
      (
        this.overlay.hoverLines.geometry.getAttribute(
          "position"
        ) as BufferAttribute
      ).needsUpdate = true;
      this.overlay.hoverLines.visible = true;
      this.overlay.hoverLines.computeLineDistances();
    } else {
      this.overlay.hoverLines.visible = false;
    }

    // Placement ghost follows the cursor (hidden in live mode and while the
    // pointer is off the canvas or another gesture is active).
    const ghost = this.ghostEntity;
    if (ghost?.object3D) {
      const gp = loopState.ghostPosition;
      if (gp && !this.liveMode) {
        this.positionGhostEntityAt(
          ghost,
          gp.tileX,
          gp.tileY,
          this.ghostHeightPx
        );
      } else {
        ghost.object3D.visible = false;
      }
    }

    // Polyline session rubber band
    const polyPreview = loopState.polylinePreview;
    if (polyPreview && polyPreview.length >= 2) {
      const sp = this.overlay.sessionPositions;
      let seg = 0;
      for (
        let i = 0;
        i + 1 < polyPreview.length && seg < SESSION_LINE_SEGMENTS;
        i++, seg++
      ) {
        const base = seg * 6;
        sp[base] = polyPreview[i].x / kPixelScale;
        sp[base + 1] = -polyPreview[i].y / kPixelScale;
        sp[base + 2] = 5.6;
        sp[base + 3] = polyPreview[i + 1].x / kPixelScale;
        sp[base + 4] = -polyPreview[i + 1].y / kPixelScale;
        sp[base + 5] = 5.6;
      }
      this.overlay.sessionLines.geometry.setDrawRange(0, seg * 2);
      (
        this.overlay.sessionLines.geometry.getAttribute(
          "position"
        ) as BufferAttribute
      ).needsUpdate = true;
      this.overlay.sessionLines.visible = true;
    } else {
      this.overlay.sessionLines.visible = false;
    }

    // Tile preview (ghost tiles at cursor)
    const previewTiles = loopState.previewTiles;
    const showPreview = !!(mt && previewTiles && previewTiles.length > 0);
    const prevKey = this.lastPreviewKey;
    const previewUnchanged = showPreview
      ? !!prevKey &&
        prevKey.tiles === previewTiles &&
        prevKey.mtx === mt!.x &&
        prevKey.mty === mt!.y &&
        prevKey.offX === hoverOffX &&
        prevKey.offY === hoverOffY
      : prevKey === null;
    if (!previewUnchanged) {
      disposeGroup(this.overlay.previewGroup);
      this.lastPreviewKey = showPreview
        ? {
            tiles: previewTiles!,
            mtx: mt!.x,
            mty: mt!.y,
            offX: hoverOffX,
            offY: hoverOffY
          }
        : null;
    }
    if (!previewUnchanged && showPreview && previewTiles) {
      const previewZ = 5.5;
      // Group by tilesetName for efficient batching
      const byTileset = new Map<
        string,
        { dx: number; dy: number; tile: TilePlacement }[]
      >();
      for (const pt of previewTiles) {
        let arr = byTileset.get(pt.tile.tilesetName);
        if (!arr) {
          arr = [];
          byTileset.set(pt.tile.tilesetName, arr);
        }
        arr.push(pt);
      }

      for (const [tsName, tiles] of byTileset) {
        const texInfo = this.cachedTilesetTextures.get(tsName);
        const meta = this.cachedTilesetMeta.get(tsName);
        if (!texInfo || !texInfo.img.complete || !meta) continue;

        const imgW = texInfo.img.naturalWidth;
        const imgH = texInfo.img.naturalHeight;
        const quadCount = tiles.length;
        const posArr = new Float32Array(quadCount * 4 * 3);
        const uvArr = new Float32Array(quadCount * 4 * 2);

        for (let i = 0; i < quadCount; i++) {
          const t = tiles[i];
          const tx = mt.x + t.dx;
          const ty = mt.y + t.dy;
          const wx0 = tx * TILE_WORLD + hoverOffX;
          const wy0 = -(ty + 1) * TILE_WORLD + hoverOffY;
          const wx1 = (tx + 1) * TILE_WORLD + hoverOffX;
          const wy1 = -ty * TILE_WORLD + hoverOffY;

          posArr[i * 12 + 0] = wx0;
          posArr[i * 12 + 1] = wy0;
          posArr[i * 12 + 2] = previewZ;
          posArr[i * 12 + 3] = wx1;
          posArr[i * 12 + 4] = wy0;
          posArr[i * 12 + 5] = previewZ;
          posArr[i * 12 + 6] = wx1;
          posArr[i * 12 + 7] = wy1;
          posArr[i * 12 + 8] = previewZ;
          posArr[i * 12 + 9] = wx0;
          posArr[i * 12 + 10] = wy1;
          posArr[i * 12 + 11] = previewZ;

          const srcCol = t.tile.gid % meta.columns;
          const srcRow = Math.floor(t.tile.gid / meta.columns);
          const srcX = srcCol * meta.tileWidth;
          const srcY = srcRow * meta.tileHeight;

          const u0 = srcX / imgW;
          const u1 = (srcX + meta.tileWidth) / imgW;
          const vTop = srcY / imgH;
          const vBottom = (srcY + meta.tileHeight) / imgH;

          const uvBL: [number, number] = [u0, vBottom];
          const uvBR: [number, number] = [u1, vBottom];
          const uvTR: [number, number] = [u1, vTop];
          const uvTL: [number, number] = [u0, vTop];

          if (t.tile.flipD) {
            const tmp0 = uvBL[0];
            const tmp1 = uvBL[1];
            uvBL[0] = uvTR[0];
            uvBL[1] = uvTR[1];
            uvTR[0] = tmp0;
            uvTR[1] = tmp1;
          }
          if (t.tile.flipH) {
            let tmp0 = uvBL[0];
            let tmp1 = uvBL[1];
            uvBL[0] = uvBR[0];
            uvBL[1] = uvBR[1];
            uvBR[0] = tmp0;
            uvBR[1] = tmp1;
            tmp0 = uvTL[0];
            tmp1 = uvTL[1];
            uvTL[0] = uvTR[0];
            uvTL[1] = uvTR[1];
            uvTR[0] = tmp0;
            uvTR[1] = tmp1;
          }
          if (t.tile.flipV) {
            let tmp0 = uvBL[0];
            let tmp1 = uvBL[1];
            uvBL[0] = uvTL[0];
            uvBL[1] = uvTL[1];
            uvTL[0] = tmp0;
            uvTL[1] = tmp1;
            tmp0 = uvBR[0];
            tmp1 = uvBR[1];
            uvBR[0] = uvTR[0];
            uvBR[1] = uvTR[1];
            uvTR[0] = tmp0;
            uvTR[1] = tmp1;
          }

          uvArr[i * 8 + 0] = uvBL[0];
          uvArr[i * 8 + 1] = uvBL[1];
          uvArr[i * 8 + 2] = uvBR[0];
          uvArr[i * 8 + 3] = uvBR[1];
          uvArr[i * 8 + 4] = uvTR[0];
          uvArr[i * 8 + 5] = uvTR[1];
          uvArr[i * 8 + 6] = uvTL[0];
          uvArr[i * 8 + 7] = uvTL[1];
        }

        const geom = new BufferGeometry();
        geom.setIndex(new BufferAttribute(quadIndexArray(quadCount), 1));
        geom.setAttribute("position", new BufferAttribute(posArr, 3));
        geom.setAttribute("uv", new BufferAttribute(uvArr, 2));

        const mat = new MeshBasicMaterial({
          map: texInfo.texture,
          transparent: true,
          opacity: 0.45,
          side: FrontSide,
          alphaTest: 0.01,
          depthWrite: false
        });

        const mesh = new Mesh(geom, mat);
        this.overlay.previewGroup.add(mesh);
      }
    }

    // Camera
    this.camera.left = 0;
    this.camera.right = width;
    this.camera.top = height;
    this.camera.bottom = 0;
    this.camera.position.set(0, 0, 128);
    this.camera.updateProjectionMatrix();

    this.renderer.setPixelRatio(1);
    this.renderer.setSize(width, height, false);
    this.renderer.render(this.overlay.rootScene, this.camera);
  }
}
