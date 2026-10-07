import { InterpreterObject } from "js-interpreter";

import { JSRunnerCtx } from "src/scripting/core/api";
import { getAutoPseudoRPCBindings } from "src/scripting/modules/autoPseudo";
import { SpellRuntimeModulePseudo } from "src/scripting/runtime/SpellRuntimeAPI";
import { SpellPseudoRuntimeCtx } from "src/scripting/runtime/SpellWorkerModuleAPI";

export default {
  name: "getEntities",
  manifest: {
    description: "Lists the entities currently in the level.",
    export: {
      kind: "function",
      description:
        "Returns an array of { id, type, position, solid } for every entity in the level. `solid` is true when the entity has a real (non-sensor) physical body.",
      returns:
        "{ id: string, type: string, position: { x: number, y: number }, solid: boolean }[]"
    }
  },
  requirePseudo: (ctx: JSRunnerCtx<SpellPseudoRuntimeCtx>) => {
    const { runner } = ctx;
    const { interpreter } = runner;
    const getEntities = async (cb: (result: InterpreterObject) => void) => {
      const entities =
        await getAutoPseudoRPCBindings(runner).GetEntitiesNative.getEntities();
      cb(interpreter.nativeToPseudo(entities) as InterpreterObject);
    };
    return interpreter.createAsyncFunction(getEntities);
  }
} satisfies SpellRuntimeModulePseudo;
