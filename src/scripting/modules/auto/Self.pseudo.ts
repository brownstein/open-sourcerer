import { InterpreterPseudoValue } from "js-interpreter";

import { JSRunnerCtx } from "src/scripting/core/api";
import { SpellRuntimeModulePseudo } from "src/scripting/runtime/SpellRuntimeAPI";
import { SpellPseudoRuntimeCtx } from "src/scripting/runtime/SpellWorkerModuleAPI";

export default {
  name: "self",
  manifest: {
    description: "The entity casting this spell.",
    export: {
      kind: "value",
      valueType: "Entity",
      description: "The caster entity (id, type, position, ...)."
    }
  },
  requirePseudo: async (
    ctx: JSRunnerCtx<SpellPseudoRuntimeCtx>
  ): Promise<InterpreterPseudoValue> => {
    const resultArr = await ctx.sync.requestTracking({ caster: true });
    const result = resultArr.at(0);
    return ctx.runner.translate.nativeToPseudo(result);
  }
} satisfies SpellRuntimeModulePseudo;
