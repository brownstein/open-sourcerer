import { LevelAPI } from "src/api/entity";
import {
  SpellCtx,
  SpellCtxConsoleLogLine,
  SpellsAPI,
  SpellsAPIEventTypes,
  SpellsAPIEvents
} from "src/api/spells";
import { TypedEventEmitter } from "src/api/util";
import { AppStore } from "src/redux/store";

import { ModuleManifest } from "../core/apiManifest";
import * as CoreAPI from "../core/api";
import { SpellEntitySyncRuntimeAPI } from "./SpellEntitySyncAPI";
import { SpellPseudoRuntimeCtx } from "./SpellWorkerModuleAPI";

// External API.

export enum SpellRunnerEvents {
  setLevel = "setLevel"
}

export type SpellRunnerEventTypes = SpellsAPIEventTypes & {
  [SpellRunnerEvents.setLevel]: LevelAPI;
  [SpellsAPIEvents.consoleLog]: SpellCtxConsoleLogLine;
};

export type SpellRuntimeAPI = SpellsAPI & {
  readonly events: TypedEventEmitter<SpellRunnerEventTypes>;
  readonly level?: LevelAPI;
};

// Module API.

export enum SpellRuntimeModuleEvents {
  setLevel = "setLevel",
  teardown = "teardown",
  executionStopped = "executionStopped"
}

export type SpellRuntimeModuleCtxApiEventTypes = {
  [SpellRuntimeModuleEvents.setLevel]: LevelAPI | undefined;
  [SpellRuntimeModuleEvents.teardown]: void;
  [SpellRuntimeModuleEvents.executionStopped]: void;
};

export type SpellRuntimeModuleCtxAPI = SpellCtx & {
  readonly moduleEvents: TypedEventEmitter<SpellRuntimeModuleCtxApiEventTypes>;
  readonly level?: LevelAPI;
  readonly store?: AppStore;
  readonly runtime?: SpellRuntimeAPI;
  readonly sharedNativeResources: Map<symbol, unknown>;
  readonly sync: SpellEntitySyncRuntimeAPI;
  sendModuleRpc(moduleName: string, payload: unknown): void;
};

export type UntypedRPCHandler = (data: unknown) => unknown | Promise<unknown>;

export type SpellRuntimeModuleInstanceNative = {
  handleDataRPC: UntypedRPCHandler;
};

export type SpellRuntimeModulePseudo =
  CoreAPI.JSRunnerNativeModule<SpellPseudoRuntimeCtx> & {
    // require()-autocomplete metadata describing the shape returned by
    // require(name). Read at build time by generate-auto-module-bindings and
    // inlined into the generated SPELL_API_MANIFESTS. Lives here (pseudo side)
    // because it documents the require()-able surface, not the native handler.
    manifest?: ModuleManifest;
    // This is not yet used, but in theory it lets us do some neat stuff with
    // mutation of the pseudo environment.
    initHeadlessPseudo?(
      ctx: CoreAPI.JSRunnerCtx<SpellPseudoRuntimeCtx>
    ): void | Promise<void> | UntypedRPCHandler | Promise<UntypedRPCHandler>;
  };
