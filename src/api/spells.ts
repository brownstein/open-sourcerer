import { TrackingIdentifier } from "src/scripting/runtime/SpellEntitySyncAPI";
import type { BaseEntityType } from "./entity";
import { ItemData } from "./item";
import { SpellIconSpec } from "./spellIcons";
import { TypedEventEmitter } from "./util";

export type SpellId = string;

export enum SpellCtxEvents {
  runStarted = "runStarted",
  runPaused = "runPaused",
  runResumed = "runResumed",
  runComplete = "runComplete",
  runProgress = "runProgress",
  runError = "runError",
  runTerminated = "runTerminated",
  consoleLog = "consoleLog"
}

export type SpellCtxConsoleLogLine = {
  primitiveValue?: boolean | number | string | null | undefined;
  objectValue?: unknown;
  type?: "error";
};

export type SpellCtxEventTypes = {
  [SpellCtxEvents.runStarted]: void;
  [SpellCtxEvents.runComplete]: unknown;
  [SpellCtxEvents.runPaused]: void;
  [SpellCtxEvents.runResumed]: void;
  [SpellCtxEvents.runProgress]: number;
  [SpellCtxEvents.runError]: SpellError;
  [SpellCtxEvents.runTerminated]: void;
  [SpellCtxEvents.consoleLog]: SpellCtxConsoleLogLine;
};

export type SpellError = {
  message: string;
  line?: number;
  stack?: string;
};

export type SpellCtxMetrics = {
  /** Counts of successful module constructor/RPC invocations per module name */
  moduleConstructorCounts: Record<string, number>;
};

export type SpellCtx = {
  readonly id: SpellId;
  readonly initialCode: string;
  readonly savedScriptId?: string;
  readonly events: TypedEventEmitter<SpellCtxEventTypes>;
  readonly running?: boolean;
  readonly paused?: boolean;
  readonly runComplete?: boolean;
  readonly error?: SpellError;
  readonly currentLine?: number;
  readonly consoleOutput: SpellCtxConsoleLogLine[];
  // This may change between levels if you walk from map to map!
  readonly casterId?: string;
  readonly casterTrackingId?: TrackingIdentifier;
  readonly getCaster: () => BaseEntityType | undefined;
  readonly headless: boolean;
  readonly destroyed: boolean;
  readonly setVars: (vars: Record<string, unknown>) => void;
  readonly getVars: (vars: string[]) => Promise<Record<string, unknown>>;
  readonly appendAndRun: (
    code: string,
    logResult?: boolean,
    bindLastResultToVariable?: string
  ) => void;
  readonly runCompletePromise: () => Promise<unknown>;
  readonly pause: () => void;
  readonly resume: () => void;
  readonly step: () => void;
  readonly terminate: () => void;
  readonly setSpeed: (linesPerMs: number) => void;
  readonly bindEntityToVariable: (entity: BaseEntityType, variableName: string) => void;
  readonly syncEntitiesNow: () => void;
  // This is currently unused. Might want to delete.
  readonly setHeadless: (headless: boolean) => void;
  // This sends a "headless" RPC to the runtime, which
  // allows us to perform complex actions within supported
  // modules that can mutate the spell pseudo runtime.
  readonly rpcHeadless: (moduleName: string, data: unknown) => Promise<void>;
  readonly getMetrics: () => SpellCtxMetrics;
  readonly destroy: () => void;
};

export enum SpellsAPIEvents {
  consoleLog = "consoleLog",
  runSpellStart = "runSpellStart",
  runSpellEnd = "runSpellEnd"
}

export type SpellsAPIEventTypes = {
  [SpellsAPIEvents.consoleLog]: SpellCtxConsoleLogLine;
  [SpellsAPIEvents.runSpellStart]: SpellCtx;
  [SpellsAPIEvents.runSpellEnd]: SpellCtx;
};

export type ValueCompletion = {
  value: string;
  score?: number;
  meta?: string;
  caption?: string;
  docHTML?: string;
  docText?: string;
  completerId?: string;
};

export type SpellsAPI = {
  readonly events: TypedEventEmitter<SpellsAPIEventTypes>;
  readonly sharedConsoleOutput: SpellCtxConsoleLogLine[];
  run(
    code: string,
    casterId?: string,
    ctx?: SpellCtx | null,
    savedScriptId?: string
  ): Promise<SpellCtx>;
  getSavedRunning(savedScriptId: string): SpellCtx | null;
  getSpellCtx(id: SpellId): SpellCtx | null;
  getSpellCtxs(): Record<SpellId, SpellCtx>;
  autoComplete(
    code: string,
    currentRow: number,
    currentCol: number
  ): Promise<ValueCompletion[] | null>;
  computeImports(code: string): Promise<string[] | null>;
};

export enum SavedSpellAspect {
  Normal = "Normal",
  Fire = "Fire",
  Ice = "Ice",
  Earth = "Earth",
  Air = "Air"
}

export type SavedSpell = {
  name: string;
  code: string;
  id: string;
  metadata?: {
    color?: number;
    // The aspect is a derived value. We can
    // choose an icon based on this, and we use
    // it as a fallback during rendering.
    aspect?: SavedSpellAspect;
    imports?: string[];
    emblem?: string;
    emblemGreyscale?: boolean;
    emblemColor?: number;
    icon?: SpellIconSpec;
  };
};

export type SpellItemData = ItemData & {
  type: "spell";
  scriptId: string;
  scriptMetadata?: SavedSpell["metadata"];

  // Values used when passing a script through the inventory system
  // should persisted separately.
  scriptName?: string;
  scriptCode?: string;
};

export function isSpellItemData(data: ItemData): data is SpellItemData {
  return data.type === "spell";
}

export function savedSpellToItemData(spell: SavedSpell): SpellItemData {
  return {
    type: "spell",
    scriptId: spell.id,
    scriptMetadata: spell.metadata,

    scriptName: spell.name,
    scriptCode: spell.code
  };
}

export function itemDataToSavedSpell(data: SpellItemData): SavedSpell {
  return {
    name: data.scriptName ?? "unknown",
    code: data.scriptCode ?? "0",
    id: data.scriptId,
    metadata: data.scriptMetadata
  };
}
