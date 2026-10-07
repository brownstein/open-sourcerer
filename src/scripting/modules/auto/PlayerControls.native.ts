import { ControlEvents } from "src/api/controls";
import { SpellRuntimeModuleCtxAPI } from "src/scripting/runtime/SpellRuntimeAPI";

import { assertAutoBindableNativeModule } from "../autoAPI";

@assertAutoBindableNativeModule
export default class PlayerControlsNative {
  private ctx: SpellRuntimeModuleCtxAPI;
  constructor(ctx: SpellRuntimeModuleCtxAPI) {
    this.ctx = ctx;
  }

  jump() {
    const controls = this.ctx.level?.controls;
    controls?.events.emit(ControlEvents.JumpStart);
    setTimeout(() => {
      controls?.events.emit(ControlEvents.JumpRelease);
    }, 100);
  }

  moveHorizontally(direction: number) {
    this.ctx.level?.controls?.events.emit(
      ControlEvents.MoveHorizontally,
      direction ?? 0
    );
  }

  secondaryAttack() {
    this.ctx.level?.controls?.events.emit(ControlEvents.SecondaryAttack);
  }

  swordSwing() {
    const controls = this.ctx.level?.controls;
    controls?.events.emit(ControlEvents.LeftMouseDown);
    setTimeout(() => {
      controls?.events.emit(ControlEvents.LeftMouseUp);
    }, 100);
  }
}
