import { InterpreterPseudoValue } from "js-interpreter";

import { JSRunnerCtx } from "src/scripting/core/api";
import { delay } from "src/scripting/core/util";
import { createPromiseGeneratingInterpreterState } from "src/scripting/modules/shared/stackMagic";
import { SpellRuntimeModulePseudo } from "src/scripting/runtime/SpellRuntimeAPI";
import { SpellPseudoRuntimeCtx } from "src/scripting/runtime/SpellWorkerModuleAPI";

export default {
  name: "wait",
  manifest: {
    description: "Pauses spell execution without blocking the game loop.",
    export: {
      kind: "function",
      description: "Waits for the given milliseconds (default 1000).",
      params: [{ name: "ms", type: "number" }],
      properties: {
        async: {
          kind: "function",
          description: "Promise-based variant for use inside async functions.",
          params: [{ name: "ms", type: "number" }]
        }
      }
    }
  },
  requirePseudo: (ctx: JSRunnerCtx<SpellPseudoRuntimeCtx>) => {
    const { interpreter } = ctx.runner;
    async function wait(msRaw: number, cb: () => void) {
      try {
        const ms = typeof msRaw === "number" ? msRaw : 1000;
        await delay(ms);
        cb();
      } catch (err) {
        ctx.runner.encapsulateAndThrow(
          err instanceof Error ? err.message : (err as string)
        );
        cb();
      }
    }
    async function waitAsync(
      msRaw: number,
      cb: (result: InterpreterPseudoValue | void) => void
    ) {
      if (typeof msRaw !== "number") {
        ctx.runner.encapsulateAndThrow("waitAsync expects a number.");
        return cb();
      }

      // Build a state, get the resolve function.
      const [newState, resolve] = createPromiseGeneratingInterpreterState(
        ctx.runner
      );
      // Remove the current function evaluation state.
      interpreter.stateStack.pop();
      // Replace that state with a state that will resolve our created Promise.
      interpreter.stateStack.push(newState);
      interpreter.paused_ = false;

      // Wait for the requested time.
      await delay(msRaw);
      // Invoke resolver.
      cb();
      resolve();
    }
    const pseudoWait = interpreter.createAsyncFunction(wait);
    interpreter.setProperty(
      pseudoWait,
      "async",
      interpreter.createAsyncFunction(waitAsync)
    );
    return pseudoWait;
  }
} satisfies SpellRuntimeModulePseudo;
