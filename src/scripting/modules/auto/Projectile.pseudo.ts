import { InterpreterPseudoValue } from "js-interpreter";

import { JSRunnerCtx } from "src/scripting/core/api";
import { Projectile } from "src/scripting/entites/definitions/Projectile";
import { SpellRuntimeModulePseudo } from "src/scripting/runtime/SpellRuntimeAPI";
import { SpellPseudoRuntimeCtx } from "src/scripting/runtime/SpellWorkerModuleAPI";

export default {
  name: "projectile",
  manifest: {
    description: "A configurable projectile with optional homing/steering.",
    export: {
      kind: "class",
      description:
        "Creates a generic projectile from the caster, with configurable element, color, gravity, and trail.",
      constructorParams: [
        {
          name: "opts",
          type: "{ velocity?: { x: number, y: number }, strength?: number, aim?: boolean, aimSpeed?: number, aimGuide?: boolean, directPath?: boolean, gravity?: number, radius?: number, elementalType?: string, damageType?: string, colorInner?: { r: number, g: number, b: number }, colorOuter?: { r: number, g: number, b: number }, spark?: { id: string } }",
          optional: true
        }
      ],
      constructorOpts: {
        velocity: {
          kind: "value",
          valueType: "{ x: number, y: number }",
          description: "Initial velocity"
        },
        strength: {
          kind: "value",
          valueType: "number",
          description: "Damage/mana strength"
        },
        aim: { kind: "value", valueType: "boolean" },
        aimSpeed: { kind: "value", valueType: "number" },
        aimGuide: { kind: "value", valueType: "boolean" },
        directPath: { kind: "value", valueType: "boolean" },
        gravity: {
          kind: "value",
          valueType: "number",
          description: "Gravity coefficient (0 = none)"
        },
        radius: { kind: "value", valueType: "number" },
        elementalType: { kind: "value", valueType: "string" },
        damageType: { kind: "value", valueType: "string" },
        colorInner: {
          kind: "value",
          valueType: "{ r: number, g: number, b: number }"
        },
        colorOuter: {
          kind: "value",
          valueType: "{ r: number, g: number, b: number }"
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
        setVelocity: {
          kind: "function",
          description: "Sets the projectile's velocity.",
          params: [{ name: "velocity", type: "{ x: number, y: number }" }]
        },
        moveTo: {
          kind: "function",
          description:
            "Moves the projectile toward a point; resolves when it arrives.",
          params: [
            { name: "opt", type: "{ x: number, y: number, speed?: number }" }
          ]
        },
        moveToAsync: {
          kind: "function",
          description: "Async/promise variant of moveTo().",
          params: [
            { name: "opt", type: "{ x: number, y: number, speed?: number }" }
          ]
        },
        canMoveTo: {
          kind: "function",
          description:
            "Returns whether the projectile has line of sight to a point.",
          params: [{ name: "opt", type: "{ x: number, y: number }" }],
          returns: "boolean"
        }
      },
      staticProperties: {
        Projectile: { kind: "value", valueType: "class" }
      }
    }
  },
  requirePseudo: (
    ctx: JSRunnerCtx<SpellPseudoRuntimeCtx>
  ): InterpreterPseudoValue | Promise<InterpreterPseudoValue> => {
    return ctx.runner.translate.nativeToPseudo(Projectile);
  }
} satisfies SpellRuntimeModulePseudo;
