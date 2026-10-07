import shortid from "shortid";
import * as Y from "yjs";

import { Loader } from "src/api/loader";
import { createTypedEventEmitter } from "src/api/util";
import { GameAssets } from "src/assets/allAssets";
import { centralAssetManager } from "src/engine/asset/AssetManager";
import { createEntityAssetLoader } from "src/engine/entity/createEntityAssetLoader";
import { TilesetDefinitionAPI } from "src/engine/level/LevelLoaderAPI";
import { MultiLoader } from "src/engine/loader/Loaders";
import { entityClassRegistry } from "src/entities/allEntities";
import { allTilesets } from "src/levels/tilesets/allTilesets";

import { entityRefPropNames } from "./entityRefs";
import {
  DOC_LOAD_ORIGIN,
  LOCAL_EDIT_ORIGIN,
  PopulateDocArgs,
  REMOTE_ORIGIN,
  REPAIR_ORIGIN,
  collectUsedTilesets,
  docLayerToEditorLayer,
  editorLayerToDoc,
  getDocLayerOrder,
  getDocLayers,
  getDocMeta,
  getDocTilesets,
  populateDoc,
  readDocLayerOrder,
  readDocTiles
} from "./levelEditorDoc";
import {
  DEFAULT_MAP_BACKGROUND_COLOR,
  EditorLayer,
  EditorTool,
  EntityPlacement,
  EntityRefPick,
  LevelEditorState,
  TilePlacement,
  TileRegion,
  TileStamp,
  TiledProperty,
  flattenEntityLayers,
  tilePlacementsEqual
} from "./levelEditorState";
import {
  IDENTITY_ORIENTATION,
  OrientationOp,
  flipOrientationH,
  flipOrientationV,
  rotateOrientationCCW,
  rotateOrientationCW,
  transformStampOffset
} from "./tileOrientation";

// ===========================================================================
// UI state (panel sizes, tabs, transient dialogs) — survives unmount because
// the store outlives the component tree.
// ===========================================================================

export type LeftSidebarTab = "tiles" | "entities";

export type LevelEditorUIState = {
  leftTab: LeftSidebarTab;
  leftWidth: number;
  rightWidth: number;
  layerHeight: number;
  missingTilesets: string[] | null;
  /** Last-used member of each grouped toolbar tool button (the group "face"). */
  lastTileTool: "paint" | "erase" | "fill";
  lastShapeTool: "entity" | "polyline";
  /** Entity layers expanded in the layer panel (ids reset on level load). */
  expandedLayerIds: string[];
};

const DEFAULT_LEFT_WIDTH = 400;
const DEFAULT_RIGHT_WIDTH = 360;
const MAX_UNDO_DEPTH = 50;
const DEFAULT_LAYER_HEIGHT = Math.max(
  60,
  typeof window !== "undefined"
    ? Math.round((window.innerHeight - 40) * 0.3)
    : 200
);

function createInitialUIState(): LevelEditorUIState {
  return {
    leftTab: "tiles",
    leftWidth: DEFAULT_LEFT_WIDTH,
    rightWidth: DEFAULT_RIGHT_WIDTH,
    layerHeight: DEFAULT_LAYER_HEIGHT,
    missingTilesets: null,
    lastTileTool: "paint",
    lastShapeTool: "entity",
    expandedLayerIds: []
  };
}

// ===========================================================================
// Event map
// ===========================================================================

export type LevelEditorEvents = {
  /** Fired alongside every other state-changed event — coarse signal for
   *  consumers that want to re-evaluate the full state. */
  stateChanged: void;
  layersChanged: void;
  selectionChanged: void;
  toolChanged: void;
  /** Entity-picker mode entered/left, or a ref chip hovered. */
  entityRefPickChanged: void;
  paletteChanged: void;
  cameraChanged: void;
  liveModeChanged: void;
  metadataChanged: void;
  undoChanged: void;
  uiChanged: void;
  preloaderChanged: void;
  openCountChanged: void;
  /** A save was requested (Ctrl+S / Save button); the toolbar performs it. */
  saveRequested: void;
  /** A save flow finished its durable write; the toolbar flashes the result. */
  saveCompleted: { ok: boolean };
  /** The doc's levelUuid changed in place (a level was loaded into a shared
   *  doc), so slot choices tied to the old level no longer apply. */
  levelIdentityChanged: void;
};

// ===========================================================================
// Initial editor session state (document state lives in the Y.Doc)
// ===========================================================================

function createInitialEditorState(): LevelEditorState {
  return {
    layers: [],
    activeLayerId: "",
    selectedTool: "paint",
    selectedTilesetName: "tiles16",
    selectedTileId: null,
    selectedTileRegion: null,
    capturedBrush: null,
    flipH: false,
    flipV: false,
    flipD: false,
    selectedEntityType: null,
    selectedEntityIds: [],
    selectedTileKeys: [],
    entityRefPick: null,
    entityRefHoverEntityId: null,
    camera: { x: 0, y: 0, zoom: 2 },
    gridVisible: true,
    highlightActiveLayer: true,
    levelName: "Untitled",
    backgroundColor: DEFAULT_MAP_BACKGROUND_COLOR,
    sourceLevelId: undefined,
    liveMode: false,
    snapEnabled: true
  };
}

function shallowRecordEqual(
  a: Record<string, unknown>,
  b: Record<string, unknown>
): boolean {
  const aKeys = Object.keys(a);
  if (aKeys.length !== Object.keys(b).length) return false;
  return aKeys.every((key) => Object.is(a[key], b[key]));
}

function setValueAtPath(
  container: unknown,
  path: (string | number)[],
  value: unknown
): unknown {
  if (path.length === 0) return value;
  const [key, ...rest] = path;
  if (typeof key === "number") {
    const next = Array.isArray(container) ? container.slice() : [];
    next[key] = setValueAtPath(next[key], rest, value);
    return next;
  }
  const next =
    container !== null && typeof container === "object"
      ? { ...(container as Record<string, unknown>) }
      : {};
  next[key] = setValueAtPath(next[key], rest, value);
  return next;
}

function defaultBlankLayers(mint: () => string): EditorLayer[] {
  return [
    {
      kind: "tile",
      id: mint(),
      name: "Background",
      tiles: new Map(),
      visible: true,
      opacity: 1
    },
    {
      kind: "tile",
      id: mint(),
      name: "Main",
      tiles: new Map(),
      visible: true,
      opacity: 1
    },
    {
      kind: "entity",
      id: mint(),
      name: "Entities",
      entities: [],
      visible: true
    },
    {
      kind: "tile",
      id: mint(),
      name: "Foreground",
      tiles: new Map(),
      visible: true,
      opacity: 1
    }
  ];
}

// ===========================================================================
// LevelEditorStore: a facade over the Y.Doc (document state) plus plain local
// session state (tool, brush, selection, camera, view toggles). Writes go only
// into the doc; the plain-JS view in _state is derived only from the doc.
// ===========================================================================

export class LevelEditorStore {
  readonly events = createTypedEventEmitter<LevelEditorEvents>();

  private _doc!: Y.Doc;
  private _undoManager!: Y.UndoManager;
  private _state: LevelEditorState = createInitialEditorState();
  private _ui: LevelEditorUIState = createInitialUIState();
  private _openCount = 0;

  /** Derived per-layer view objects, reused when a layer didn't change so the
   *  renderer's identity-based caching keeps working. */
  private _layerViews = new Map<string, EditorLayer>();
  /** Derived tiles Map per tile layer, updated incrementally from Yjs deltas
   *  (clone-and-patch, so each change produces a fresh identity). */
  private _tileViews = new Map<string, Map<string, TilePlacement>>();

  private _dirtyLayerIds = new Set<string>();
  private _layersDirty = false;
  private _metaDirty = false;
  private _tilesetsDirty = false;

  /** True when a tracked local edit happened since the last pushUndo().
   *  Guards cancelToLastUndoPoint from undoing the previous gesture. */
  private _changedSinceUndoPoint = false;

  /** Top of the undo stack at the last pushUndo(). cancelToLastUndoPoint may
   *  only revert stack items above this fence. */
  private _undoPointBoundary: Y.UndoManager["undoStack"][number] | null = null;
  private _repairScheduled = false;

  /** Set when a transaction removed or replaced entities/layers, so the
   *  selection prune only scans entities when it can actually change. */
  private _entitiesMaybeRemoved = false;

  /** The doc's last seen load stamp; a change means the doc was repopulated
   *  wholesale, even when the level identity stayed the same. */
  private _lastLoadStamp: unknown = undefined;

  private _sharedDocMode = false;

  /** True when the document changed since the last save/load. Drives the
   *  "save first?" guard before a join replaces the editor contents. */
  private _dirtySinceSave = false;

  // Preloader lifecycle. Once preloading starts we hold asset references
  // forever (the user has chosen "preserve indefinitely once opened"), so
  // there is no release path.
  private _assetsReady = false;
  private _assetsLoading = false;
  private _preloadStarted = false;

  // True once the toolbar has consumed the `?level=...` URL parameter for
  // the page lifetime. Prevents re-loading (and overwriting edits) every
  // time the editor tab remounts.
  private _initialUrlLoadConsumed = false;

  constructor() {
    // Allow many subscribers (canvas alone subscribes from many useEffects).
    this.events.setMaxListeners(200);
    this.attachDoc(new Y.Doc());
    this._doc.transact(() => {
      populateDoc(this._doc, {
        layers: defaultBlankLayers(() => this.mintEditorId()),
        levelName: "Untitled",
        backgroundColor: DEFAULT_MAP_BACKGROUND_COLOR
      });
    }, DOC_LOAD_ORIGIN);
    this._undoManager.clear();
    this._state = {
      ...this._state,
      activeLayerId:
        this._state.layers.find((l) => l.name === "Main")?.id ??
        this._state.layers[0]?.id ??
        ""
    };
  }

  // -------------------------------------------------------------------------
  // Y.Doc lifecycle
  // -------------------------------------------------------------------------

  getDoc(): Y.Doc {
    return this._doc;
  }

  /** Ids minted during a session must be collision-proof across peers, so
   *  they carry the doc's clientID. Opaque strings round-trip through Tiled. */
  mintEditorId(): string {
    return `${this._doc.clientID.toString(36)}-${shortid()}`;
  }

  getLevelUuid(): string | undefined {
    const uuid = getDocMeta(this._doc).get("levelUuid");
    return typeof uuid === "string" ? uuid : undefined;
  }

  private attachDoc(doc: Y.Doc): void {
    this._doc = doc;
    getDocLayers(doc).observeDeep(this.onLayersDeepEvents);
    getDocLayerOrder(doc).observe(this.onLayerOrderEvent);
    getDocMeta(doc).observe(this.onMetaEvent);
    getDocTilesets(doc).observe(this.onTilesetsEvent);
    doc.on("afterTransaction", this.onAfterTransaction);
    this._undoManager = new Y.UndoManager(
      [getDocLayers(doc), getDocLayerOrder(doc)],
      {
        trackedOrigins: new Set([LOCAL_EDIT_ORIGIN]),
        // Gestures are delimited explicitly via pushUndo(); merge everything
        // in between into one undo unit no matter how long the gesture takes.
        captureTimeout: Number.MAX_SAFE_INTEGER
      }
    );
    const emitUndoChanged = () => {
      this.events.emit("undoChanged");
      this.events.emit("stateChanged");
    };
    this._undoManager.on("stack-item-added", () => {
      // Stack items pin deleted structs against GC, so an uncapped history
      // grows without bound over a long session.
      const stack = this._undoManager.undoStack;
      if (stack.length > MAX_UNDO_DEPTH) {
        this.releaseEvictedStackItems(
          stack.splice(0, stack.length - MAX_UNDO_DEPTH)
        );
      }
      emitUndoChanged();
    });
    this._undoManager.on("stack-item-popped", emitUndoChanged);
    this._undoManager.on("stack-cleared", emitUndoChanged);
  }

  /** A bare splice off the undo stack would leave the evicted items' deleted
   *  structs keep-pinned forever; mirror Y.UndoManager.clear() so evicted
   *  history can actually be garbage collected. */
  private releaseEvictedStackItems(evicted: Y.UndoManager["undoStack"]): void {
    const doc = this._doc;
    const scope = this._undoManager.scope;
    // Eviction fires inside transaction cleanup; unpinning needs its own
    // transaction, so it waits for the current one to finish.
    queueMicrotask(() => {
      doc.transact((transaction) => {
        for (const item of evicted) {
          Y.iterateDeletedStructs(transaction, item.deletions, (struct) => {
            if (
              !(struct instanceof Y.Item) ||
              !scope.some(
                (type) =>
                  type instanceof Y.AbstractType && Y.isParentOf(type, struct)
              )
            ) {
              return;
            }
            for (
              let cur: Y.Item | null = struct;
              cur !== null && cur.keep;
              cur =
                cur.parent instanceof Y.AbstractType ? cur.parent._item : null
            ) {
              cur.keep = false;
            }
          });
          Y.tryGc(item.deletions, doc.store, doc.gcFilter);
        }
      });
    });
  }

  private detachDoc(): void {
    const doc = this._doc;
    getDocLayers(doc).unobserveDeep(this.onLayersDeepEvents);
    getDocLayerOrder(doc).unobserve(this.onLayerOrderEvent);
    getDocMeta(doc).unobserve(this.onMetaEvent);
    getDocTilesets(doc).unobserve(this.onTilesetsEvent);
    doc.off("afterTransaction", this.onAfterTransaction);
    this._undoManager.destroy();
    doc.destroy();
  }

  /** While in a collaborative session the doc is shared: loading a level must
   *  repopulate the existing doc in place (syncing the switch to peers and
   *  preserving one continuous Yjs history) instead of swapping docs. */
  setSharedDocMode(shared: boolean): void {
    this._sharedDocMode = shared;
  }

  /** Adopt a different Y.Doc wholesale (fresh load, or joining a room). The
   *  previous doc is torn down; the derived view rebuilds from the new doc. */
  replaceDoc(doc: Y.Doc): void {
    this.detachDoc();
    this._layerViews.clear();
    this._tileViews.clear();
    this._dirtyLayerIds.clear();
    this._layersDirty = false;
    this._metaDirty = false;
    this._tilesetsDirty = false;
    this._entitiesMaybeRemoved = false;
    this._changedSinceUndoPoint = false;
    this._undoPointBoundary = null;
    this._dirtySinceSave = false;
    this.attachDoc(doc);
    this.rebuildFullViewFromDoc();
  }

  private transactLocal(fn: () => void): void {
    this._doc.transact(fn, LOCAL_EDIT_ORIGIN);
  }

  // -------------------------------------------------------------------------
  // Doc observers to derived view
  // -------------------------------------------------------------------------

  private onLayersDeepEvents = (
    events: Y.YEvent<Y.AbstractType<unknown>>[]
  ) => {
    for (const event of events) {
      const path = event.path;
      if (path.length === 0) {
        // Layers added/removed, or a nested container replaced wholesale;
        // the cached tile views for those ids are stale.
        this._layersDirty = true;
        for (const [key, change] of event.changes.keys) {
          this._dirtyLayerIds.add(String(key));
          this._tileViews.delete(String(key));
          if (change.action !== "add") this._entitiesMaybeRemoved = true;
        }
        continue;
      }
      const layerId = String(path[0]);
      if (path.length === 1) {
        if (event.changes.keys.has("tiles")) this._tileViews.delete(layerId);
      } else if (path.length === 2 && path[1] === "tiles") {
        this.applyTileDeltas(layerId, event as Y.YMapEvent<TilePlacement>);
      } else if (path.length === 2 && path[1] === "entities") {
        for (const change of event.changes.keys.values()) {
          if (change.action === "delete") {
            this._entitiesMaybeRemoved = true;
            break;
          }
        }
      }
      this._layersDirty = true;
      this._dirtyLayerIds.add(layerId);
    }
  };

  private applyTileDeltas(
    layerId: string,
    event: Y.YMapEvent<TilePlacement>
  ): void {
    const existing = this._tileViews.get(layerId);
    if (!existing) return; // no view yet; rebuilt from the doc on demand
    const next = new Map(existing);
    const yTiles = event.target;
    for (const [key, change] of event.changes.keys) {
      if (change.action === "delete") {
        next.delete(key);
      } else {
        const placement = yTiles.get(key);
        if (placement) next.set(key, placement);
      }
    }
    this._tileViews.set(layerId, next);
  }

  private onLayerOrderEvent = () => {
    this._layersDirty = true;
  };

  private onMetaEvent = () => {
    this._metaDirty = true;
  };

  private onTilesetsEvent = () => {
    this._tilesetsDirty = true;
  };

  private onAfterTransaction = (transaction: Y.Transaction) => {
    const layersDirty = this._layersDirty;
    const metaDirty = this._metaDirty;
    const tilesetsDirty = this._tilesetsDirty;
    if (!layersDirty && !metaDirty && !tilesetsDirty) return;

    if (layersDirty && transaction.origin === LOCAL_EDIT_ORIGIN) {
      this._changedSinceUndoPoint = true;
    }
    if (transaction.origin !== DOC_LOAD_ORIGIN) {
      this._dirtySinceSave = true;
    }

    const patch: Partial<LevelEditorState> = {};
    let selectionPruned = false;

    if (layersDirty) {
      const layers = this.rebuildLayersView();
      patch.layers = layers;
      if (!layers.some((l) => l.id === this._state.activeLayerId)) {
        patch.activeLayerId = layers[0]?.id ?? "";
      }
      if (
        this._entitiesMaybeRemoved &&
        this._state.selectedEntityIds.length > 0
      ) {
        const alive = new Set(flattenEntityLayers(layers).map((e) => e.id));
        const pruned = this._state.selectedEntityIds.filter((id) =>
          alive.has(id)
        );
        if (pruned.length !== this._state.selectedEntityIds.length) {
          patch.selectedEntityIds = pruned;
          selectionPruned = true;
        }
      }
      // Tiles a peer erased must leave the local selection too, or moves and
      // deletes keep acting on cells that no longer exist. Local gestures
      // manage the selection themselves, so only remote changes prune here.
      // A selection made on another tile layer is left alone.
      if (
        transaction.origin === REMOTE_ORIGIN &&
        this._state.selectedTileKeys.length > 0
      ) {
        const activeLayerId = patch.activeLayerId ?? this._state.activeLayerId;
        const activeLayer = layers.find((l) => l.id === activeLayerId);
        const prunedKeys =
          activeLayer?.kind === "tile"
            ? this._state.selectedTileKeys.filter((key) =>
                activeLayer.tiles.has(key)
              )
            : this._state.selectedTileKeys;
        if (prunedKeys.length !== this._state.selectedTileKeys.length) {
          patch.selectedTileKeys = prunedKeys;
          selectionPruned = true;
        }
      }
    }
    let identityChanged = false;
    let docReloaded = false;
    if (metaDirty) {
      const metaPatch = this.readMetaView();
      identityChanged =
        this._state.levelUuid !== undefined &&
        metaPatch.levelUuid !== this._state.levelUuid;
      const loadStamp = getDocMeta(this._doc).get("loadStamp");
      if (loadStamp !== this._lastLoadStamp) {
        this._lastLoadStamp = loadStamp;
        docReloaded = true;
      }
      Object.assign(patch, metaPatch);
    }
    if (
      (identityChanged || docReloaded) &&
      transaction.origin === REMOTE_ORIGIN
    ) {
      // A peer repopulated the shared doc: local undo items now reference
      // deleted subtrees, and a different level also invalidates the slot.
      if (identityChanged) patch.savedMapId = undefined;
      this._undoManager.clear();
      this._changedSinceUndoPoint = false;
    }
    if (tilesetsDirty) {
      patch.externalTilesets = this.readExternalTilesetsView();
    }

    this._layersDirty = false;
    this._metaDirty = false;
    this._tilesetsDirty = false;
    this._entitiesMaybeRemoved = false;
    this._dirtyLayerIds.clear();

    this.replaceState(patch);
    if (layersDirty || tilesetsDirty) this.events.emit("layersChanged");
    if (selectionPruned) this.events.emit("selectionChanged");
    if (metaDirty) this.events.emit("metadataChanged");
    if (tilesetsDirty) this.events.emit("paletteChanged");
    if (identityChanged) this.events.emit("levelIdentityChanged");
    this.events.emit("stateChanged");
    if (layersDirty) this.scheduleEntityIdRepair();
  };

  private rebuildLayersView(): EditorLayer[] {
    const yLayers = getDocLayers(this._doc);
    const nextViews = new Map<string, EditorLayer>();
    const layers: EditorLayer[] = [];
    for (const id of readDocLayerOrder(this._doc)) {
      const yLayer = yLayers.get(id);
      if (!yLayer) continue;
      const cached = this._layerViews.get(id);
      let view: EditorLayer;
      if (cached && !this._dirtyLayerIds.has(id)) {
        view = cached;
      } else {
        view = docLayerToEditorLayer(id, yLayer, this.tilesViewFor(id, yLayer));
      }
      nextViews.set(id, view);
      layers.push(view);
    }
    this._layerViews = nextViews;
    for (const id of [...this._tileViews.keys()]) {
      if (!nextViews.has(id)) this._tileViews.delete(id);
    }
    return layers;
  }

  private tilesViewFor(
    id: string,
    yLayer: Y.Map<unknown>
  ): Map<string, TilePlacement> | undefined {
    if (yLayer.get("kind") !== "tile") return undefined;
    let tiles = this._tileViews.get(id);
    if (!tiles) {
      tiles = readDocTiles(yLayer);
      this._tileViews.set(id, tiles);
    }
    return tiles;
  }

  private readMetaView(): Partial<LevelEditorState> {
    const meta = getDocMeta(this._doc);
    const levelName = meta.get("levelName");
    const backgroundColor = meta.get("backgroundColor");
    const sourceLevelId = meta.get("sourceLevelId");
    const levelUuid = meta.get("levelUuid");
    const mapProperties = meta.get("mapProperties");
    const nextObjectId = meta.get("nextObjectId");
    const unknownTilesetSources = meta.get("unknownTilesetSources");
    return {
      levelUuid: typeof levelUuid === "string" ? levelUuid : undefined,
      levelName: typeof levelName === "string" ? levelName : "Untitled",
      backgroundColor:
        typeof backgroundColor === "string"
          ? backgroundColor
          : DEFAULT_MAP_BACKGROUND_COLOR,
      sourceLevelId:
        typeof sourceLevelId === "string" ? sourceLevelId : undefined,
      mapProperties: Array.isArray(mapProperties) ? mapProperties : undefined,
      nextObjectId: typeof nextObjectId === "number" ? nextObjectId : undefined,
      unknownTilesetSources:
        unknownTilesetSources && typeof unknownTilesetSources === "object"
          ? (unknownTilesetSources as Record<string, string>)
          : undefined
    };
  }

  private readExternalTilesetsView():
    | Record<string, TilesetDefinitionAPI>
    | undefined {
    const external: Record<string, TilesetDefinitionAPI> = {};
    getDocTilesets(this._doc).forEach((def, name) => {
      if (!allTilesets[name]) external[name] = def;
    });
    return Object.keys(external).length > 0 ? external : undefined;
  }

  private rebuildFullViewFromDoc(): void {
    this._dirtyLayerIds.clear();
    this._layerViews.clear();
    this._tileViews.clear();
    this._lastLoadStamp = getDocMeta(this._doc).get("loadStamp");
    const layers = this.rebuildLayersView();
    this.replaceState({
      layers,
      activeLayerId: layers[0]?.id ?? "",
      ...this.readMetaView(),
      externalTilesets: this.readExternalTilesetsView(),
      selectedEntityIds: [],
      selectedTileKeys: [],
      liveMode: false
    });
    this.events.emit("layersChanged");
    this.events.emit("selectionChanged");
    this.events.emit("metadataChanged");
    this.events.emit("liveModeChanged");
    this.events.emit("undoChanged");
    this.events.emit("paletteChanged");
    this.events.emit("stateChanged");
    this.scheduleEntityIdRepair();
  }

  // -------------------------------------------------------------------------
  // Lifecycle (open/close, preloader)
  // -------------------------------------------------------------------------

  /** Called when a top-level editor component (the preloader tab) mounts. */
  openInstance(): void {
    this._openCount++;
    if (!this._preloadStarted) {
      this.startPreload();
    }
    this.events.emit("openCountChanged");
  }

  /** Called when a top-level editor component unmounts. When the count
   *  drops to zero we force live mode off (renderer state is per-mount). */
  closeInstance(): void {
    if (this._openCount > 0) this._openCount--;
    if (this._openCount === 0 && this._state.liveMode) {
      this._state = { ...this._state, liveMode: false };
      this.events.emit("liveModeChanged");
      this.events.emit("stateChanged");
    }
    this.events.emit("openCountChanged");
  }

  getOpenCount(): number {
    return this._openCount;
  }

  isAssetsReady(): boolean {
    return this._assetsReady;
  }

  /** Returns true the first time it's called per page-load, then always
   *  returns false. Used by the toolbar to gate its URL `?level=...`
   *  auto-load to a single attempt, so remounting the tab doesn't wipe
   *  in-progress edits. */
  consumeInitialUrlLoad(): boolean {
    if (this._initialUrlLoadConsumed) return false;
    this._initialUrlLoadConsumed = true;
    return true;
  }

  private startPreload(): void {
    if (this._preloadStarted) return;
    this._preloadStarted = true;
    this._assetsLoading = true;
    this.events.emit("preloaderChanged");

    const allClasses = entityClassRegistry.getAll();
    const allTypeNames = new Set(entityClassRegistry.keys());

    const toResolve = new Set<keyof GameAssets>();
    for (const entityClass of allClasses) {
      const deps = entityClass.getAssetDependencies?.();
      if (deps !== undefined) {
        for (const dep of deps) toResolve.add(dep);
      }
    }
    const assetsToPreload: Record<string, Loader> = {};
    for (const dep of toResolve) {
      const assetLoader = centralAssetManager.acquireReference(dep);
      if (!assetLoader) continue;
      assetsToPreload[dep as string] = assetLoader;
    }
    const assetPreloader = new MultiLoader(
      "allAssetsToPreload",
      assetsToPreload
    );
    const legacyLoader = createEntityAssetLoader(allClasses, allTypeNames);

    Promise.all([assetPreloader.load(), legacyLoader.load()])
      .then(() => {
        this._assetsReady = true;
        this._assetsLoading = false;
        this.events.emit("preloaderChanged");
      })
      .catch((err) => {
        console.error("[LevelEditorStore] Failed to preload entities:", err);
        // Render anyway so the editor is usable (sprites may be missing).
        this._assetsReady = true;
        this._assetsLoading = false;
        this.events.emit("preloaderChanged");
      });
  }

  // -------------------------------------------------------------------------
  // Read API
  // -------------------------------------------------------------------------

  getState(): Readonly<LevelEditorState> {
    return this._state;
  }

  getUI(): Readonly<LevelEditorUIState> {
    return this._ui;
  }

  // -------------------------------------------------------------------------
  // UI state mutations
  // -------------------------------------------------------------------------

  private setUI(patch: Partial<LevelEditorUIState>): void {
    this._ui = { ...this._ui, ...patch };
    this.events.emit("uiChanged");
  }

  setLeftTab(tab: LeftSidebarTab): void {
    if (this._ui.leftTab === tab) return;
    this._ui = { ...this._ui, leftTab: tab };
    this.events.emit("uiChanged");
  }

  setLeftWidth(width: number): void {
    if (this._ui.leftWidth === width) return;
    this._ui = { ...this._ui, leftWidth: width };
    this.events.emit("uiChanged");
  }

  setRightWidth(width: number): void {
    if (this._ui.rightWidth === width) return;
    this._ui = { ...this._ui, rightWidth: width };
    this.events.emit("uiChanged");
  }

  setLayerHeight(height: number): void {
    if (this._ui.layerHeight === height) return;
    this._ui = { ...this._ui, layerHeight: height };
    this.events.emit("uiChanged");
  }

  setMissingTilesets(names: string[] | null): void {
    if (this._ui.missingTilesets === names) return;
    this._ui = { ...this._ui, missingTilesets: names };
    this.events.emit("uiChanged");
  }

  toggleLayerExpanded(layerId: string): void {
    const expanded = this._ui.expandedLayerIds;
    this.setUI({
      expandedLayerIds: expanded.includes(layerId)
        ? expanded.filter((id) => id !== layerId)
        : [...expanded, layerId]
    });
  }

  // -------------------------------------------------------------------------
  // Editor state mutations. Document mutations are Y.Doc transactions; the
  // observers rebuild the derived view and emit layersChanged/metadataChanged/
  // stateChanged. Session mutations replace fields on _state directly.
  // -------------------------------------------------------------------------

  private replaceState(patch: Partial<LevelEditorState>): void {
    this._state = { ...this._state, ...patch };
  }

  private getYTileLayer(layerId: string): Y.Map<TilePlacement> | null {
    const yLayer = getDocLayers(this._doc).get(layerId);
    if (!yLayer || yLayer.get("kind") !== "tile") return null;
    const yTiles = yLayer.get("tiles");
    return yTiles instanceof Y.Map ? (yTiles as Y.Map<TilePlacement>) : null;
  }

  private forEachYEntityLayer(
    fn: (
      yLayer: Y.Map<unknown>,
      yEntities: Y.Map<EntityPlacement>,
      yOrder: Y.Array<string> | null
    ) => void
  ): void {
    getDocLayers(this._doc).forEach((yLayer) => {
      if (yLayer.get("kind") !== "entity") return;
      const yEntities = yLayer.get("entities");
      if (!(yEntities instanceof Y.Map)) return;
      const yOrder = yLayer.get("entityOrder");
      fn(
        yLayer,
        yEntities as Y.Map<EntityPlacement>,
        yOrder instanceof Y.Array ? (yOrder as Y.Array<string>) : null
      );
    });
  }

  /** Register the tileset a placement references so the doc always carries
   *  definitions for every tileset the level uses. */
  private ensureTilesetRegistered(tilesetName: string): void {
    const yTilesets = getDocTilesets(this._doc);
    if (yTilesets.has(tilesetName)) return;
    const def =
      allTilesets[tilesetName] ?? this._state.externalTilesets?.[tilesetName];
    if (def) yTilesets.set(tilesetName, def);
  }

  // --- Tile mutations ---

  paintTile(
    layerId: string,
    tileX: number,
    tileY: number,
    tile: TilePlacement
  ): void {
    this.paintTiles(layerId, [{ tileX, tileY, tile }]);
  }

  eraseTile(layerId: string, tileX: number, tileY: number): void {
    this.eraseTiles(layerId, [`${tileX},${tileY}`]);
  }

  paintTiles(
    layerId: string,
    tiles: { tileX: number; tileY: number; tile: TilePlacement }[]
  ): void {
    const yTiles = this.getYTileLayer(layerId);
    if (!yTiles) return;
    this.transactLocal(() => {
      for (const t of tiles) {
        const key = `${t.tileX},${t.tileY}`;
        const existing = yTiles.get(key);
        if (existing && tilePlacementsEqual(existing, t.tile)) continue;
        yTiles.set(key, t.tile);
        this.ensureTilesetRegistered(t.tile.tilesetName);
      }
    });
  }

  eraseTiles(layerId: string, keys: string[]): void {
    const yTiles = this.getYTileLayer(layerId);
    if (!yTiles) return;
    this.transactLocal(() => {
      for (const key of keys) {
        if (yTiles.has(key)) yTiles.delete(key);
      }
    });
  }

  moveTiles(
    layerId: string,
    moves: { fromKey: string; toKey: string; tile: TilePlacement }[]
  ): void {
    const yTiles = this.getYTileLayer(layerId);
    if (!yTiles) return;
    const real = moves.filter(
      (m) =>
        m.fromKey !== m.toKey ||
        !tilePlacementsEqual(yTiles.get(m.toKey), m.tile)
    );
    if (real.length === 0) return;
    this.transactLocal(() => {
      for (const m of real) {
        if (m.fromKey !== m.toKey && yTiles.has(m.fromKey)) {
          yTiles.delete(m.fromKey);
        }
      }
      for (const m of real) {
        yTiles.set(m.toKey, m.tile);
      }
    });
  }

  // --- Entity mutations ---

  addEntity(entity: EntityPlacement): void {
    const activeLayer = this._state.layers.find(
      (l) => l.id === this._state.activeLayerId
    );
    const targetId =
      activeLayer && activeLayer.kind === "entity"
        ? activeLayer.id
        : this._state.layers.find((l) => l.kind === "entity")?.id;
    if (!targetId) return;
    const yLayer = getDocLayers(this._doc).get(targetId);
    if (!yLayer || yLayer.get("kind") !== "entity") return;
    const yEntities = yLayer.get("entities");
    const yOrder = yLayer.get("entityOrder");
    if (!(yEntities instanceof Y.Map)) return;
    // Placement, not save, is where the id has to exist: an entity with no
    // Tiled object id can't be picked as an entityRef target, and one minted
    // per save would point references at a different object every time.
    const placement =
      entity.tiledObjectId === undefined
        ? { ...entity, tiledObjectId: this.allocateTiledObjectId() }
        : entity;
    this.transactLocal(() => {
      (yEntities as Y.Map<EntityPlacement>).set(placement.id, placement);
      if (yOrder instanceof Y.Array) {
        (yOrder as Y.Array<string>).push([placement.id]);
      }
    });
  }

  /** Tiled object ids are never reused, so allocation runs off the doc's
   *  shared counter (peers allocate from the same sequence) lifted above
   *  every id currently in use. Mirrors the save-time fallback in
   *  tmjBuilder, which still covers placements that arrived without one. */
  private allocateTiledObjectId(): number {
    const meta = getDocMeta(this._doc);
    let highestInUse = 0;
    for (const entity of flattenEntityLayers(this._state.layers)) {
      if (entity.tiledObjectId !== undefined) {
        highestInUse = Math.max(highestInUse, entity.tiledObjectId);
      }
    }
    const storedNext = meta.get("nextObjectId");
    const allocated = Math.max(
      typeof storedNext === "number" ? storedNext : 1,
      highestInUse + 1
    );
    this.transactLocal(() => {
      meta.set("nextObjectId", allocated + 1);
    });
    return allocated;
  }

  /** Queue the integrity pass; coalesced, and deferred to a microtask
   *  because it may run inside transaction cleanup, where starting the
   *  repair's own transaction has to wait for the current one to finish. */
  private scheduleEntityIdRepair(): void {
    if (this._repairScheduled) return;
    this._repairScheduled = true;
    const doc = this._doc;
    queueMicrotask(() => {
      this._repairScheduled = false;
      if (this._doc !== doc) return;
      this.repairEntityIdsAndRefs();
    });
  }

  /** Convergent integrity pass over the whole map, run after every change:
   *  backfills missing Tiled object ids, remints duplicates (concurrent
   *  allocation by unsynced peers can collide; the first placement in
   *  document order keeps the id), lifts the shared counter past every id
   *  in use, and rewrites numeric entityRefs to the target's placement id.
   *  Every decision is a pure function of converged doc state, so peers
   *  running it concurrently write identical values and it reaches a
   *  fixpoint instead of oscillating. */
  private repairEntityIdsAndRefs(): void {
    const entities = flattenEntityLayers(this._state.layers);
    const meta = getDocMeta(this._doc);
    const storedNext = meta.get("nextObjectId");
    let highestInUse = 0;
    for (const entity of entities) {
      if (entity.tiledObjectId !== undefined) {
        highestInUse = Math.max(highestInUse, entity.tiledObjectId);
      }
    }
    let counter = Math.max(
      typeof storedNext === "number" ? storedNext : 1,
      highestInUse + 1
    );

    type EntityFix = {
      expectedObjectId?: number;
      newObjectId?: number;
      refFixes?: { propName: string; expected: number; targetId: string }[];
    };
    const fixes = new Map<string, EntityFix>();
    const fixFor = (entityId: string): EntityFix => {
      let fix = fixes.get(entityId);
      if (!fix) {
        fix = {};
        fixes.set(entityId, fix);
      }
      return fix;
    };

    const keeperByObjectId = new Map<number, EntityPlacement>();
    for (const entity of entities) {
      if (
        entity.tiledObjectId === undefined ||
        keeperByObjectId.has(entity.tiledObjectId)
      ) {
        const fix = fixFor(entity.id);
        fix.expectedObjectId = entity.tiledObjectId;
        fix.newObjectId = counter++;
      } else {
        keeperByObjectId.set(entity.tiledObjectId, entity);
      }
    }

    for (const entity of entities) {
      const propNames = entityRefPropNames(entity.type);
      if (!propNames || !entity.properties) continue;
      for (const propName of propNames) {
        const value = entity.properties[propName];
        if (typeof value !== "number" || value === 0) continue;
        const target = keeperByObjectId.get(value);
        if (!target) continue;
        const fix = fixFor(entity.id);
        (fix.refFixes ??= []).push({
          propName,
          expected: value,
          targetId: target.id
        });
      }
    }

    // A pristine doc with no counter yet stays untouched (allocation and the
    // builder both derive the same floor), so repair never dirties it.
    const writeCounter =
      counter !== storedNext &&
      (fixes.size > 0 || typeof storedNext === "number");
    if (fixes.size === 0 && !writeCounter) return;

    this._doc.transact(() => {
      this.forEachYEntityLayer((_yLayer, yEntities) => {
        for (const [entityId, fix] of fixes) {
          const current = yEntities.get(entityId);
          if (!current) continue;
          let next = current;
          // Each fix re-verifies the state it was computed from, so a
          // concurrent peer edit that already resolved it is left alone.
          if (
            fix.newObjectId !== undefined &&
            current.tiledObjectId === fix.expectedObjectId
          ) {
            next = { ...next, tiledObjectId: fix.newObjectId };
          }
          if (fix.refFixes) {
            for (const refFix of fix.refFixes) {
              if (next.properties?.[refFix.propName] !== refFix.expected) {
                continue;
              }
              next = {
                ...next,
                properties: {
                  ...next.properties,
                  [refFix.propName]: refFix.targetId
                }
              };
            }
          }
          if (next !== current) yEntities.set(entityId, next);
        }
      });
      if (writeCounter) {
        meta.set("nextObjectId", counter);
      }
    }, REPAIR_ORIGIN);
  }

  removeEntity(entityId: string): void {
    this.removeEntitiesFromDoc([entityId]);
    const newSelected = this._state.selectedEntityIds.filter(
      (id) => id !== entityId
    );
    this.replaceState({ selectedEntityIds: newSelected });
    this.events.emit("selectionChanged");
    this.events.emit("stateChanged");
  }

  removeEntities(entityIds: string[]): void {
    this.removeEntitiesFromDoc(entityIds);
    this.replaceState({ selectedEntityIds: [] });
    this.events.emit("selectionChanged");
    this.events.emit("stateChanged");
  }

  private removeEntitiesFromDoc(entityIds: string[]): void {
    const ids = new Set(entityIds);
    this.transactLocal(() => {
      this.forEachYEntityLayer((_yLayer, yEntities, yOrder) => {
        const present = entityIds.filter((id) => yEntities.has(id));
        if (present.length === 0) return;
        for (const id of present) yEntities.delete(id);
        if (yOrder) {
          for (let i = yOrder.length - 1; i >= 0; i--) {
            if (ids.has(yOrder.get(i))) yOrder.delete(i, 1);
          }
        }
      });
    });
  }

  /** Skips writes that change nothing: entity drags call this per mousemove,
   *  and a same-value write is still a doc update broadcast to every peer. */
  private updateEntityInDoc(
    entityId: string,
    updater: (entity: EntityPlacement) => EntityPlacement
  ): void {
    this.transactLocal(() => {
      this.forEachYEntityLayer((_yLayer, yEntities) => {
        const current = yEntities.get(entityId);
        if (!current) return;
        const next = updater(current);
        if (shallowRecordEqual(current, next)) return;
        yEntities.set(entityId, next);
      });
    });
  }

  moveEntity(entityId: string, tileX: number, tileY: number): void {
    this.updateEntityInDoc(entityId, (e) => ({ ...e, tileX, tileY }));
  }

  moveEntities(
    moves: { entityId: string; tileX: number; tileY: number }[]
  ): void {
    this.transactLocal(() => {
      for (const { entityId, tileX, tileY } of moves) {
        this.forEachYEntityLayer((_yLayer, yEntities) => {
          const current = yEntities.get(entityId);
          if (!current) return;
          if (current.tileX === tileX && current.tileY === tileY) return;
          yEntities.set(entityId, { ...current, tileX, tileY });
        });
      }
    });
  }

  updateEntityProperties(
    entityId: string,
    properties: Record<string, unknown>
  ): void {
    this.updateEntityInDoc(entityId, (e) => ({
      ...e,
      properties: { ...e.properties, ...properties }
    }));
  }

  updateEntityPropertyArrayElement(
    entityId: string,
    propertyName: string,
    index: number,
    value: unknown
  ): void {
    this.updateEntityInDoc(entityId, (e) => {
      const current = e.properties?.[propertyName];
      if (!Array.isArray(current)) return e;
      if (index < 0 || index >= current.length) return e;
      const next = current.slice();
      next[index] = value;
      return { ...e, properties: { ...e.properties, [propertyName]: next } };
    });
  }

  /** Missing containers along the path are created: number segments make
   *  arrays, string segments make objects. */
  updateEntityPropertyAtPath(
    entityId: string,
    propertyName: string,
    path: (string | number)[],
    value: unknown
  ): void {
    this.updateEntityInDoc(entityId, (e) => ({
      ...e,
      properties: {
        ...e.properties,
        [propertyName]: setValueAtPath(
          e.properties?.[propertyName],
          path,
          value
        )
      }
    }));
  }

  deleteEntityProperty(entityId: string, propertyName: string): void {
    this.updateEntityInDoc(entityId, (e) => {
      if (!e.properties) return e;
      const props = { ...e.properties };
      delete props[propertyName];
      return { ...e, properties: props };
    });
  }

  rotateEntity(entityId: string, angle: number): void {
    this.updateEntityInDoc(entityId, (e) => ({ ...e, angle }));
  }

  resizeEntity(entityId: string, width: number, height: number): void {
    this.updateEntityInDoc(entityId, (e) => ({ ...e, width, height }));
  }

  // --- Polyline mutations ---

  updateEntityPolyline(
    entityId: string,
    points: { x: number; y: number }[],
    closed: boolean
  ): void {
    this.updateEntityInDoc(entityId, (e) => ({
      ...e,
      polyline: closed ? undefined : points,
      polygon: closed ? points : undefined
    }));
  }

  movePolylinePoint(
    entityId: string,
    pointIndex: number,
    x: number,
    y: number
  ): void {
    this.updateEntityInDoc(entityId, (e) => {
      const points = e.polyline
        ? [...e.polyline]
        : e.polygon
          ? [...e.polygon]
          : null;
      if (!points || pointIndex < 0 || pointIndex >= points.length) return e;
      points[pointIndex] = { x, y };
      return {
        ...e,
        polyline: e.polyline ? points : undefined,
        polygon: e.polygon ? points : undefined
      };
    });
  }

  deletePolylinePoint(entityId: string, pointIndex: number): void {
    this.updateEntityInDoc(entityId, (e) => {
      const points = e.polyline
        ? [...e.polyline]
        : e.polygon
          ? [...e.polygon]
          : null;
      if (!points || pointIndex < 0 || pointIndex >= points.length) return e;
      // Require at least 2 points to keep a valid shape
      if (points.length <= 2) return e;
      points.splice(pointIndex, 1);
      return {
        ...e,
        polyline: e.polyline ? points : undefined,
        polygon: e.polygon ? points : undefined
      };
    });
  }

  // --- Tool / palette / selection mutations (session state) ---

  selectTool(tool: EditorTool): void {
    // Remember the last-used member of each grouped toolbar button.
    if (tool === "paint" || tool === "erase" || tool === "fill") {
      this.setUI({ lastTileTool: tool });
    } else if (tool === "entity" || tool === "polyline") {
      this.setUI({ lastShapeTool: tool });
    }
    this.replaceState({
      selectedTool: tool,
      selectedEntityIds: [],
      selectedTileKeys: []
    });
    this.events.emit("toolChanged");
    this.events.emit("selectionChanged");
    this.events.emit("stateChanged");
  }

  selectTileset(tilesetName: string): void {
    this.replaceState({
      selectedTilesetName: tilesetName,
      selectedTileId: null,
      selectedTileRegion: null,
      capturedBrush: null
    });
    this.events.emit("paletteChanged");
    this.events.emit("stateChanged");
  }

  selectTile(tileId: number | null): void {
    this.replaceState({
      selectedTileId: tileId,
      selectedTileRegion: null,
      capturedBrush: null
    });
    this.events.emit("paletteChanged");
    this.events.emit("stateChanged");
  }

  selectTileRegion(region: TileRegion | null): void {
    this.replaceState({
      selectedTileRegion: region,
      selectedTileId: region ? region.startId : null,
      capturedBrush: null
    });
    this.events.emit("paletteChanged");
    this.events.emit("stateChanged");
  }

  /** Set the canvas-captured clone brush (replaces the palette selection). */
  setCapturedBrush(brush: TileStamp[] | null): void {
    this.replaceState(
      brush
        ? {
            capturedBrush: brush,
            selectedTileId: null,
            selectedTileRegion: null
          }
        : { capturedBrush: brush }
    );
    this.events.emit("paletteChanged");
    this.events.emit("stateChanged");
  }

  /** Compose a flip/rotate operation onto the current brush — per-cell flags
   *  and offsets for a captured brush, the global flags otherwise. The result
   *  always stays within Tiled's three flip bits. */
  private applyBrushOperation(operation: OrientationOp): void {
    const brush = this._state.capturedBrush;
    if (brush) {
      let width = 0;
      let height = 0;
      for (const cell of brush) {
        width = Math.max(width, cell.dx + 1);
        height = Math.max(height, cell.dy + 1);
      }
      const opOrientation = operation(IDENTITY_ORIENTATION);
      const next = brush.map((cell) => {
        const moved = transformStampOffset(
          cell.dx,
          cell.dy,
          width,
          height,
          opOrientation
        );
        const flags = operation({
          flipH: !!cell.tile.flipH,
          flipV: !!cell.tile.flipV,
          flipD: !!cell.tile.flipD
        });
        const tile: TilePlacement = {
          gid: cell.tile.gid,
          tilesetName: cell.tile.tilesetName
        };
        if (flags.flipH) tile.flipH = true;
        if (flags.flipV) tile.flipV = true;
        if (flags.flipD) tile.flipD = true;
        return { dx: moved.dx, dy: moved.dy, tile };
      });
      this.replaceState({ capturedBrush: next });
    } else {
      const next = operation({
        flipH: this._state.flipH,
        flipV: this._state.flipV,
        flipD: this._state.flipD
      });
      this.replaceState(next);
    }
    this.events.emit("paletteChanged");
    this.events.emit("stateChanged");
  }

  flipBrushH(): void {
    this.applyBrushOperation(flipOrientationH);
  }

  flipBrushV(): void {
    this.applyBrushOperation(flipOrientationV);
  }

  rotateBrushCW(): void {
    this.applyBrushOperation(rotateOrientationCW);
  }

  rotateBrushCCW(): void {
    this.applyBrushOperation(rotateOrientationCCW);
  }

  selectEntityType(entityType: string | null): void {
    this.replaceState({ selectedEntityType: entityType });
    this.events.emit("paletteChanged");
    this.events.emit("stateChanged");
  }

  selectEntity(entityId: string | null): void {
    this.replaceState({ selectedEntityIds: entityId ? [entityId] : [] });
    this.events.emit("selectionChanged");
    this.events.emit("stateChanged");
  }

  selectEntities(entityIds: string[]): void {
    this.replaceState({ selectedEntityIds: entityIds });
    this.events.emit("selectionChanged");
    this.events.emit("stateChanged");
  }

  toggleEntitySelection(entityId: string): void {
    const cur = this._state.selectedEntityIds;
    const idx = cur.indexOf(entityId);
    const next =
      idx >= 0 ? cur.filter((id) => id !== entityId) : [...cur, entityId];
    this.replaceState({ selectedEntityIds: next });
    this.events.emit("selectionChanged");
    this.events.emit("stateChanged");
  }

  /** Enter (or leave, with null) entity-picker mode for one entityRef prop.
   *  The tool and the selection are deliberately untouched. */
  setEntityRefPick(pick: EntityRefPick | null): void {
    const current = this._state.entityRefPick;
    if (
      current === pick ||
      (current &&
        pick &&
        current.entityId === pick.entityId &&
        current.propName === pick.propName)
    ) {
      return;
    }
    this.replaceState({ entityRefPick: pick });
    this.events.emit("entityRefPickChanged");
    this.events.emit("stateChanged");
  }

  /** Leave pick mode only if it is still this prop's — a field tearing down
   *  after another field took over must not cancel the new pick. */
  clearEntityRefPick(pick: EntityRefPick): void {
    const current = this._state.entityRefPick;
    if (
      current?.entityId === pick.entityId &&
      current.propName === pick.propName
    ) {
      this.setEntityRefPick(null);
    }
  }

  setEntityRefHoverEntityId(entityId: string | null): void {
    if (this._state.entityRefHoverEntityId === entityId) return;
    this.replaceState({ entityRefHoverEntityId: entityId });
    this.events.emit("entityRefPickChanged");
    this.events.emit("stateChanged");
  }

  selectTileKeys(keys: string[]): void {
    this.replaceState({
      selectedTileKeys: keys,
      selectedEntityIds: []
    });
    this.events.emit("selectionChanged");
    this.events.emit("stateChanged");
  }

  // --- View / global toggles (session state) ---

  setCamera(patch: Partial<LevelEditorState["camera"]>): void {
    this.replaceState({ camera: { ...this._state.camera, ...patch } });
    this.events.emit("cameraChanged");
    this.events.emit("stateChanged");
  }

  toggleGrid(): void {
    this.replaceState({ gridVisible: !this._state.gridVisible });
    this.events.emit("toolChanged");
    this.events.emit("stateChanged");
  }

  toggleLayerHighlight(): void {
    this.replaceState({
      highlightActiveLayer: !this._state.highlightActiveLayer
    });
    // layersChanged so the renderer sync effects re-run with the new flag.
    this.events.emit("layersChanged");
    this.events.emit("stateChanged");
  }

  toggleLiveMode(): void {
    this.replaceState({ liveMode: !this._state.liveMode });
    this.events.emit("liveModeChanged");
    this.events.emit("stateChanged");
  }

  toggleSnap(): void {
    this.replaceState({ snapEnabled: !this._state.snapEnabled });
    this.events.emit("toolChanged");
    this.events.emit("stateChanged");
  }

  setLevelName(name: string): void {
    // Y.Map.set writes (and re-dirties the doc) even for identical values.
    if (this._state.levelName === name) return;
    this.transactLocal(() => {
      getDocMeta(this._doc).set("levelName", name);
    });
  }

  setBackgroundColor(color: string): void {
    if (this._state.backgroundColor === color) return;
    this.transactLocal(() => {
      getDocMeta(this._doc).set("backgroundColor", color);
    });
  }

  isDirty(): boolean {
    return this._dirtySinceSave;
  }

  /** Called by the save flow after the document lands in local storage. */
  markSaved(): void {
    this._dirtySinceSave = false;
  }

  notifySaveResult(ok: boolean): void {
    this.events.emit("saveCompleted", { ok });
  }

  /** Identity of the saved map currently open (undefined = never saved).
   *  Strictly local: each peer saves to their own slots. */
  setSavedMapId(savedMapId: string | undefined): void {
    if (this._state.savedMapId === savedMapId) return;
    this.replaceState({ savedMapId });
    this.events.emit("metadataChanged");
    this.events.emit("stateChanged");
  }

  /** Link/unlink the open map to a built-in level. */
  setSourceLevelId(sourceLevelId: string | undefined): void {
    this.transactLocal(() => {
      const meta = getDocMeta(this._doc);
      if (sourceLevelId === undefined) {
        meta.delete("sourceLevelId");
      } else {
        meta.set("sourceLevelId", sourceLevelId);
      }
    });
  }

  /** Ask the toolbar to save the open map (Save button / Ctrl+S). Routed as an
   *  event so the keyboard handler can trigger the same flow as the button,
   *  including the Save As naming dialog for never-saved maps. */
  requestSave(): void {
    this.events.emit("saveRequested");
  }

  // --- Layer mutations ---

  addLayer(name?: string): void {
    const tileCount = this._state.layers.filter(
      (l) => l.kind === "tile"
    ).length;
    const layerName = name ?? `Layer ${tileCount + 1}`;
    const id = this.mintEditorId();
    this.transactLocal(() => {
      getDocLayers(this._doc).set(
        id,
        editorLayerToDoc({
          kind: "tile",
          id,
          name: layerName,
          tiles: new Map(),
          visible: true,
          opacity: 1
        })
      );
      getDocLayerOrder(this._doc).push([id]);
    });
    this.replaceState({ activeLayerId: id });
    this.events.emit("layersChanged");
    this.events.emit("stateChanged");
  }

  addEntityLayer(name?: string): void {
    const entityCount = this._state.layers.filter(
      (l) => l.kind === "entity"
    ).length;
    const layerName = name ?? `Entity Layer ${entityCount + 1}`;
    const id = this.mintEditorId();
    this.transactLocal(() => {
      getDocLayers(this._doc).set(
        id,
        editorLayerToDoc({
          kind: "entity",
          id,
          name: layerName,
          entities: [],
          visible: true
        })
      );
      getDocLayerOrder(this._doc).push([id]);
    });
    this.replaceState({ activeLayerId: id });
    this.events.emit("layersChanged");
    this.events.emit("stateChanged");
  }

  removeLayer(layerId: string): void {
    const layer = this._state.layers.find((l) => l.id === layerId);
    if (!layer) return;
    if (layer.kind === "tile" || layer.kind === "entity") {
      const sameKindCount = this._state.layers.filter(
        (l) => l.kind === layer.kind
      ).length;
      if (sameKindCount <= 1) return;
    }
    this.transactLocal(() => {
      const yLayers = getDocLayers(this._doc);
      const yOrder = getDocLayerOrder(this._doc);
      yLayers.delete(layerId);
      for (let i = yOrder.length - 1; i >= 0; i--) {
        if (yOrder.get(i) === layerId) yOrder.delete(i, 1);
      }
    });
  }

  renameLayer(layerId: string, name: string): void {
    this.setLayerField(layerId, "name", name);
  }

  setActiveLayer(layerId: string): void {
    if (this._state.activeLayerId === layerId) return;
    this.replaceState({ activeLayerId: layerId });
    this.events.emit("layersChanged");
    this.events.emit("stateChanged");
  }

  private setLayerField(layerId: string, key: string, value: unknown): void {
    const yLayer = getDocLayers(this._doc).get(layerId);
    if (!yLayer) return;
    this.transactLocal(() => {
      if (value === undefined) {
        if (yLayer.has(key)) yLayer.delete(key);
      } else {
        yLayer.set(key, value);
      }
    });
  }

  setLayerVisible(layerId: string, visible: boolean): void {
    this.setLayerField(layerId, "visible", visible);
  }

  setLayerOpacity(layerId: string, opacity: number): void {
    const layer = this._state.layers.find((l) => l.id === layerId);
    if (!layer || (layer.kind !== "tile" && layer.kind !== "image")) return;
    this.setLayerField(layerId, "opacity", opacity);
  }

  setLayerParallax(
    layerId: string,
    parallaxx?: number,
    parallaxy?: number
  ): void {
    const layer = this._state.layers.find((l) => l.id === layerId);
    if (!layer || (layer.kind !== "tile" && layer.kind !== "image")) return;
    const yLayer = getDocLayers(this._doc).get(layerId);
    if (!yLayer) return;
    this.transactLocal(() => {
      if (parallaxx === undefined) {
        if (yLayer.has("parallaxx")) yLayer.delete("parallaxx");
      } else {
        yLayer.set("parallaxx", parallaxx);
      }
      if (parallaxy === undefined) {
        if (yLayer.has("parallaxy")) yLayer.delete("parallaxy");
      } else {
        yLayer.set("parallaxy", parallaxy);
      }
    });
  }

  updateLayerProperty(
    layerId: string,
    property: { name: string; type: string; value: unknown }
  ): void {
    const yLayer = getDocLayers(this._doc).get(layerId);
    if (!yLayer) return;
    const existing = yLayer.get("tiledProperties");
    const props = Array.isArray(existing) ? [...existing] : [];
    const idx = props.findIndex((p) => p.name === property.name);
    if (idx === -1) {
      props.push(property);
    } else {
      props[idx] = property;
    }
    this.setLayerField(layerId, "tiledProperties", props);
  }

  deleteLayerProperty(layerId: string, propertyName: string): void {
    const yLayer = getDocLayers(this._doc).get(layerId);
    if (!yLayer) return;
    const existing = yLayer.get("tiledProperties");
    if (!Array.isArray(existing)) return;
    const filtered = existing.filter((p) => p.name !== propertyName);
    this.setLayerField(
      layerId,
      "tiledProperties",
      filtered.length > 0 ? filtered : undefined
    );
  }

  reorderLayer(layerId: string, newIndex: number): void {
    const order = this._state.layers.map((l) => l.id);
    const currentIndex = order.indexOf(layerId);
    if (currentIndex < 0) return;
    const moveDir =
      newIndex < currentIndex ? -1 : newIndex > currentIndex ? 1 : 0;
    if (moveDir === 0) return;
    let newOrder: string[];
    if (moveDir === 1) {
      newOrder = [
        ...order.slice(0, currentIndex),
        ...order.slice(currentIndex + 1, newIndex),
        layerId,
        ...order.slice(newIndex)
      ];
    } else {
      newOrder = [
        ...order.slice(0, newIndex),
        layerId,
        ...order.slice(newIndex, currentIndex),
        ...order.slice(currentIndex + 1)
      ];
    }
    this.transactLocal(() => {
      const yOrder = getDocLayerOrder(this._doc);
      if (yOrder.length > 0) yOrder.delete(0, yOrder.length);
      yOrder.insert(0, newOrder);
    });
  }

  // --- Clear / load ---

  clearAll(levelName?: string): void {
    const mint = () => this.mintEditorId();
    const tileLayer: EditorLayer = {
      kind: "tile",
      id: mint(),
      name: "Main",
      tiles: new Map(),
      visible: true,
      opacity: 1
    };
    const entityLayer: EditorLayer = {
      kind: "entity",
      id: mint(),
      name: "Entities",
      entities: [],
      visible: true
    };
    // A cleared map is a new level with a fresh identity, so like a load it
    // is not undoable: a layers-only undo would restore the map while
    // silently keeping the new identity and wiped metadata.
    this._doc.transact(() => {
      populateDoc(this._doc, {
        layers: [tileLayer, entityLayer],
        levelName: levelName ?? this._state.levelName,
        backgroundColor: this._state.backgroundColor,
        tilesets: this._state.externalTilesets
      });
    }, DOC_LOAD_ORIGIN);
    this._undoManager.clear();
    this._changedSinceUndoPoint = false;
    this._dirtySinceSave = false;
    this.replaceState({
      activeLayerId: tileLayer.id,
      selectedEntityIds: [],
      selectedTileKeys: [],
      savedMapId: undefined
    });
    this.events.emit("layersChanged");
    this.events.emit("selectionChanged");
    this.events.emit("metadataChanged");
    this.events.emit("stateChanged");
  }

  /** Register one or more tilesets at runtime (e.g. from a TSJ+PNG drop). */
  addExternalTilesets(tilesets: Record<string, TilesetDefinitionAPI>): void {
    if (Object.keys(tilesets).length === 0) return;
    this.transactLocal(() => {
      const yTilesets = getDocTilesets(this._doc);
      for (const [name, def] of Object.entries(tilesets)) {
        yTilesets.set(name, def);
      }
    });
  }

  loadState(args: {
    layers: EditorLayer[];
    levelName?: string;
    backgroundColor?: string;
    externalTilesets?: Record<string, TilesetDefinitionAPI>;
    sourceLevelId?: string;
    savedMapId?: string;
    levelUuid?: string;
    mapProperties?: TiledProperty[];
    nextObjectId?: number;
    unknownTilesetSources?: Record<string, string>;
  }): void {
    // Tilesets registered earlier in the session survive the load; without
    // them a reopened save sheds its custom tileset definitions.
    const externalTilesets = {
      ...this._state.externalTilesets,
      ...args.externalTilesets
    };
    const populateArgs: PopulateDocArgs = {
      layers: args.layers,
      levelName: args.levelName ?? this._state.levelName,
      backgroundColor: args.backgroundColor ?? DEFAULT_MAP_BACKGROUND_COLOR,
      sourceLevelId: args.sourceLevelId,
      levelUuid: args.levelUuid,
      tilesets: {
        ...collectUsedTilesets(args.layers, externalTilesets),
        ...externalTilesets
      },
      mapProperties: args.mapProperties,
      nextObjectId: args.nextObjectId,
      unknownTilesetSources: args.unknownTilesetSources
    };
    if (this._sharedDocMode) {
      // In a room the doc is shared: repopulate it in place so the level
      // switch syncs to peers through the same continuous history.
      this._doc.transact(() => {
        populateDoc(this._doc, populateArgs);
      }, DOC_LOAD_ORIGIN);
      this._undoManager.clear();
      this._changedSinceUndoPoint = false;
      this._dirtySinceSave = false;
      this.replaceState({ savedMapId: args.savedMapId });
      this.rebuildFullViewFromDoc();
      return;
    }
    const doc = new Y.Doc();
    doc.transact(() => {
      populateDoc(doc, populateArgs);
    }, DOC_LOAD_ORIGIN);
    this.replaceState({ savedMapId: args.savedMapId });
    this.replaceDoc(doc);
  }

  // --- Undo / redo ---

  canUndo(): boolean {
    return this._undoManager.canUndo();
  }

  canRedo(): boolean {
    return this._undoManager.canRedo();
  }

  /** Mark an undo boundary: the next document change starts a new undo unit.
   *  Called at gesture start, exactly where the old snapshot push lived. */
  pushUndo(): void {
    this._undoManager.stopCapturing();
    this._changedSinceUndoPoint = false;
    const stack = this._undoManager.undoStack;
    this._undoPointBoundary = stack[stack.length - 1] ?? null;
  }

  undo(): void {
    if (!this._undoManager.canUndo()) return;
    this._undoManager.undo();
    this.replaceState({
      selectedEntityIds: [],
      selectedTileKeys: []
    });
    this.events.emit("selectionChanged");
    this.events.emit("undoChanged");
    this.events.emit("stateChanged");
  }

  /** Roll back the in-progress gesture (everything since the last pushUndo),
   *  e.g. Escape mid-polyline, discarding the redo entries the rollback
   *  creates. Yjs undo() keeps popping until some item performs a change (a
   *  peer may have already deleted everything the gesture inserted, or a
   *  mid-gesture toolbar undo may have popped it), so prior gestures are
   *  fenced off the stack before undoing. */
  cancelToLastUndoPoint(): void {
    if (!this._changedSinceUndoPoint) return;
    const stack = this._undoManager.undoStack;
    const boundaryIndex = this._undoPointBoundary
      ? stack.indexOf(this._undoPointBoundary) + 1
      : 0;
    // A recorded boundary that is no longer on the stack was itself popped,
    // taking every gesture item above it with it: nothing left to revert.
    if (!this._undoPointBoundary || boundaryIndex > 0) {
      const fenced = stack.splice(0, boundaryIndex);
      while (this._undoManager.canUndo()) {
        this._undoManager.undo();
      }
      stack.unshift(...fenced);
    }
    this._undoManager.clear(false, true);
    this._changedSinceUndoPoint = false;
    this.replaceState({
      selectedEntityIds: [],
      selectedTileKeys: []
    });
    this.events.emit("selectionChanged");
    this.events.emit("undoChanged");
    this.events.emit("stateChanged");
  }

  redo(): void {
    if (!this._undoManager.canRedo()) return;
    this._undoManager.redo();
    this.replaceState({
      selectedEntityIds: [],
      selectedTileKeys: []
    });
    this.events.emit("selectionChanged");
    this.events.emit("undoChanged");
    this.events.emit("stateChanged");
  }
}

// ===========================================================================
// Singleton instance
// ===========================================================================

export const levelEditorStore = new LevelEditorStore();

// Expose on window in dev mode for MCP/console debugging.
if (typeof window !== "undefined") {
  (window as { __levelEditorStore__?: LevelEditorStore }).__levelEditorStore__ =
    levelEditorStore;
}
