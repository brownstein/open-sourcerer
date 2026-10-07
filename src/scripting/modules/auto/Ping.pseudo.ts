import { InterpreterPseudoValue } from "js-interpreter";

import { JSRunnerCtx } from "src/scripting/core/api";
import { getAutoPseudoRPCBindings } from "src/scripting/modules/autoPseudo";
import { SpellRuntimeModulePseudo } from "src/scripting/runtime/SpellRuntimeAPI";
import { SpellPseudoRuntimeCtx } from "src/scripting/runtime/SpellWorkerModuleAPI";

export default {
  name: "ping",
  manifest: {
    description: "Pings the area around the caster to detect entities.",
    export: {
      kind: "function",
      description:
        "Emits a ping from the caster and resolves to the entities it detected.",
      returns: "Entity[]"
    }
  },
  requirePseudo: (ctx: JSRunnerCtx<SpellPseudoRuntimeCtx>) => {
    const { runner } = ctx;
    const { interpreter } = runner;
    const ping = async (cb: (result: InterpreterPseudoValue) => void) => {
      const identifiers = await getAutoPseudoRPCBindings(
        runner
      ).PingNative.doPing();
      const results = (identifiers ?? [])
        .map((id) => ctx.sync.getTrackedWithoutRPC(id))
        .filter((v) => !!v);
      cb(runner.translate.nativeToPseudo(results));
    };
    return interpreter.createAsyncFunction(ping);
  }
} satisfies SpellRuntimeModulePseudo;
