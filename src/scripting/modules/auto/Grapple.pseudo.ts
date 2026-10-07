import { DeferredEmitter } from "src/engine/util/deferredEmitter";
import {
  autoTranslateClass,
  exposeProp,
  markStaticCastableFunction
} from "src/scripting/core/Bindings";
import { JSRunnerCtx } from "src/scripting/core/api";
import { getAutoPseudoRPCBindings } from "src/scripting/modules/autoPseudo";
import { isKnownError } from "src/scripting/runtime/SpellErrors";
import { SpellRuntimeModulePseudo } from "src/scripting/runtime/SpellRuntimeAPI";
import { SpellPseudoRuntimeCtx } from "src/scripting/runtime/SpellWorkerModuleAPI";

import {
  GrappleConstructorArg,
  castRayValidator,
  grappleConstructorValidator
} from "./validators/grappleValidators";

export default {
  name: "grapple",
  manifest: {
    description: "Grappling hook — a spring line to a point or entity.",
    export: {
      kind: "class",
      description:
        "Creates a grapple line from the caster to a target point. Also exposes Grapple.castRay.",
      constructorParams: [
        {
          name: "opts",
          type: "{ targetX: number, targetY: number, sourceEntityId?: string, targetEntityId?: string, length?: number, springiness?: number }"
        }
      ],
      properties: {
        id: { kind: "value", valueType: "string" },
        setLength: {
          kind: "function",
          params: [
            { name: "length", type: "number" },
            { name: "transitionMs", type: "number", optional: true }
          ]
        },
        setSpringiness: {
          kind: "function",
          params: [
            { name: "springiness", type: "number" },
            { name: "transitionMs", type: "number", optional: true }
          ]
        },
        detach: { kind: "function", returns: "void" }
      },
      staticProperties: {
        castRay: {
          kind: "function",
          description:
            "Casts a ray from the caster, returning the first terrain/enemy hit.",
          params: [
            {
              name: "opts",
              type: "{ directionX: number, directionY: number, maxDistance?: number }"
            }
          ],
          returns:
            "{ hit: boolean, x: number, y: number, distance: number, entityId?: string }"
        },
        Grapple: { kind: "value", valueType: "class" }
      }
    }
  },
  requirePseudo: (ctx: JSRunnerCtx<SpellPseudoRuntimeCtx>) => {
    const { runner } = ctx;
    const rpcs = getAutoPseudoRPCBindings(runner).GrappleNative;

    @autoTranslateClass({
      constructorAsync: true,
      constructorValidator: (opt) =>
        grappleConstructorValidator.validateSync(opt)
    })
    class Grapple {
      private deferredReady = new DeferredEmitter();
      public readyPromise = this.deferredReady.getPromise();

      @exposeProp({ synch: true })
      public id?: string;

      constructor(opt?: GrappleConstructorArg) {
        this._constructAsync(opt);
      }

      private async _constructAsync(opt?: GrappleConstructorArg) {
        try {
          if (!opt)
            throw new Error(
              "[Grapple]: Constructor requires target coordinates."
            );
          const result = await rpcs.createGrapple({
            targetX: opt.targetX,
            targetY: opt.targetY,
            sourceEntityId: opt.sourceEntityId ?? undefined,
            targetEntityId: opt.targetEntityId ?? undefined,
            length: opt.length ?? undefined,
            springiness: opt.springiness ?? undefined
          });
          this.id = result.id;
          this.deferredReady.emit("done");
        } catch (err) {
          console.warn("Failed to construct Grapple.", err);
          this.deferredReady.emit(
            "cancel",
            isKnownError(err) ? err.message : "Failed to construct Grapple."
          );
        }
      }

      @exposeProp()
      static Grapple = Grapple;

      @exposeProp({ exposeErrorMessages: true })
      @markStaticCastableFunction()
      static async castRay(arg: unknown) {
        const validated = castRayValidator.validateSync(arg);
        return await rpcs.castRay({
          directionX: validated.directionX,
          directionY: validated.directionY,
          maxDistance: validated.maxDistance ?? undefined
        });
      }

      @exposeProp({ exposeErrorMessages: true })
      public async setLength(length: number, transitionMs?: number) {
        if (!this.id) throw new Error("[Grapple]: Grapple not yet ready.");
        await rpcs.setGrappleLength(this.id, length, transitionMs ?? 0);
      }

      @exposeProp({ exposeErrorMessages: true })
      public async setSpringiness(springiness: number, transitionMs?: number) {
        if (!this.id) throw new Error("[Grapple]: Grapple not yet ready.");
        await rpcs.setGrappleSpringiness(
          this.id,
          springiness,
          transitionMs ?? 0
        );
      }

      @exposeProp({ exposeErrorMessages: true })
      public async detach() {
        if (!this.id) throw new Error("[Grapple]: Grapple not yet ready.");
        await rpcs.destroyGrapple(this.id);
      }
    }

    return runner.translate.nativeToPseudo(Grapple);
  }
} satisfies SpellRuntimeModulePseudo;
