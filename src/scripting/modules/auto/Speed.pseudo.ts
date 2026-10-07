import { JSRunnerCtx } from "src/scripting/core/api";
import { isPrimitiveValue } from "src/scripting/core/util";
import { getAutoPseudoRPCBindings } from "src/scripting/modules/autoPseudo";
import { SpellRuntimeModulePseudo } from "src/scripting/runtime/SpellRuntimeAPI";
import { SpellPseudoRuntimeCtx } from "src/scripting/runtime/SpellWorkerModuleAPI";

export default {
  name: "speed",
  manifest: {
    description: "Controls how fast the spell interpreter executes.",
    export: {
      kind: "function",
      description: "Sets the interpreter execution speed (clamped 0.001–100).",
      params: [{ name: "speed", type: "number" }]
    }
  },
  requirePseudo: (ctx: JSRunnerCtx<SpellPseudoRuntimeCtx>) => {
    const { runner } = ctx;
    const { interpreter } = runner;
    const setSpeed = async (arg: unknown, cb: () => void) => {
      if (!isPrimitiveValue(arg) || typeof arg !== "number") {
        runner.encapsulateAndThrow("Invalid speed; must be a number.");
        cb();
        return;
      }
      const boundedSpeed = Math.max(0.001, Math.min(100, arg));
      await getAutoPseudoRPCBindings(runner).SpeedNative.setSpeed(boundedSpeed);
      cb();
    };
    return interpreter.createAsyncFunction(setSpeed);
  }
} satisfies SpellRuntimeModulePseudo;
