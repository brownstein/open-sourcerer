import { Vector2, Vector3 } from "three";

import { ControlEvents } from "src/api/controls";
import { EntityLevelAPI, EntityLevelEvents } from "src/api/entity";
import { createTypedEventEmitter } from "src/api/util";
import { IVector2, vector2To3 } from "src/engine/util/vecTypes";
import { getPlayer } from "src/engine/util/levelUtil";
import { AimHelper } from "src/entities/ui/AimHelper";
import {
  SpellRuntimeModuleCtxAPI,
  SpellRuntimeModuleEvents
} from "src/scripting/runtime/SpellRuntimeAPI";

import { assertAutoBindableNativeModule } from "../autoAPI";
import { resolveTrackedCaster } from "../shared/resolveCaster";

export const AIM_MODULE_NAME = "aim";

export type AimModuleMessage = {
  isAimModuleMessage: true;
  clickAtCoordinates?: IVector2;
};

@assertAutoBindableNativeModule
export default class AimNative {
  private ctx: SpellRuntimeModuleCtxAPI;
  private controlsAttachedToLevel?: EntityLevelAPI;
  private targetEnumerator = 0;
  private targetEntityIds = new Map<number, string>();
  // We use an internal EventEmitter to process clicks because
  // the level can change while the player is aiming.
  private clickEE = createTypedEventEmitter<{
    click: Vector2;
    mouseUp: Vector2;
  }>();
  constructor(ctx: SpellRuntimeModuleCtxAPI) {
    this.ctx = ctx;
    this._click = this._click.bind(this);
    this._mouseUp = this._mouseUp.bind(this);
    this._switchLevel = this._switchLevel.bind(this);
    this._switchLevel();
    this.ctx.moduleEvents.on(
      SpellRuntimeModuleEvents.setLevel,
      this._switchLevel
    );
  }
  teardown() {
    if (!this.ctx?.level) return;
    this.ctx.level.controls?.events.off(ControlEvents.Click, this._click);
    this.ctx.level.controls?.events.off(
      ControlEvents.LeftMouseUp,
      this._mouseUp
    );
    this.ctx?.level?.setMaxListeners(this.ctx.level.getMaxListeners() - 2);
    for (const targetEntityId of this.targetEntityIds.values()) {
      const entity = this.ctx.level.getEntity<AimHelper>(targetEntityId);
      if (entity) entity.goAway();
    }
  }
  _switchLevel() {
    this._attachControls();
    if (!this.ctx?.level) return;
    this.ctx.level.setMaxListeners(this.ctx.level.getMaxListeners() + 1);
    this.ctx.level.on(
      EntityLevelEvents.AttachControls,
      this._attachControls.bind(this)
    );
    const player = getPlayer(this.ctx.level);
    const pos = player?.position.clone() ?? new Vector3();
    const newTargetEntityIds = new Map<number, string>();
    for (const targetNumber of this.targetEntityIds.keys()) {
      const newTarget = new AimHelper({
        position: pos
      });
      this.ctx.level.addEntity(newTarget);
      newTargetEntityIds.set(targetNumber, newTarget.id);
    }
    this.targetEntityIds = newTargetEntityIds;
  }
  init() {
    this._attachControls();
  }
  private _attachControls() {
    if (this.controlsAttachedToLevel === this.ctx.level) return;
    if (!this.ctx.level?.controls) return;
    this.controlsAttachedToLevel = this.ctx.level;
    this.ctx.level.controls.events.setMaxListeners(
      this.ctx.level.controls.events.getMaxListeners() + 2
    );
    this.ctx.level.controls.events.on(ControlEvents.Click, this._click);
    this.ctx.level.controls.events.on(ControlEvents.LeftMouseUp, this._mouseUp);
  }
  private _click() {
    const coordinates = this.ctx.level?.controls?.cursorScenePosition;
    if (!coordinates) return;
    this.clickEE.emit("click", coordinates);
    const msg = {
      isAimModuleMessage: true,
      clickAtCoordinates: {
        x: coordinates.x,
        y: coordinates.y
      }
    } satisfies AimModuleMessage;
    this.ctx.sendModuleRpc(AIM_MODULE_NAME, msg);
  }
  private _mouseUp() {
    const coordinates = this.ctx.level?.controls?.cursorScenePosition;
    if (!coordinates) return;
    this.clickEE.emit("mouseUp", coordinates);
  }
  aim() {
    const level = this.ctx.level;
    if (!level) return null;
    this._attachControls();

    let aimHelperNumber: number | undefined;
    if (level.controls?.cursorScenePosition) {
      aimHelperNumber = this.targetEnumerator++;
      const aimHelper = new AimHelper({
        position: vector2To3(
          level.controls?.cursorScenePosition ?? new Vector2()
        )
      });
      level.addEntity(aimHelper);
      this.targetEntityIds.set(aimHelperNumber, aimHelper.id);
    }

    return new Promise<IVector2>((resolve) => {
      let onClick: (() => void) | undefined;
      onClick = () => {
        if (!onClick) return;
        this.clickEE.off("mouseUp", onClick);
        onClick = undefined;
        if (aimHelperNumber !== undefined) {
          const aimHelperId = this.targetEntityIds.get(aimHelperNumber);
          if (aimHelperId) {
            const aimHelper = this.ctx.level?.getEntity<AimHelper>(aimHelperId);
            if (aimHelper) aimHelper.goAway();
          }
          this.targetEntityIds.delete(aimHelperNumber);
        }
        resolve({
          x: this.ctx.level?.controls?.cursorScenePosition?.x ?? 0,
          y: this.ctx.level?.controls?.cursorScenePosition?.y ?? 0
        });
      };
      this.clickEE.on("mouseUp", onClick);
    });
  }
  async aimRelative() {
    const aimCoordinates = await this.aim();
    if (!aimCoordinates) return null;
    // Use the spell's caster entity, falling back to Player search.
    const level = this.ctx.level;
    if (!level) return null;
    const trackedCaster = resolveTrackedCaster(this.ctx);
    const caster =
      trackedCaster?.currentEntity ||
      [...level.getEntities().values()].find((e) => e.type === "Player");
    if (!caster) return null;
    return {
      x: aimCoordinates.x - caster.position.x,
      y: aimCoordinates.y - caster.position.y
    };
  }
}
