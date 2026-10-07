import { JSRunnerCtx } from "src/scripting/core/api";
import { getAutoPseudoRPCBindings } from "src/scripting/modules/autoPseudo";
import { SpellRuntimeModulePseudo } from "src/scripting/runtime/SpellRuntimeAPI";
import { SpellPseudoRuntimeCtx } from "src/scripting/runtime/SpellWorkerModuleAPI";

import { iVector2Spec } from "./validators/basicValidators";
import { ImpulseOpt, targetIdSpec } from "./validators/airValidators";

export default {
  name: "air",
  manifest: {
    description: "Wind magic — shove entities with an air burst.",
    export: {
      kind: "object",
      description: "Air spell functions.",
      properties: {
        burst: {
          kind: "function",
          description:
            "Applies a wind impulse to a target (or the caster if none given).",
          params: [
            {
              name: "impulse",
              type: "{ x: number, y: number }",
              optional: true
            },
            {
              name: "targetId",
              type: "string | { entityId?: string, handleId?: string }",
              optional: true
            }
          ]
        }
      }
    }
  },
  requirePseudo: (ctx: JSRunnerCtx<SpellPseudoRuntimeCtx>) => {
    const { runner } = ctx;
    return runner.translate.nativeToPseudo({
      async burst(vectorIn: unknown, targetIdIn: unknown) {
        const opt: ImpulseOpt = {};
        try {
          if (targetIdIn) opt.targetId = targetIdSpec.validateSync(targetIdIn);
          if (vectorIn) opt.impulse = iVector2Spec.validateSync(vectorIn);
        } catch (err) {
          console.warn(err);
        }
        await getAutoPseudoRPCBindings(runner).AirNative.applyAirBurst(opt);
      }
    });
  }
} satisfies SpellRuntimeModulePseudo;
