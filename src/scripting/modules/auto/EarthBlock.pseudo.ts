import { InterpreterPseudoValue } from "js-interpreter";

import { JSRunnerCtx } from "src/scripting/core/api";
import { EarthBlock } from "src/scripting/entites/definitions/EarthBlock";
import { SpellRuntimeModulePseudo } from "src/scripting/runtime/SpellRuntimeAPI";
import { SpellPseudoRuntimeCtx } from "src/scripting/runtime/SpellWorkerModuleAPI";

export default {
  name: "earth",
  manifest: {
    description: "Earth magic — conjure a solid stone block from a shape.",
    export: {
      kind: "class",
      description:
        "Creates an EarthBlock from a polygon, rectangle, circle, or a drawn shape.",
      constructorParams: [
        {
          name: "opts",
          type: "{ shape?: ({ x: number, y: number } | [number, number])[], holes?: ({ x: number, y: number } | [number, number])[][], rect?: { width: number, height: number }, circle?: { radius: number }, angle?: number, offset?: { x: number, y: number } | [number, number], drawShape?: boolean, spark?: { id: string } }",
          optional: true
        }
      ],
      constructorOpts: {
        shape: {
          kind: "value",
          valueType: "({ x: number, y: number } | [number, number])[]",
          description: "Custom polygon outline"
        },
        holes: {
          kind: "value",
          valueType: "({ x: number, y: number } | [number, number])[][]",
          description: "Polygon holes cut from the shape"
        },
        rect: {
          kind: "value",
          valueType: "{ width: number, height: number }"
        },
        circle: { kind: "value", valueType: "{ radius: number }" },
        angle: { kind: "value", valueType: "number" },
        offset: {
          kind: "value",
          valueType: "{ x: number, y: number } | [number, number]"
        },
        drawShape: {
          kind: "value",
          valueType: "boolean",
          description: "Let the player draw the shape with the cursor"
        },
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
        destroy: {
          kind: "function",
          description: "Shatters the earth block.",
          returns: "void"
        },
        detachFromTerrain: {
          kind: "function",
          description: "Detaches the block so it can move freely.",
          returns: "boolean"
        }
      }
    }
  },
  requirePseudo: (
    ctx: JSRunnerCtx<SpellPseudoRuntimeCtx>
  ): InterpreterPseudoValue | Promise<InterpreterPseudoValue> => {
    return ctx.runner.translate.nativeToPseudo(EarthBlock);
  }
} satisfies SpellRuntimeModulePseudo;
