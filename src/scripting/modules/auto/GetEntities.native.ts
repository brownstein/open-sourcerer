import { SpellRuntimeModuleCtxAPI } from "src/scripting/runtime/SpellRuntimeAPI";

import { assertAutoBindableNativeModule } from "../autoAPI";

@assertAutoBindableNativeModule
export default class GetEntitiesNative {
  private ctx: SpellRuntimeModuleCtxAPI;
  constructor(ctx: SpellRuntimeModuleCtxAPI) {
    this.ctx = ctx;
  }

  getEntities() {
    const level = this.ctx.level;
    if (!level) return [];
    return [...level.getEntities().values()].map((entity) => ({
      id: entity.id,
      type: entity.type,
      position: entity.position,
      solid: level.isEntitySolid(entity.id)
    }));
  }
}
