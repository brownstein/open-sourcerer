import shortid from "shortid";

import { SavedSpell, SpellCtx } from "src/api/spells";
import { getPlayer } from "src/engine/util/levelUtil";
import { scriptEditorSelectors } from "src/redux/scriptEditor/selectors";
import { upsertEditor } from "src/redux/scriptEditor/slice";
import { selectAllScripts } from "src/redux/scriptLibrary/selectors";
import { saveScript } from "src/redux/scriptLibrary/slice";
import { selectLayout } from "src/redux/ui/selectors";
import {
  AnyJsonNode,
  isRowNode,
  isTabNode,
  isTabSetNode
} from "src/redux/ui/util";
import { SpellRuntimeModuleCtxAPI } from "src/scripting/runtime/SpellRuntimeAPI";

import { assertAutoBindableNativeModule } from "../autoAPI";
import {
  getArgsValidator,
  listArgsValidator,
  runCodeArgsValidator,
  runEditorArgsValidator,
  runSavedArgsValidator,
  saveArgsValidator,
  setEditorArgsValidator,
  stopArgsValidator
} from "./validators/spellsValidators";

const MAX_ACTIVE_SPELLS = 256;

/** Find the first code editor tab and return its editorId, or a specific tab's editorId. */
function findEditorId(state: any, tabId?: string): string | null {
  const layout = selectLayout(state);
  let editorId: string | null = null;

  const _traverse = (node: AnyJsonNode) => {
    if (editorId) return;
    if (isTabNode(node)) {
      const componentConfig = state.ui.layoutComponentState[tabId ?? ""];
      if (componentConfig?.editorId) {
        editorId = componentConfig.editorId as string;
      }
      return;
    }
    if (isRowNode(node) || isTabSetNode(node)) {
      for (const child of node.children ?? []) _traverse(child);
    }
  };
  _traverse(layout);
  return editorId;
}

/** Get the code from an editor by tab ID or the first available editor. */
function getEditorCode(state: any, tabId?: string): string | null {
  const editorId = findEditorId(state, tabId);
  if (!editorId) return null;
  const editor = scriptEditorSelectors.selectById(state, editorId);
  return editor?.code ?? null;
}

@assertAutoBindableNativeModule
export default class SpellsNative {
  private ctx: SpellRuntimeModuleCtxAPI;
  private asyncSpells = new Map<
    string,
    {
      completePromise: Promise<unknown>;
      getConsoleOutput: () => {
        primitiveValue?: boolean | number | string | null;
        objectValue?: unknown;
        type?: "error";
      }[];
      getError: () => { message: string } | undefined;
      terminate: () => void;
    }
  >();
  constructor(ctx: SpellRuntimeModuleCtxAPI) {
    this.ctx = ctx;
  }

  private getStore() {
    const store = this.ctx.store;
    if (!store) throw new Error("No store available.");
    return store;
  }

  private getRuntime() {
    const runtime = this.ctx.runtime;
    if (!runtime) throw new Error("No spell runtime available.");
    return runtime;
  }

  private getCasterId(): string | undefined {
    const level = this.ctx.level;
    if (!level) return undefined;
    const player = getPlayer(level);
    return player?.id;
  }

  private checkSpellLimit() {
    const runtime = this.getRuntime();
    const count = Object.keys(runtime.getSpellCtxs()).length;
    if (count >= MAX_ACTIVE_SPELLS) {
      throw new Error(
        `Cannot run spell: active spell limit reached (${MAX_ACTIVE_SPELLS}). ` +
          `Use Spells.stop() or Spells.terminateAll() to free slots.`
      );
    }
  }

  /** List all saved spells from the library. */
  list(_opts: Record<string, never>) {
    listArgsValidator.validateSync(_opts);
    const store = this.getStore();
    const scripts = selectAllScripts(store.getState());
    return scripts.map((s: SavedSpell) => {
      const entry: Record<string, string> = { name: s.name, id: s.id };
      if (s.metadata?.aspect) entry.aspect = s.metadata.aspect;
      if (s.metadata?.emblem) entry.emblem = s.metadata.emblem;
      return entry;
    });
  }

  /** Get a saved spell's full details by name. */
  get(opts: { name: string }) {
    const store = this.getStore();
    const { name } = getArgsValidator.validateSync(opts);
    const scripts = selectAllScripts(store.getState());
    const spell = scripts.find((s: SavedSpell) => s.name === name);
    if (!spell) throw new Error(`No saved spell named "${name}".`);
    const result: Record<string, string> = {
      name: spell.name,
      id: spell.id,
      code: spell.code
    };
    if (spell.metadata?.aspect) result.aspect = spell.metadata.aspect;
    if (spell.metadata?.emblem) result.emblem = spell.metadata.emblem;
    return result;
  }

  /** Get the code of a saved spell by name. */
  getCode(opts: { name: string }) {
    const store = this.getStore();
    const { name } = getArgsValidator.validateSync(opts);
    const scripts = selectAllScripts(store.getState());
    const spell = scripts.find((s: SavedSpell) => s.name === name);
    if (!spell) throw new Error(`No saved spell named "${name}".`);
    return spell.code;
  }

  /** Set the contents of a code editor tab. */
  setEditor(opts: { code: string; tabId?: string }) {
    const store = this.getStore();
    const { code, tabId } = setEditorArgsValidator.validateSync(opts);
    const state = store.getState();
    const editorId = findEditorId(state, tabId);
    if (!editorId) {
      throw new Error(
        tabId
          ? `No code editor found for tab "${tabId}".`
          : "No code editor tab is open."
      );
    }
    store.dispatch(
      upsertEditor({
        id: editorId,
        code
      })
    );
  }

  /** Get the contents of a code editor tab. */
  getEditor(opts: { tabId?: string }) {
    const store = this.getStore();
    const state = store.getState();
    const code = getEditorCode(state, opts.tabId);
    if (code === null) {
      throw new Error(
        opts.tabId
          ? `No code editor found for tab "${opts.tabId}".`
          : "No code editor tab is open."
      );
    }
    return code;
  }

  /** Run arbitrary code as a sub-spell. Blocks until complete. */
  async runCode(opts: { code: string }) {
    this.checkSpellLimit();
    const { code } = runCodeArgsValidator.validateSync(opts);
    const runtime = this.getRuntime();
    const casterId = this.getCasterId();
    const ctx = await runtime.run(code, casterId);
    await ctx.runCompletePromise();
    const result: { contextId: string; error?: string } = {
      contextId: ctx.id
    };
    if (ctx.error) {
      result.error = ctx.error.message;
    }
    return result;
  }

  /** Run a saved spell by name. Blocks until complete. */
  async runSaved(opts: { name: string }) {
    this.checkSpellLimit();
    const { name } = runSavedArgsValidator.validateSync(opts);
    const store = this.getStore();
    const runtime = this.getRuntime();
    const casterId = this.getCasterId();
    const scripts = selectAllScripts(store.getState());
    const spell = scripts.find((s: SavedSpell) => s.name === name);
    if (!spell) throw new Error(`No saved spell named "${name}".`);
    const ctx = await runtime.run(spell.code, casterId, null, spell.id);
    const data = await ctx.runCompletePromise();
    const result: { contextId: string; error?: string; data: unknown } = {
      contextId: ctx.id,
      data
    };
    if (ctx.error) {
      result.error = ctx.error.message;
    }
    return result;
  }

  /** Run the code currently in a code editor tab. Blocks until complete. */
  async runEditor(opts: { tabId?: string }) {
    this.checkSpellLimit();
    runEditorArgsValidator.validateSync(opts);
    const store = this.getStore();
    const runtime = this.getRuntime();
    const casterId = this.getCasterId();
    const state = store.getState();
    const code = getEditorCode(state, opts.tabId);
    if (code === null) {
      throw new Error(
        opts.tabId
          ? `No code editor found for tab "${opts.tabId}".`
          : "No code editor tab is open."
      );
    }
    const ctx = await runtime.run(code, casterId);
    await ctx.runCompletePromise();
    const result: { contextId: string; error?: string } = {
      contextId: ctx.id
    };
    if (ctx.error) {
      result.error = ctx.error.message;
    }
    return result;
  }

  /** Save a spell to the library. Updates if a spell with the same name exists. */
  save(opts: { name: string; code: string }) {
    const store = this.getStore();
    const { name, code } = saveArgsValidator.validateSync(opts);
    const scripts = selectAllScripts(store.getState());
    const existing = scripts.find((s: SavedSpell) => s.name === name);
    const id = existing?.id ?? shortid();
    store.dispatch(
      saveScript({
        id,
        name,
        code,
        metadata: existing?.metadata
      })
    );
    return { id, name };
  }

  /** Stop a running sub-spell by context ID. */
  stop(opts: { contextId: string }) {
    const { contextId } = stopArgsValidator.validateSync(opts);
    // Check async spells first (survives context cleanup)
    const entry = this.asyncSpells.get(contextId);
    if (entry) {
      entry.terminate();
      return;
    }
    const runtime = this.getRuntime();
    const ctx = runtime.getSpellCtx(contextId);
    if (!ctx) throw new Error(`No spell context with id "${contextId}".`);
    ctx.terminate();
  }

  private storeAsyncSpell(ctx: SpellCtx) {
    const consoleOutput = ctx.consoleOutput;
    const completePromise = ctx.runCompletePromise();
    this.asyncSpells.set(ctx.id, {
      completePromise,
      getConsoleOutput: () => consoleOutput,
      getError: () => ctx.error,
      terminate: () => ctx.terminate()
    });
  }

  /** Run arbitrary code as a sub-spell. Returns contextId immediately. */
  async runCodeAsync(opts: { code: string }) {
    this.checkSpellLimit();
    const { code } = runCodeArgsValidator.validateSync(opts);
    const runtime = this.getRuntime();
    const casterId = this.getCasterId();
    const ctx = await runtime.run(code, casterId);
    this.storeAsyncSpell(ctx);
    return { contextId: ctx.id };
  }

  /** Run a saved spell by name. Returns contextId immediately. */
  async runSavedAsync(opts: { name: string }) {
    this.checkSpellLimit();
    const { name } = runSavedArgsValidator.validateSync(opts);
    const store = this.getStore();
    const runtime = this.getRuntime();
    const casterId = this.getCasterId();
    const scripts = selectAllScripts(store.getState());
    const spell = scripts.find((s: SavedSpell) => s.name === name);
    if (!spell) throw new Error(`No saved spell named "${name}".`);
    const ctx = await runtime.run(spell.code, casterId, null, spell.id);
    this.storeAsyncSpell(ctx);
    return { contextId: ctx.id };
  }

  /** Run the code currently in a code editor tab. Returns contextId immediately. */
  async runEditorAsync(opts: { tabId?: string }) {
    this.checkSpellLimit();
    runEditorArgsValidator.validateSync(opts);
    const store = this.getStore();
    const runtime = this.getRuntime();
    const casterId = this.getCasterId();
    const state = store.getState();
    const code = getEditorCode(state, opts.tabId);
    if (code === null) {
      throw new Error(
        opts.tabId
          ? `No code editor found for tab "${opts.tabId}".`
          : "No code editor tab is open."
      );
    }
    const ctx = await runtime.run(code, casterId);
    this.storeAsyncSpell(ctx);
    return { contextId: ctx.id };
  }

  /** Block until a sub-spell completes. Returns error if any. */
  async awaitSpell(opts: { contextId: string }) {
    const { contextId } = stopArgsValidator.validateSync(opts);
    const entry = this.asyncSpells.get(contextId);
    if (!entry) throw new Error(`No async spell with id "${contextId}".`);
    await entry.completePromise;
    const result: { contextId: string; error?: string } = { contextId };
    const error = entry.getError();
    if (error) {
      result.error = error.message;
    }
    return result;
  }

  /** Terminate all running spell contexts. */
  terminateAll(_opts: Record<string, never>) {
    const runtime = this.getRuntime();
    const ctxs = runtime.getSpellCtxs();
    const count = Object.keys(ctxs).length;
    for (const ctx of Object.values(ctxs)) {
      ctx.terminate();
    }
    return { terminated: count };
  }

  /** Get console log output from a sub-spell. */
  getSpellLog(opts: { contextId: string }) {
    const { contextId } = stopArgsValidator.validateSync(opts);
    const entry = this.asyncSpells.get(contextId);
    if (!entry) throw new Error(`No async spell with id "${contextId}".`);
    return entry.getConsoleOutput().map((line) => {
      if (line.primitiveValue !== undefined) return String(line.primitiveValue);
      if (line.objectValue !== undefined) {
        try {
          return JSON.stringify(line.objectValue);
        } catch {
          return String(line.objectValue);
        }
      }
      return "";
    });
  }
}
