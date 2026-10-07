import {
  autoTranslateClass,
  exposeProp,
  markStaticCastableFunction
} from "src/scripting/core/Bindings";
import { JSRunnerCtx } from "src/scripting/core/api";
import { getAutoPseudoRPCBindings } from "src/scripting/modules/autoPseudo";
import { SpellRuntimeModulePseudo } from "src/scripting/runtime/SpellRuntimeAPI";
import { SpellPseudoRuntimeCtx } from "src/scripting/runtime/SpellWorkerModuleAPI";

import { componentNameValidator } from "./validators/tabsValidators";

export default {
  name: "tabs",
  manifest: {
    description: "Open, close, move, and resize UI panels (tabs).",
    export: {
      kind: "class",
      description: "Layout/tab control functions.",
      properties: {},
      staticProperties: {
        openTab: {
          kind: "function",
          description: "Opens a UI panel by component name; returns its tab id.",
          params: [{ name: "componentName", type: "string" }],
          returns: "string"
        },
        closeTab: {
          kind: "function",
          description: "Closes tabs by component name or a specific tab id.",
          params: [{ name: "nameOrId", type: "string" }]
        },
        populateEditor: {
          kind: "function",
          description: "Sets the code of a code-editor tab.",
          params: [
            { name: "tabId", type: "string" },
            { name: "contents", type: "string" }
          ]
        },
        maximize: {
          kind: "function",
          description: "Toggles maximize on the tabset containing a tab.",
          params: [{ name: "tabId", type: "string" }]
        },
        resize: {
          kind: "function",
          description: "Resizes a tab's tabset (weight 0-1 relative to siblings).",
          params: [
            { name: "tabId", type: "string" },
            { name: "weight", type: "number" }
          ]
        },
        move: {
          kind: "function",
          description:
            "Moves a tab to a position (left/right/top/bottom); returns new tab id.",
          params: [
            { name: "tabId", type: "string" },
            { name: "position", type: "string" }
          ],
          returns: "string"
        }
      }
    }
  },
  requirePseudo: (ctx: JSRunnerCtx<SpellPseudoRuntimeCtx>) => {
    const { runner } = ctx;
    const rpcs = getAutoPseudoRPCBindings(runner).TabsNative;

    @autoTranslateClass()
    class Tabs {
      @exposeProp({
        exposeErrorMessages: true,
        validator: (arg) => componentNameValidator.validateSync(arg)
      })
      @markStaticCastableFunction()
      static async openTab(componentName: string) {
        return await rpcs.openTab({ componentName });
      }

      @exposeProp({ exposeErrorMessages: true })
      @markStaticCastableFunction()
      static async closeTab(nameOrId: string) {
        return await rpcs.closeTab({ nameOrId });
      }

      @exposeProp({ exposeErrorMessages: true })
      @markStaticCastableFunction()
      static async populateEditor(tabId: string, contents: string) {
        return await rpcs.populateEditor({ tabId, contents });
      }

      @exposeProp({ exposeErrorMessages: true })
      @markStaticCastableFunction()
      static async maximize(tabId: string) {
        return await rpcs.maximize({ tabId });
      }

      @exposeProp({ exposeErrorMessages: true })
      @markStaticCastableFunction()
      static async resize(tabId: string, weight: number) {
        return await rpcs.resize({ tabId, weight });
      }

      @exposeProp({ exposeErrorMessages: true })
      @markStaticCastableFunction()
      static async move(tabId: string, position: string) {
        return await rpcs.move({ tabId, position });
      }
    }

    return runner.translate.nativeToPseudo(Tabs);
  }
} satisfies SpellRuntimeModulePseudo;
