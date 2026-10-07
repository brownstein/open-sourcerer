import { InterpreterPseudoValue } from "js-interpreter";

import { JSRunnerCtx } from "src/scripting/core/api";
import { SpellVector } from "src/scripting/modules/shared/spellVector";
import { SpellRuntimeModulePseudo } from "src/scripting/runtime/SpellRuntimeAPI";
import { SpellPseudoRuntimeCtx } from "src/scripting/runtime/SpellWorkerModuleAPI";

export default {
  name: "vector",
  manifest: {
    description: "2D vector with chainable math helpers.",
    export: {
      kind: "class",
      description:
        "Creates a 2D vector. Accepts (x, y), an [x, y] array, or a { x, y } object.",
      constructorParams: [
        { name: "xOrObj", type: "number | [number, number] | { x: number, y: number }", optional: true },
        { name: "y", type: "number", optional: true }
      ],
      properties: {
        x: { kind: "value", valueType: "number" },
        y: { kind: "value", valueType: "number" },
        clone: { kind: "function", returns: "Vector" },
        add: {
          kind: "function",
          params: [{ name: "other", type: "{ x: number, y: number }" }],
          returns: "Vector"
        },
        sub: {
          kind: "function",
          params: [{ name: "other", type: "{ x: number, y: number }" }],
          returns: "Vector"
        },
        scale: {
          kind: "function",
          params: [{ name: "scale", type: "number" }],
          returns: "Vector"
        },
        rotate: {
          kind: "function",
          params: [{ name: "rotation", type: "number" }],
          returns: "Vector"
        },
        length: { kind: "function", returns: "number" },
        dot: {
          kind: "function",
          params: [{ name: "other", type: "{ x: number, y: number }" }],
          returns: "number"
        },
        normalize: { kind: "function", returns: "Vector" },
        angle: { kind: "function", returns: "number" },
        round: {
          kind: "function",
          params: [{ name: "radix", type: "number", optional: true }],
          returns: "Vector"
        }
      }
    }
  },
  requirePseudo: (
    ctx: JSRunnerCtx<SpellPseudoRuntimeCtx>
  ): InterpreterPseudoValue | Promise<InterpreterPseudoValue> => {
    return ctx.runner.translate.nativeToPseudo(SpellVector);
  }
} satisfies SpellRuntimeModulePseudo;
