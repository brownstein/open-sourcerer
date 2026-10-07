import { InterpreterPseudoValue } from "js-interpreter";

import { JSRunnerCtx } from "src/scripting/core/api";
import { Sensor } from "src/scripting/entites/definitions/Sensor";
import { SpellRuntimeModulePseudo } from "src/scripting/runtime/SpellRuntimeAPI";
import { SpellPseudoRuntimeCtx } from "src/scripting/runtime/SpellWorkerModuleAPI";

export default {
  name: "sensor",
  manifest: {
    description: "Detects entities within a radius of the caster.",
    export: {
      kind: "class",
      description:
        "Creates a sensor that follows the caster and reports nearby entities, with enter/leave callbacks.",
      constructorParams: [
        {
          name: "opts",
          type: "{ radius?: number, spark?: { id: string } }",
          optional: true
        }
      ],
      constructorOpts: {
        radius: {
          kind: "value",
          valueType: "number",
          description: "Detection radius in world units"
        },
        spark: {
          kind: "value",
          valueType: "{ id: string }",
          description: "ManaSpark to attach the sensor to"
        }
      },
      properties: {
        id: { kind: "value", valueType: "string" },
        ready: { kind: "value", valueType: "boolean" },
        position: { kind: "value", valueType: "{ x: number, y: number }" },
        destroyed: { kind: "value", valueType: "boolean" },
        entities: {
          kind: "value",
          valueType: "Entity[]",
          description: "Entities currently inside the sensor"
        },
        onEntityEnter: {
          kind: "function",
          description: "Registers a callback fired when an entity enters.",
          params: [{ name: "cb", type: "function" }]
        },
        onEntityLeave: {
          kind: "function",
          description: "Registers a callback fired when an entity leaves.",
          params: [{ name: "cb", type: "function" }]
        }
      }
    }
  },
  requirePseudo: (
    ctx: JSRunnerCtx<SpellPseudoRuntimeCtx>
  ): InterpreterPseudoValue | Promise<InterpreterPseudoValue> => {
    return ctx.runner.translate.nativeToPseudo(Sensor);
  }
} satisfies SpellRuntimeModulePseudo;
