import { TypedEventEmitter } from "src/api/util";

import { JSRunnerAPI } from "../core/api";
import { SpellEntitySyncPseudoAPI } from "./SpellEntitySyncAPI";

export type SpellPseudoRuntimeCTXEvents = {
  moduleMessage: unknown;
};

export type SpellPseudoRuntimeCtx = {
  // Spell runtime context is shared between modules, so we have to address requests by module name.
  getModuleEvents: (
    moduleName: string
  ) => TypedEventEmitter<SpellPseudoRuntimeCTXEvents>;
  // RPC calls to the main thread.
  nativeRPC: (moduleName: string, data: unknown) => Promise<unknown>;
  // This allows communication between spell modules.
  sharedModuleResources: Map<symbol, unknown>;
  // This handles entity sync.
  sync: SpellEntitySyncPseudoAPI;
};

const kModuleIOCKey = "moduleAPI";

export function addModuleAPIToRunner(runner: JSRunnerAPI, ctx: SpellPseudoRuntimeCtx) {
  runner.ctx.ioc.mapping.set(kModuleIOCKey, ctx);
}

export function moduleAPIFromRunner(
  runner: JSRunnerAPI
): SpellPseudoRuntimeCtx | undefined {
  return runner.ctx.ioc.mapping.get(kModuleIOCKey) as
    | SpellPseudoRuntimeCtx
    | undefined;
}
