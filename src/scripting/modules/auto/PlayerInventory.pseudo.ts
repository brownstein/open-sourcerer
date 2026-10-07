import { InterpreterObject, InterpreterPseudoValue } from "js-interpreter";

import { JSRunnerCtx } from "src/scripting/core/api";
import { getAutoPseudoRPCBindings } from "src/scripting/modules/autoPseudo";
import { SpellRuntimeModulePseudo } from "src/scripting/runtime/SpellRuntimeAPI";
import { SpellPseudoRuntimeCtx } from "src/scripting/runtime/SpellWorkerModuleAPI";

const QUERY_METHODS = [
  "getEquippedWeapon",
  "getHotKeyMap",
  "getHotKeyCurrentRow",
  "getConsumables",
  "getQuestItems",
  "hasSword",
  "getCoins"
] as const;

export default {
  name: "playerInventory",
  manifest: {
    description: "Reads and manipulates the player's inventory and hotkeys.",
    export: {
      kind: "object",
      description: "Inventory query and hotkey command functions.",
      properties: {
        getEquippedWeapon: { kind: "function", returns: "string | null" },
        getHotKeyMap: { kind: "function", returns: "object" },
        getHotKeyCurrentRow: { kind: "function", returns: "number" },
        getConsumables: { kind: "function", returns: "object" },
        getQuestItems: { kind: "function", returns: "object" },
        hasSword: { kind: "function", returns: "boolean" },
        getCoins: { kind: "function", returns: "number" },
        setHotKeyCurrentRow: {
          kind: "function",
          params: [{ name: "row", type: "number" }]
        },
        assignHotKey: {
          kind: "function",
          params: [
            { name: "hotKey", type: "string" },
            { name: "assignment", type: "object | null" }
          ]
        },
        activateHotKey: {
          kind: "function",
          params: [{ name: "hotKey", type: "string" }]
        }
      }
    }
  },
  requirePseudo: (ctx: JSRunnerCtx<SpellPseudoRuntimeCtx>) => {
    const { runner } = ctx;
    const { interpreter } = runner;
    const rpcs = getAutoPseudoRPCBindings(runner).PlayerInventoryNative;
    const api = interpreter.nativeToPseudo({}) as InterpreterObject;

    for (const method of QUERY_METHODS) {
      const fn = interpreter.createAsyncFunction(
        async (cb: (result: InterpreterPseudoValue) => void) => {
          const result = await (
            rpcs[method] as () => Promise<unknown>
          )();
          cb(interpreter.nativeToPseudo(result));
        }
      );
      interpreter.setProperty(api, method, fn);
    }

    interpreter.setProperty(
      api,
      "setHotKeyCurrentRow",
      interpreter.createAsyncFunction(
        async (row: number, cb: (result: InterpreterPseudoValue) => void) => {
          const result = await rpcs.setHotKeyCurrentRow(row);
          cb(interpreter.nativeToPseudo(result));
        }
      )
    );

    interpreter.setProperty(
      api,
      "assignHotKey",
      interpreter.createAsyncFunction(
        async (
          hotKey: string,
          assignmentPseudo: InterpreterPseudoValue,
          cb: (result: InterpreterPseudoValue) => void
        ) => {
          const assignment = runner.translate.pseudoToNative(assignmentPseudo);
          const result = await rpcs.assignHotKey(
            hotKey as never,
            assignment as never
          );
          cb(interpreter.nativeToPseudo(result));
        }
      )
    );

    interpreter.setProperty(
      api,
      "activateHotKey",
      interpreter.createAsyncFunction(
        async (
          hotKey: string,
          cb: (result: InterpreterPseudoValue) => void
        ) => {
          const result = await rpcs.activateHotKey(hotKey as never);
          cb(interpreter.nativeToPseudo(result));
        }
      )
    );

    return api;
  }
} satisfies SpellRuntimeModulePseudo;
