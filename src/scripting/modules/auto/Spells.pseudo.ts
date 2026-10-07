import * as yup from "yup";

import {
  autoTranslateClass,
  exposeProp,
  markStaticCastableFunction
} from "src/scripting/core/Bindings";
import { JSRunnerCtx } from "src/scripting/core/api";
import { getAutoPseudoRPCBindings } from "src/scripting/modules/autoPseudo";
import { SpellRuntimeModulePseudo } from "src/scripting/runtime/SpellRuntimeAPI";
import { SpellPseudoRuntimeCtx } from "src/scripting/runtime/SpellWorkerModuleAPI";

import {
  codeValidator,
  spellNameValidator
} from "./validators/spellsValidators";

export default {
  name: "spells",
  manifest: {
    description: "Inspect, edit, save, and run other spells as sub-spells.",
    export: {
      kind: "class",
      description: "Spell library and sub-spell runner.",
      properties: {},
      staticProperties: {
        list: { kind: "function", description: "Lists saved spells.", returns: "object[]" },
        get: { kind: "function", description: "Gets a saved spell's details.", params: [{ name: "name", type: "string" }] },
        getCode: { kind: "function", description: "Gets a saved spell's code.", params: [{ name: "name", type: "string" }], returns: "string" },
        save: { kind: "function", description: "Saves (or updates) a spell.", params: [{ name: "name", type: "string" }, { name: "code", type: "string" }] },
        setEditor: { kind: "function", description: "Sets a code editor tab's contents.", params: [{ name: "code", type: "string" }, { name: "tabId", type: "string", optional: true }] },
        getEditor: { kind: "function", description: "Gets a code editor tab's contents.", params: [{ name: "tabId", type: "string", optional: true }], returns: "string" },
        runCode: { kind: "function", description: "Runs code as a sub-spell (blocks until done).", params: [{ name: "code", type: "string" }] },
        runSaved: { kind: "function", description: "Runs a saved spell (blocks until done).", params: [{ name: "name", type: "string" }] },
        runEditor: { kind: "function", description: "Runs an editor tab's code (blocks until done).", params: [{ name: "tabId", type: "string", optional: true }] },
        stop: { kind: "function", description: "Stops a running sub-spell by context id.", params: [{ name: "contextId", type: "string" }] },
        terminateAll: { kind: "function", description: "Terminates all running spells." },
        runCodeAsync: { kind: "function", description: "Runs code as a sub-spell, returns a RunningSpell handle.", params: [{ name: "code", type: "string" }], returns: "RunningSpell" },
        runSavedAsync: { kind: "function", description: "Runs a saved spell, returns a RunningSpell handle.", params: [{ name: "name", type: "string" }], returns: "RunningSpell" },
        runEditorAsync: { kind: "function", description: "Runs an editor tab's code, returns a RunningSpell handle.", params: [{ name: "tabId", type: "string", optional: true }], returns: "RunningSpell" }
      }
    }
  },
  requirePseudo: (ctx: JSRunnerCtx<SpellPseudoRuntimeCtx>) => {
    const { runner } = ctx;
    const rpcs = getAutoPseudoRPCBindings(runner).SpellsNative;

    @autoTranslateClass()
    class RunningSpell {
      private _contextId: string;
      constructor(contextId: string) {
        this._contextId = contextId;
      }

      @exposeProp({ exposeErrorMessages: true })
      get contextId() {
        return this._contextId;
      }

      @exposeProp({ exposeErrorMessages: true })
      async done() {
        return await rpcs.awaitSpell({ contextId: this._contextId });
      }

      @exposeProp({ exposeErrorMessages: true })
      async getLogOutput() {
        return await rpcs.getSpellLog({ contextId: this._contextId });
      }

      @exposeProp({ exposeErrorMessages: true })
      async stop() {
        return await rpcs.stop({ contextId: this._contextId });
      }
    }

    @autoTranslateClass()
    class Spells {
      @exposeProp({ exposeErrorMessages: true })
      @markStaticCastableFunction()
      static async list() {
        return await rpcs.list({});
      }

      @exposeProp({
        exposeErrorMessages: true,
        validator: (arg) => spellNameValidator.validateSync(arg)
      })
      @markStaticCastableFunction()
      static async get(name: string) {
        return await rpcs.get({ name });
      }

      @exposeProp({
        exposeErrorMessages: true,
        validator: (arg) => spellNameValidator.validateSync(arg)
      })
      @markStaticCastableFunction()
      static async getCode(name: string) {
        return await rpcs.getCode({ name });
      }

      @exposeProp({ exposeErrorMessages: true })
      @markStaticCastableFunction()
      static async save(name: string, code: string) {
        return await rpcs.save({ name, code });
      }

      @exposeProp({ exposeErrorMessages: true })
      @markStaticCastableFunction()
      static async setEditor(code: string, tabId?: string) {
        return await rpcs.setEditor({ code, tabId });
      }

      @exposeProp({ exposeErrorMessages: true })
      @markStaticCastableFunction()
      static async getEditor(tabId?: string) {
        return await rpcs.getEditor({ tabId });
      }

      @exposeProp({
        exposeErrorMessages: true,
        validator: (arg) => codeValidator.validateSync(arg)
      })
      @markStaticCastableFunction()
      static async runCode(code: string) {
        return await rpcs.runCode({ code });
      }

      @exposeProp({
        exposeErrorMessages: true,
        validator: (arg) => spellNameValidator.validateSync(arg)
      })
      @markStaticCastableFunction()
      static async runSaved(name: string) {
        const { contextId } = await rpcs.runSaved({ name });
        return new RunningSpell(contextId);
      }

      @exposeProp({ exposeErrorMessages: true })
      @markStaticCastableFunction()
      static async runEditor(tabId?: string) {
        return await rpcs.runEditor({ tabId });
      }

      @exposeProp({
        exposeErrorMessages: true,
        validator: (arg) =>
          yup.string().required("contextId is required.").validateSync(arg)
      })
      @markStaticCastableFunction()
      static async stop(contextId: string) {
        return await rpcs.stop({ contextId });
      }

      @exposeProp({ exposeErrorMessages: true })
      @markStaticCastableFunction()
      static async terminateAll() {
        return await rpcs.terminateAll({});
      }

      @exposeProp({
        exposeErrorMessages: true,
        validator: (arg) => codeValidator.validateSync(arg)
      })
      @markStaticCastableFunction()
      static async runCodeAsync(code: string) {
        const result = await rpcs.runCodeAsync({ code });
        return new RunningSpell(result.contextId);
      }

      @exposeProp({
        exposeErrorMessages: true,
        validator: (arg) => spellNameValidator.validateSync(arg)
      })
      @markStaticCastableFunction()
      static async runSavedAsync(name: string) {
        const result = await rpcs.runSavedAsync({ name });
        return new RunningSpell(result.contextId);
      }

      @exposeProp({ exposeErrorMessages: true })
      @markStaticCastableFunction()
      static async runEditorAsync(tabId?: string) {
        const result = await rpcs.runEditorAsync({ tabId });
        return new RunningSpell(result.contextId);
      }
    }

    return runner.translate.nativeToPseudo(Spells);
  }
} satisfies SpellRuntimeModulePseudo;
