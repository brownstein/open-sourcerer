import { SpellRuntimeModuleCtxAPI } from "src/scripting/runtime/SpellRuntimeAPI";

import { assertAutoBindableNativeModule } from "../autoAPI";

@assertAutoBindableNativeModule
export default class SpeedNative {
  private ctx: SpellRuntimeModuleCtxAPI;
  constructor(ctx: SpellRuntimeModuleCtxAPI) {
    this.ctx = ctx;
  }

  setSpeed(linesPerMs: number) {
    this.ctx.setSpeed(linesPerMs);
  }
}
