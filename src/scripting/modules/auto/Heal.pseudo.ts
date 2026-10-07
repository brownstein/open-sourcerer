import {
  autoTranslateClass,
  exposeProp,
  markStaticCastableFunction
} from "src/scripting/core/Bindings";
import { JSRunnerCtx } from "src/scripting/core/api";
import { getAutoPseudoRPCBindings } from "src/scripting/modules/autoPseudo";
import { SpellRuntimeModulePseudo } from "src/scripting/runtime/SpellRuntimeAPI";
import { SpellPseudoRuntimeCtx } from "src/scripting/runtime/SpellWorkerModuleAPI";

import {
  HealInstantArg,
  HealOverTimeArg,
  healConstructorValidator,
  healInstantValidator,
  healOverTimeValidator
} from "./validators/healValidators";

export default {
  name: "heal",
  manifest: {
    description: "Nature magic — restore health, instantly or over time.",
    export: {
      kind: "class",
      description:
        "Heal spell. Use the static Heal.instant / Heal.overTime spells (castable via spark.cast).",
      constructorParams: [
        {
          name: "opts",
          type: "{ targetId?: string, strength?: number }",
          optional: true
        }
      ],
      properties: {},
      staticProperties: {
        instant: {
          kind: "function",
          description: "Instantly heals the target (or caster).",
          params: [{ name: "opts", type: "{ strength?: number }" }]
        },
        overTime: {
          kind: "function",
          description: "Heals the target over several seconds.",
          params: [{ name: "opts", type: "{ strength?: number }" }]
        },
        Heal: { kind: "value", valueType: "class" }
      }
    }
  },
  requirePseudo: (ctx: JSRunnerCtx<SpellPseudoRuntimeCtx>) => {
    const { runner } = ctx;

    @autoTranslateClass({
      constructorAsync: true,
      constructorValidator: healConstructorValidator
    })
    class Heal {
      public readyPromise = Promise.resolve();

      @exposeProp()
      static Heal = Heal;

      @exposeProp({
        validator: (opt) => healInstantValidator.validateSync(opt),
        exposeErrorMessages: true
      })
      @markStaticCastableFunction()
      static async instant(opt: HealInstantArg) {
        const strength: number = opt.strength ?? 50;
        await getAutoPseudoRPCBindings(runner).HealNative.instantHeal({
          strength
        });
      }

      @exposeProp({
        validator: (opt) => healOverTimeValidator.validateSync(opt),
        exposeErrorMessages: true
      })
      @markStaticCastableFunction()
      static async overTime(opt: HealOverTimeArg) {
        const strength: number = opt.strength ?? 50;
        await getAutoPseudoRPCBindings(runner).HealNative.healOverTime({
          strength
        });
      }
    }

    return runner.translate.nativeToPseudo(Heal);
  }
} satisfies SpellRuntimeModulePseudo;
