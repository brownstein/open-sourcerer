import { InterpreterPseudoValue } from "js-interpreter";

import { JSRunnerCtx } from "src/scripting/core/api";
import { IceBlock } from "src/scripting/entites/definitions/IceBlock";
import { SpellRuntimeModulePseudo } from "src/scripting/runtime/SpellRuntimeAPI";
import { SpellPseudoRuntimeCtx } from "src/scripting/runtime/SpellWorkerModuleAPI";

export default {
  name: "ice",
  manifest: {
    description: "Ice magic — conjure a solid ice block from a shape.",
    export: {
      kind: "class",
      description:
        "Creates an IceBlock from a polygon, rectangle, or circle in front of the caster.",
      constructorParams: [
        {
          name: "opts",
          type: "{ shape?: ({ x: number, y: number } | [number, number])[], rect?: { width: number, height: number }, circle?: { radius: number }, angle?: number, spark?: { id: string } }",
          optional: true
        }
      ],
      constructorOpts: {
        shape: {
          kind: "value",
          valueType: "({ x: number, y: number } | [number, number])[]",
          description: "Custom polygon outline"
        },
        rect: {
          kind: "value",
          valueType: "{ width: number, height: number }",
          description: "Rectangle shape"
        },
        circle: {
          kind: "value",
          valueType: "{ radius: number }",
          description: "Circle shape"
        },
        angle: { kind: "value", valueType: "number" },
        spark: {
          kind: "value",
          valueType: "{ id: string }",
          description: "ManaSpark to cast from"
        }
      },
      properties: {
        id: { kind: "value", valueType: "string" },
        position: { kind: "value", valueType: "{ x: number, y: number }" },
        destroyed: { kind: "value", valueType: "boolean" },
        mana: {
          kind: "value",
          valueType: "number"
        },
        storeMana: {
          kind: "function",
          description:
            "Transfers mana from the caster into the ice block. Stored mana is spent to resist melting, keeping the block frozen longer.",
          returns: "void"
        },
        destroy: {
          kind: "function",
          description: "Shrinks and removes the ice block.",
          returns: "void"
        }
      }
    }
  },
  requirePseudo: (
    ctx: JSRunnerCtx<SpellPseudoRuntimeCtx>
  ): InterpreterPseudoValue | Promise<InterpreterPseudoValue> => {
    return ctx.runner.translate.nativeToPseudo(IceBlock);
  }
} satisfies SpellRuntimeModulePseudo;
