import shortid from "shortid";
import { Vector2 } from "three";

import { ControlEventTypes, ControlsAPI } from "src/api/controls";
import { BaseEntityType } from "src/api/entity";
import { SpellCtx } from "src/api/spells";
import { createTypedEventEmitter } from "src/api/util";
import { Level } from "src/engine/level/Level";
import { LevelLoader } from "src/engine/level/LevelLoader";
import { Dummy } from "src/entities/enemies/robots/Dummy";
import { Player } from "src/entities/player/Player";
import { ManaSpark } from "src/entities/spells/spark/ManaSpark";
import { isTerrain } from "src/entities/terrain/BaseTerrain";
import { selectMana } from "src/redux/status/selectors";
import { directSetHealthAndMana } from "src/redux/status/slice";
import { store } from "src/redux/store";
import { SpellRuntime } from "src/scripting/runtime/SpellRuntime";
import { nextAnimationFrame } from "src/util/animationPromise";

export type CasterType = "ManaSpark" | "Player";

/**
 * Lightweight ControlsAPI for the spell tester. Provides mouse
 * cursor tracking and click events so spells can read cursor
 * position and respond to clicks.
 */
class SpellTesterControls implements ControlsAPI<BaseEntityType> {
  public events = createTypedEventEmitter<ControlEventTypes>();
  public cursorActive = true;
  public cursorScreenPosition?: Vector2;
  public cursorScenePosition?: Vector2;
  public cursorEntity?: BaseEntityType;

  setCursorScreenPosition(position: Vector2) {
    this.cursorScreenPosition = position;
  }
  setCursorScenePosition(position: Vector2) {
    this.cursorScenePosition = position;
  }
  setCursorEntity(entity?: BaseEntityType) {
    this.cursorEntity = entity;
  }
  getCurrentHorizontalMotion(): number {
    return 0;
  }
}

export class SpellTesterController {
  public level?: Level;
  public spellRuntime?: SpellRuntime;
  public caster?: ManaSpark | Player;
  public casterType: CasterType = "ManaSpark";
  public controls = new SpellTesterControls();
  public events = createTypedEventEmitter<{
    levelReady: void;
    frame: number;
    casterSpawned: void;
  }>();

  private destroyed = false;
  private levelLoader = new LevelLoader("SpellTester");
  private activeCtx?: SpellCtx;

  constructor() {
    this._initialLoad();
  }

  async _initialLoad() {
    this.level = await this.levelLoader.load();
    this.level.scene.background = null;

    // Wire up controls so entities can receive input
    this.level.attachControls(this.controls);

    this.spellRuntime = new SpellRuntime().setup();
    this.spellRuntime.setStore(store);
    this.spellRuntime.setLevel(this.level);
    this.level.setSpellApi(this.spellRuntime);

    this.resetCaster();
    this.events.emit("levelReady");
    this._timeLoop();
  }

  async _timeLoop() {
    const physicsFps = 120;
    const fpsMs = 1000 / physicsFps;
    let remainingMs = 0;
    let lastTime = performance.now();
    while (!this.destroyed) {
      const currTime = performance.now();
      const deltaMs = currTime - lastTime;
      lastTime = currTime;

      remainingMs += deltaMs;
      if (remainingMs > physicsFps * 4) {
        remainingMs = 0;
      }
      let maxIters = 4;
      while (remainingMs > 0 && maxIters-- > 0) {
        remainingMs -= fpsMs;
        this.level?.step(fpsMs);
      }

      this.events.emit("frame", deltaMs);
      await nextAnimationFrame();
    }
  }

  resetCaster() {
    if (!this.level) return;

    // Remove existing caster
    if (this.caster) {
      this.level.removeEntity(this.caster.id);
      this.caster = undefined;
    }

    // Remove all non-terrain entities (spell projectiles, etc.)
    for (const entity of this.level.getEntities().values()) {
      if (isTerrain(entity)) continue;
      this.level.removeEntity(entity.id);
    }

    // Find center of level
    const worldBounds = this.level.getWorldBoundaries();
    const center = new Vector2();
    worldBounds.getCenter(center);

    if (this.casterType === "Player") {
      const player = new Player({
        position: { x: center.x, y: center.y, z: 0 },
        disableCamera: true
      });
      this.level.addEntity(player);
      this.caster = player;
    } else {
      const spark = new ManaSpark({
        id: shortid(),
        type: "ManaSpark",
        position: { x: center.x, y: center.y, z: 0 },
        size: { width: 0.5, height: 0.5 },
        polygon: [
          new Vector2(-1, -1),
          new Vector2(1, -1),
          new Vector2(1, 1),
          new Vector2(-1, 1)
        ],
        polyline: [
          new Vector2(-1, -1),
          new Vector2(1, -1),
          new Vector2(1, 1),
          new Vector2(-1, 1)
        ],
        mana: 100
      });
      this.level.addEntity(spark);
      this.caster = spark;
    }

    // Reset player health and mana
    store.dispatch(directSetHealthAndMana([50, 100]));

    // Spawn dummies near the boundary walls
    const leftDummy = new Dummy({
      position: { x: center.x - 6, y: center.y, z: 0 },
      facingRight: true
    });
    this.level.addEntity(leftDummy);

    const rightDummy = new Dummy({
      position: { x: center.x + 6, y: center.y, z: 0 },
      facingRight: false
    });
    this.level.addEntity(rightDummy);

    this.events.emit("casterSpawned");
  }

  getMana(): number | null {
    if (!this.caster) return null;
    if (this.caster instanceof ManaSpark) {
      return this.caster.mana;
    }
    return selectMana(store.getState());
  }

  setCasterType(type: CasterType) {
    if (this.casterType === type) return;
    this.casterType = type;
    this.resetCaster();
  }

  async runCode(code: string): Promise<SpellCtx | null> {
    if (!this.spellRuntime || !this.caster) return null;

    // Terminate any active spell context
    if (this.activeCtx && !this.activeCtx.destroyed) {
      this.activeCtx.terminate();
    }

    this.resetCaster();

    const ctx = await this.spellRuntime.run(code, this.caster.id);
    this.activeCtx = ctx;
    return ctx;
  }

  stopCode() {
    if (this.activeCtx && !this.activeCtx.destroyed) {
      this.activeCtx.terminate();
      this.activeCtx = undefined;
    }
  }

  destroy() {
    this.destroyed = true;
    if (this.activeCtx && !this.activeCtx.destroyed) {
      this.activeCtx.terminate();
    }
    this.spellRuntime?.teardown();
    this.level?.detachControls();
    this.level?.dispose();
  }
}
