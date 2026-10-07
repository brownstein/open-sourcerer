import { Vector2 } from "three";

import { ControlEvents, ControlsAPI } from "src/api/controls";
import { BaseEntityType, EntityLevelEvents, LevelAPI } from "src/api/entity";
import { DeferredEmitter } from "src/engine/util/deferredEmitter";
import { AimHelper, ProjectileGuideConfig } from "src/entities/ui/AimHelper";
import { TrackedEntityRuntimeAPI } from "src/scripting/runtime/SpellEntitySyncAPI";
import {
  SpellRuntimeModuleCtxAPI,
  SpellRuntimeModuleEvents
} from "src/scripting/runtime/SpellRuntimeAPI";

export type DeferredAimEmitter = DeferredEmitter<
  {
    aim: Vector2;
    cancel: void;
  },
  "aim",
  "cancel"
>;

export class RuntimeAimHelper {
  static _shared_symbol_ = Symbol();
  static fromContext(ctx: SpellRuntimeModuleCtxAPI): RuntimeAimHelper {
    const extant = ctx.sharedNativeResources.get(this._shared_symbol_);
    if (extant) return extant as RuntimeAimHelper;
    const created = new RuntimeAimHelper(ctx);
    ctx.sharedNativeResources.set(RuntimeAimHelper._shared_symbol_, created);
    return created;
  }

  private ctx: SpellRuntimeModuleCtxAPI;
  private aimOperationsInProgress: DeferredAimEmitter[] = [];
  private trackedAim?: TrackedEntityRuntimeAPI<AimHelper>;

  constructor(ctx: SpellRuntimeModuleCtxAPI) {
    this.ctx = ctx;
    this._switchLevel = this._switchLevel.bind(this);
    this._attachControls = this._attachControls.bind(this);
    this._teardown = this._teardown.bind(this);
    this.ctx.moduleEvents.on(
      SpellRuntimeModuleEvents.setLevel,
      this._switchLevel
    );
    this.ctx.moduleEvents.on(SpellRuntimeModuleEvents.teardown, this._teardown);
    this.ctx.moduleEvents.on(
      SpellRuntimeModuleEvents.executionStopped,
      this._teardown
    );
    this._switchLevel(this.ctx.level);
  }

  public aim(
    fromTracked: TrackedEntityRuntimeAPI,
    projectileGuide?: ProjectileGuideConfig
  ) {
    const deferred = new DeferredEmitter<
      {
        aim: Vector2;
        cancel: void;
      },
      "aim",
      "cancel"
    >(["aim"], ["cancel"]);

    if (!this.trackedAim) {
      const instantiate = () => {
        const fromEntity = fromTracked.currentEntity;
        if (!fromEntity) {
          deferred.emit("cancel");
          return null;
        }
        return new AimHelper({
          position: fromEntity.position.clone(),
          color: projectileGuide?.color ?? 0xffcc44,
          projectileGuide
        });
      };
      const helper = instantiate();
      if (!helper) {
        deferred.emit("cancel");
        return deferred;
      }
      this.ctx.level?.addEntity(helper);
      this.trackedAim = this.ctx.sync.track(helper, undefined, true);
      this.ctx.sync.setReInstantiator(this.trackedAim.trackingId, instantiate);
    }

    this.aimOperationsInProgress.push(deferred);
    return deferred;
  }

  private _switchLevel(level?: LevelAPI) {
    if (!level) return;
    if (level.controls) {
      this._attachControls(level.controls);
    } else {
      level.on(EntityLevelEvents.AttachControls, this._attachControls);
    }
  }
  private _attachControls(controls: ControlsAPI<BaseEntityType>) {
    controls.events.on(ControlEvents.LeftMouseUp, () => {
      const scenePosition = controls.cursorScenePosition?.clone();
      for (const op of this.aimOperationsInProgress) {
        op.emit("aim", scenePosition);
      }
      this.aimOperationsInProgress = [];
      if (this.trackedAim) {
        this.trackedAim.currentEntity?.goAway();
        this.ctx.sync.untrack(this.trackedAim.trackingId);
        this.ctx.sync.setReInstantiator(this.trackedAim.trackingId, null);
        this.trackedAim = undefined;
      }
    });
  }
  private _teardown() {
    for (const op of this.aimOperationsInProgress) op.emit("cancel");
    if (this.trackedAim) {
      this.trackedAim.currentEntity?.goAway();
      this.ctx.sync.untrack(this.trackedAim.trackingId);
      this.ctx.sync.setReInstantiator(this.trackedAim.trackingId, null);
      this.trackedAim = undefined;
    }
  }
}
