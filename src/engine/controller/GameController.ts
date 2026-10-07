import { Unsubscribe } from "redux";
import { Vector3 } from "three";

import { ControlEvents } from "src/api/controls";
import { EntityLevelEvents, EntityLevelSnapshot } from "src/api/entity";
import { HotKeys } from "src/api/hotkeys";
import { createTypedEventEmitter } from "src/api/util";
import { tutorialSingleton } from "src/components/tutorials/TutorialController";
import { GameContext } from "src/engine/context/GameContext";
import { Level } from "src/engine/level/Level";
import { LevelLoader, LevelLoaderAPI } from "src/engine/level/LevelLoader";
import { entityClassRegistry } from "src/entities/allEntities";
import { DebugRayRenderer } from "src/entities/dev/DebugRayRenderer";
import { allItemDefinitionsByType } from "src/items/allItems";
import {
  selectDevFrameSteppingEnabled,
  selectDevPhysicsOverlayEnabled
} from "src/redux/dev/selectors";
import {
  selectActiveAllies,
  selectGamePaused,
  selectIsDemoMode,
  selectLevelId
} from "src/redux/gameState/selectors";
import {
  gotoLevelComplete,
  markLevelLoadCompleted
} from "src/redux/gameState/slice";
import {
  selectEquippedWeapon,
  selectHotKeyMap
} from "src/redux/inventory/selectors";
import {
  HotKeyAssignment,
  consumeConsumableItem,
  equipWeapon
} from "src/redux/inventory/slice";
import { selectScriptById } from "src/redux/scriptLibrary/selectors";
import { addItems } from "src/redux/shared/actions";
import { selectCutsceneLocked, selectIsDead } from "src/redux/status/selectors";
import { AppStore } from "src/redux/store";
import {
  CodingChallengeProvider,
  codingChallengeProviderSingleton
} from "src/scripting/challenges/ChallengeProvider";
import { SpellRuntime } from "src/scripting/runtime/SpellRuntime";
import { clearSingleton, registerSingleton } from "src/singletons/Singletons";
import { isDevMode } from "src/util/devUtil";

import { centralAssetManager } from "../asset/AssetManager";
import { OverlayProvider } from "../overlay/OverlayProvider";
import { centralSoundManager } from "../sound/Sound";
import { getPlayer } from "../util/levelUtil";
import {
  GameControllerAPI,
  GameControllerEventTypes,
  GameControllerEvents
} from "./GameControllerAPI";
import { GameControls } from "./GameControls";
import { PersistenceController } from "./Persistence";

export class GameController implements GameControllerAPI {
  public level?: Level;
  public nextLevel?: Level;
  public levelTransitionProgress?: number;
  public ctx: GameContext = {};
  public events = createTypedEventEmitter<GameControllerEventTypes>();
  public spellRuntime?: SpellRuntime;
  public codingChallenges: CodingChallengeProvider =
    codingChallengeProviderSingleton;
  public controls = new GameControls();
  public overlays = new OverlayProvider();
  protected loadSave?: PersistenceController;
  protected lastCleanupTime: number = 0;
  protected gameplaySuspended: boolean = false;
  protected nextLevelLoader?: LevelLoaderAPI;
  protected loadingLevelId?: string;
  protected store?: AppStore;
  protected unsubscribe?: Unsubscribe;
  protected destroyed = false;
  protected physicsFps = 120;
  protected physicsTimestep = 1 / this.physicsFps;
  protected remainingMsToSimulate = 0;
  protected lastTime: number = 0;
  protected lastRenderTime = 0;
  protected wereDevEntitiesEnabled = false;
  constructor() {
    this._storeUpdate = this._storeUpdate.bind(this);
    this._animationFrame = this._animationFrame.bind(this);
    this.handleHotKey = this.handleHotKey.bind(this);
    this.handleFrameAdvance = this.handleFrameAdvance.bind(this);
    this._attachControlListeners();
    this.events.setMaxListeners(60);
    codingChallengeProviderSingleton.setGetLevel(() => this.level ?? null);
  }
  attachToStore(store: AppStore) {
    if (this.store) return this;
    this.store = store;
    this.ctx.store = store;
    tutorialSingleton.setupStore(store);
    registerSingleton("store", store);
    this.loadSave = new PersistenceController(this.store);
    this.controls.mountStore(store);
    this.unsubscribe = store.subscribe(this._storeUpdate);
    this._storeUpdate();
    return this;
  }
  getStore() {
    return this.store;
  }
  detachFromStore() {
    this.unsubscribe?.();
    this.store = undefined;
    this.ctx.store = undefined;
    return this;
  }
  createSpellRuntime() {
    if (this.spellRuntime) this.spellRuntime.teardown();
    this.spellRuntime = new SpellRuntime().setup();
    registerSingleton("spells", this.spellRuntime);
    if (this.store) this.spellRuntime.setStore(this.store);
    tutorialSingleton.setupSpells(this.spellRuntime);
    return this;
  }
  setupCodingChallenges() {
    if (this.spellRuntime && this.store)
      this.codingChallenges.setup(this.spellRuntime, this.store);
    return this;
  }
  destroy() {
    this.controls.unmountStore();
    this.controls.unmountDom();
    this.detachFromStore();
    this._unloadLevel();
    this.spellRuntime?.teardown();
    this.spellRuntime = undefined;
    clearSingleton("spells");
    clearSingleton("store");
    this.destroyed = true;
  }
  beginRenderCycle() {
    if (isDevMode()) {
      (window as any).__controller__ = this;
    }
    this.events.emit(GameControllerEvents.RenderStart);
    this._animationFrame();
  }
  stepOneFrame() {
    if (!this.level) return;
    const fpsMs = 1000 / this.physicsFps;
    this.level.step(fpsMs);
    this.events.emit(GameControllerEvents.CameraSizing);
    this.level.postStep(fpsMs);
    this.events.emit(GameControllerEvents.RenderFrame, fpsMs);
  }
  protected _storeUpdate() {
    const state = this.store?.getState();
    if (state === undefined) return;
    const levelId = selectLevelId(state);
    if (levelId !== null) {
      const currentLevelId =
        this.loadingLevelId ??
        this.nextLevelLoader?.levelId ??
        this.nextLevel?.id ??
        this.level?.id;
      if (levelId !== currentLevelId) {
        if (this.level) {
          const levelSnapshot = this.level.getFullSnapshot();
          this.loadSave?.setLevelSnapshot(this.level.id, levelSnapshot);
        }
        this._loadLevel(levelId);
      }
    } else {
      this._unloadLevel();
    }
    const paused = selectGamePaused(state);
    if (paused !== this.gameplaySuspended) this.gameplaySuspended = paused;
    const dead = selectIsDead(state);
    if (dead) this.spellRuntime?.killAllRunningSpells();

    // Keep overlays up to date.
    const devEntitiesEnabled = selectDevPhysicsOverlayEnabled(state);
    if (devEntitiesEnabled !== this.wereDevEntitiesEnabled) {
      if (devEntitiesEnabled) {
        for (const PotentialDevToolClass of entityClassRegistry.getAll()) {
          if (PotentialDevToolClass.flags?.includes("dev")) {
            this.level?.addEntity(
              new PotentialDevToolClass({
                type: PotentialDevToolClass.type,
                position: new Vector3()
              })
            );
          }
        }
      } else {
        for (const entity of this.level?.getEntities().values() ?? []) {
          const clazz = entityClassRegistry.get(entity.type);
          if (clazz?.flags?.includes("dev")) {
            this.level?.removeEntity(entity.id);
          }
        }
      }
    }
    this.wereDevEntitiesEnabled = devEntitiesEnabled;
  }
  protected async _loadLevel(levelId: string) {
    // Pevent re-entrant behavior from Redux calls fired within this process.
    if (this.loadingLevelId !== undefined) {
      return;
    }
    this.loadingLevelId = levelId;
    // If we flagged a pending load state, we will alter behavior to pass
    // the snapshot to the level loader.
    const loadStateRequired =
      !!this.store?.getState().gameState.levelLoadRequired;

    if (loadStateRequired) this.loadSave?.load(false);
    const levelSnapshot: EntityLevelSnapshot | null =
      this.loadSave?.getLevelSnapshot(levelId) ?? null;

    this.nextLevelLoader = new LevelLoader(levelId);

    this.events.emit(GameControllerEvents.LoadLevelStart);
    this.nextLevelLoader.on("progress", (loader) => {
      const progress = loader.resourceProgress;
      this.events.emit(GameControllerEvents.LoadLevelProgress, progress);
    });
    if (levelSnapshot) this.nextLevelLoader.setSnapshot(levelSnapshot);

    const nextLevel = await this.nextLevelLoader.load();

    // Inject dev tooling into the level.
    const storeState = this.store?.getState();
    if (storeState && selectDevPhysicsOverlayEnabled(storeState)) {
      this.wereDevEntitiesEnabled = true;
      nextLevel.addEntity(new DebugRayRenderer({ position: new Vector3() }));
      for (const PotentialDevToolClass of entityClassRegistry.getAll()) {
        if (PotentialDevToolClass.flags?.includes("dev")) {
          await this.nextLevelLoader.preloadEntityType(
            PotentialDevToolClass.type
          );
          nextLevel.addEntity(
            new PotentialDevToolClass({
              type: PotentialDevToolClass.type,
              position: new Vector3()
            })
          );
        }
      }
    }

    this.nextLevelLoader = undefined;
    this.events.emit(GameControllerEvents.LoadLevelComplete);
    if (this.destroyed) return;

    // Wire up the context used by entities.
    nextLevel.setCtx({
      spells: this.spellRuntime,
      codingChallenges: this.codingChallenges,
      overlayProvider: this.overlays,
      saveStore: {
        saveGame: () => this.save()
      },
      registry: {
        entities: entityClassRegistry
      }
    });
    
    // Wire the level up to the spell API.
    nextLevel.setSpellApi(this.spellRuntime);

    // Fire a preload event to allow entities in the level
    // to potentially create extensions - like the player!

    // Perform a single step in the physics world prior to emitting PreloadComplete
    // so that the collisions are available prior to PreloadComplete. Otherwise,
    // shape queries won't work!
    nextLevel.world.step();

    nextLevel.emit(EntityLevelEvents.PreloadComplete);
    nextLevel.fullyPreLoaded = true;

    this.nextLevel = nextLevel;
    this._transitionToNextLevel();

    // If we flagged a pending load state, update redux with load completed.
    if (loadStateRequired) {
      this.store?.dispatch(markLevelLoadCompleted());
    }
    this.loadingLevelId = undefined;
  }
  protected async _transitionToNextLevel() {
    this.levelTransitionProgress = 0;

    // music (for crossfade).
    const prevMusic = this.level?.defaultMusic;
    const prevMusicGain = this.level?.defaultMusicGain;
    const nextMusic = this.nextLevel?.defaultMusic;
    const nextMusicGain = this.nextLevel?.defaultMusicGain;

    const onFrame = (deltaMs: number) => {
      if (this.levelTransitionProgress === undefined) return;
      this.levelTransitionProgress += deltaMs * 0.001;
      if (this.levelTransitionProgress >= 1) {
        this.events.off(GameControllerEvents.RenderFrame, onFrame);
        this.level?.detachControls();
        // Prevent dangling event listeners from entities from persisting.
        // This is why non-entities should NOT subscribe to control events.
        // TODO(fix this);
        this.controls.events.removeAllListeners();
        this._attachControlListeners();
        this.level?.dispose();
        this.level = this.nextLevel;
        this.ctx.level = this.level;
        if (isDevMode()) {
          (window as any).__level__ = this.level;
          (window as any).__controller__ = this;
        }
        this.nextLevel = undefined;
        this.levelTransitionProgress = undefined;

        this.events.emit(GameControllerEvents.TransitionToLevelComplete);
        centralAssetManager.unloadUnusedAssets();

        this.spellRuntime?.setLevel(this.level);
        this.level?.attachControls(this.controls);
        this.store?.dispatch(gotoLevelComplete());
        this._applyDemoModeSetup();

        // Wire the level up to the tutorials singleton.
        if (this.level) tutorialSingleton.setupLevel(this.level);

        if (nextMusic !== prevMusic) {
          if (nextMusic !== undefined) {
            centralSoundManager.music.play(nextMusic, nextMusicGain);
          } else {
            centralSoundManager.music.stop();
          }
        } else {
          if (nextMusicGain !== prevMusicGain) {
            centralSoundManager.music.setVolume(nextMusicGain ?? 1);
          }
        }
      } else {
        this.nextLevel?.emit(EntityLevelEvents.TransitionStep);
      }
    };

    this.events.on(GameControllerEvents.RenderFrame, onFrame);
    this.events.emit(GameControllerEvents.TransitionToLevelStart);
  }
  private _demoModeApplied = false;
  protected _applyDemoModeSetup() {
    if (this._demoModeApplied) return;
    const state = this.store?.getState();
    if (!state || !selectIsDemoMode(state)) return;
    this._demoModeApplied = true;
    if (this.level?.demoItems !== undefined) {
      for (const item of this.level.demoItems) {
        // addItems routes by item type — spells register in the script library
        // and inventory; everything else goes to its appropriate bucket.
        this.store?.dispatch(addItems({ item, hotkey: true }));
      }
    }

    if (!this.level) return;

    const player = getPlayer(this.level);
    if (!player) return;

    const activeAllyTypes = selectActiveAllies(state);

    const entityRegistry = this.level.ctx?.registry?.entities;
    if (!entityRegistry) return;

    const activeAllyClasses = activeAllyTypes
      .map((allyType) => entityRegistry.get(allyType))
      .filter((possibleAllyClass) => !!possibleAllyClass);

    for (const allyClass of activeAllyClasses) {
      const ally = new allyClass({
        position: player.position.clone(),
        hotSpawnedAtSave: true
      });

      this.level.addEntity(ally);
    }
  }
  protected _unloadLevel() {
    this.level?.dispose();
    this.nextLevel?.dispose();
    this.level = undefined;
    this.nextLevel = undefined;
    this.nextLevelLoader = undefined;
    this.levelTransitionProgress = undefined;
    if (isDevMode()) {
      (window as any).__level__ = undefined;
      (window as any).__controller__ = undefined;
    }
  }
  protected _animationFrame() {
    if (this.destroyed) return;
    // Queue next frame.
    requestAnimationFrame(this._animationFrame);

    const lastRenderTime = this.lastRenderTime ?? performance.now();
    const now = performance.now();
    this.lastRenderTime = now;
    const gameDeltaMs = now - lastRenderTime;

    const gameRunning =
      !this.gameplaySuspended && !this.nextLevel && !this.nextLevelLoader;

    if (gameRunning) {
      if (this.remainingMsToSimulate > this.physicsFps * 4) {
        this.remainingMsToSimulate = 0;
      }
      const fpsMs = 1000 / this.physicsFps;
      this.remainingMsToSimulate += gameDeltaMs;
      let maxIters = 4;
      while (this.remainingMsToSimulate > 0 && maxIters-- > 0) {
        this.remainingMsToSimulate -= fpsMs;
        this.level?.step(fpsMs);
        this.events.emit(GameControllerEvents.CameraSizing);
        this.level?.postStep(fpsMs);
      }
    } else {
      this.remainingMsToSimulate = 0;
      this.events.emit(GameControllerEvents.CameraSizing);
      this.level?.postStep();
      this.nextLevel?.postStep();
    }

    this.events.emit(GameControllerEvents.RenderFrame, gameDeltaMs);
    this.overlays.renderFrame(gameDeltaMs);

    // Keep spell API from accuring old contexts forever.
    if (now - this.lastCleanupTime > 2000) {
      this.spellRuntime?.cleanupDereferencedContexts();
      this.lastCleanupTime = now;
    }
  }
  handleFrameAdvance() {
    if (!isDevMode()) return;
    const state = this.store?.getState();
    if (!state || !selectDevFrameSteppingEnabled(state)) return;
    this.stepOneFrame();
  }
  protected _attachControlListeners() {
    this.controls.events.on(ControlEvents.HotKey, this.handleHotKey);
    this.controls.events.on(
      ControlEvents.FrameAdvance,
      this.handleFrameAdvance
    );
  }
  // This seems like a decent place to put this, but not a perfect one.
  handleHotKey(key: HotKeys) {
    if (!this.store || !this.spellRuntime) return;
    const state = this.store.getState();
    if (selectCutsceneLocked(state)) return;
    const inventorySlots = selectHotKeyMap(state);
    const hotKeyAssignment = inventorySlots[key];
    if (!hotKeyAssignment) return;
    this.handleHotKeyAssignment(hotKeyAssignment);
  }
  handleHotKeyAssignment(hotKeyAssignment: HotKeyAssignment) {
    if (!this.store || !this.spellRuntime) return;
    const state = this.store.getState();
    if (!hotKeyAssignment) return;
    if (hotKeyAssignment.type === "spell") {
      const script = selectScriptById(state, hotKeyAssignment.scriptId);
      if (!script) return;
      const runningSpell = this.spellRuntime.getSavedRunning(script.id);
      if (runningSpell) {
        runningSpell.destroy();
      } else {
        const player = this.level ? getPlayer(this.level) : null;
        this.spellRuntime.run(script.code, player?.id, null, script.id);
      }
      return;
    }
    if (hotKeyAssignment.type === "weapon") {
      const isEquipped =
        selectEquippedWeapon(state) === hotKeyAssignment.weaponType;
      if (isEquipped) {
        this.store.dispatch(equipWeapon(null));
      } else {
        this.store.dispatch(equipWeapon(hotKeyAssignment.weaponType));
      }
      return;
    }
    if (hotKeyAssignment.type === "consumable") {
      const itemDef = allItemDefinitionsByType[hotKeyAssignment.itemType];
      if (!itemDef) return;
      itemDef.consume?.({
        type: hotKeyAssignment.itemType,
        variant: hotKeyAssignment.itemVariant
      });
      this.store.dispatch(
        consumeConsumableItem({
          itemType: hotKeyAssignment.itemType,
          itemVariant: hotKeyAssignment.itemVariant
        })
      );
    }
  }
  save() {
    this.loadSave?.save(this.level);
  }
  canLoad() {
    if (!this.loadSave) return false;
    return this.loadSave.checkLoadable();
  }
  async load(options?: { preserveLayout?: boolean }) {
    if (!this.loadSave) return;
    this._unloadLevel();
    this.loadSave.load(true, options);
  }
  restartLevel() {
    const levelId = this.level?.id;
    if (!levelId) return;
    this._unloadLevel();
    this._loadLevel(levelId);
  }
}
