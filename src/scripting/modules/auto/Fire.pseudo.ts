import { InterpreterPseudoValue } from "js-interpreter";

import {
  autoTranslateClass,
  exposeProp,
  markStaticCastableFunction
} from "src/scripting/core/Bindings";
import { JSRunnerCtx } from "src/scripting/core/api";
import { isPrimitiveValue } from "src/scripting/core/util";
import { Fireball } from "src/scripting/entites/definitions/Fireball";
import { getAutoPseudoRPCBindings } from "src/scripting/modules/autoPseudo";
import {
  fireballOptValidator,
  fireblastArgsValidator,
  firewaveArgsValidator
} from "src/scripting/modules/auto/validators/fireValidators";
import { SpellRuntimeModulePseudo } from "src/scripting/runtime/SpellRuntimeAPI";
import { SpellPseudoRuntimeCtx } from "src/scripting/runtime/SpellWorkerModuleAPI";

export default {
  name: "fire",
  // Autocomplete docs (see MODULE_PATTERNS.md). Lives on the pseudo definition.
  manifest: {
    description: "Fireball — a fire projectile that can be aimed and detonated.",
    export: {
      kind: "class",
      description:
        "Creates a Fireball projectile from the caster. Also exposes Fire.blast and Fire.wave static spells.",
      constructorParams: [
        {
          name: "opts",
          type: "{ velocity?: { x: number, y: number }, at?: { x: number, y: number }, strength?: number, gravity?: boolean, aim?: boolean, aimSpeed?: number, aimGuide?: boolean, spark?: { id: string } }",
          optional: true
        }
      ],
      constructorOpts: {
        velocity: {
          kind: "value",
          valueType: "{ x: number, y: number }",
          description: "Initial velocity"
        },
        at: {
          kind: "value",
          valueType: "{ x: number, y: number }",
          description: "Fire toward an absolute position"
        },
        strength: {
          kind: "value",
          valueType: "number",
          description: "Damage/mana strength (cost is 5 + strength)"
        },
        gravity: {
          kind: "value",
          valueType: "boolean",
          description: "Whether gravity affects the fireball"
        },
        aim: {
          kind: "value",
          valueType: "boolean",
          description: "Aim the fireball with the cursor"
        },
        aimSpeed: { kind: "value", valueType: "number" },
        aimGuide: { kind: "value", valueType: "boolean" },
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
          description: "Sets the fireball's velocity.",
          params: [{ name: "velocity", type: "{ x: number, y: number }" }]
        },
        moveTo: {
          kind: "function",
          description:
            "Moves the fireball toward a point; resolves when it arrives.",
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
        explode: {
          kind: "function",
          description: "Detonates the fireball into an explosion.",
          returns: "void"
        },
        onImpact: {
          kind: "function",
          description: "Registers a callback fired when the fireball impacts.",
          params: [{ name: "cb", type: "function" }]
        }
      },
      staticProperties: {
        blast: {
          kind: "function",
          description: "Casts a short-range fire blast from the caster.",
          params: [{ name: "arg", type: "boolean | object", optional: true }]
        },
        wave: {
          kind: "function",
          description: "Casts a travelling wave of fire blasts along the ground.",
          params: [{ name: "arg", type: "boolean | object", optional: true }]
        },
        Fireball: { kind: "value", valueType: "class" }
      }
    }
  },
  requirePseudo: (
    ctx: JSRunnerCtx<SpellPseudoRuntimeCtx>
  ): InterpreterPseudoValue | Promise<InterpreterPseudoValue> => {
    // Inline subclass so the runner-bound static spells (blast/wave) can close
    // over this runner's RPC bindings. The Fireball entity stub itself carries
    // no statics — only the class returned from require("fire") does.
    @autoTranslateClass({
      constructorAsync: true,
      constructorValidator: (opt) => fireballOptValidator.validateSync(opt)
    })
    class Fire extends Fireball {
      @exposeProp()
      static Fireball = Fire;

      @exposeProp({ exposeErrorMessages: true })
      @markStaticCastableFunction()
      static async blast(arg: unknown) {
        let aim = false;
        let casterId: string | undefined;
        let angle: number | undefined;
        if (isPrimitiveValue(arg)) {
          aim = !!arg;
        } else {
          const validated = fireblastArgsValidator.validateSync(arg);
          aim = validated.aim;
          angle = validated.angle ?? undefined;
          casterId = validated.spark?.id;
        }
        await getAutoPseudoRPCBindings(ctx.runner).FireNative.createBlast({
          aim,
          overrideCasterId: casterId,
          angle
        });
      }

      @exposeProp({ exposeErrorMessages: true })
      @markStaticCastableFunction()
      static async wave(arg: unknown) {
        let aim = false;
        let casterId: string | undefined;
        let angles: number[] = [0];
        let numBlasts = 10;
        let spacing = 0.3;
        let delayMs = 50;
        if (isPrimitiveValue(arg)) {
          aim = !!arg;
        } else if (arg) {
          const validated = firewaveArgsValidator.validateSync(arg);
          aim = validated.aim;
          angles = (validated.angles ?? []).filter(
            (a): a is number => typeof a === "number"
          );
          casterId = validated.spark?.id;
          numBlasts = validated.numBlasts;
          spacing = validated.spacing;
          delayMs = validated.delayMs;
        }
        await getAutoPseudoRPCBindings(ctx.runner).FireNative.createFirewave({
          angles,
          aim,
          overrideCasterId: casterId,
          numBlasts,
          spacing,
          delayMs
        });
      }
    }

    return ctx.runner.translate.nativeToPseudo(Fire);
  }
} satisfies SpellRuntimeModulePseudo;
