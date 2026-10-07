import { DeferredEmitter } from "src/engine/util/deferredEmitter";
import { arr2 } from "src/engine/util/vecTypes";
import { autoTranslateClass, exposeProp } from "src/scripting/core/Bindings";
import { JSRunnerCtx } from "src/scripting/core/api";
import { getAutoPseudoRPCBindings } from "src/scripting/modules/autoPseudo";
import { SpellRuntimeModulePseudo } from "src/scripting/runtime/SpellRuntimeAPI";
import { SpellPseudoRuntimeCtx } from "src/scripting/runtime/SpellWorkerModuleAPI";

import {
  AreaPreviewConstructorArg,
  areaPreviewConstructorValidator
} from "./validators/areaPreviewValidators";

export default {
  name: "areaPreview",
  manifest: {
    description: "Draws a translucent polygon overlay in the world.",
    export: {
      kind: "class",
      description:
        "Creates an area-preview overlay from a polygon, optionally attached to an entity.",
      constructorParams: [
        {
          name: "opts",
          type: "{ polygon: ({ x: number, y: number } | [number, number])[], attachToEntityId?: string, color?: { r: number, g: number, b: number } }"
        }
      ],
      properties: {
        id: { kind: "value", valueType: "string" },
        recolor: {
          kind: "function",
          description: "Recolors the preview.",
          params: [
            { name: "r", type: "number" },
            { name: "g", type: "number" },
            { name: "b", type: "number" }
          ]
        },
        destroy: {
          kind: "function",
          description: "Fades the preview away.",
          returns: "void"
        }
      }
    }
  },
  requirePseudo: (ctx: JSRunnerCtx<SpellPseudoRuntimeCtx>) => {
    const { runner } = ctx;
    const rpcs = getAutoPseudoRPCBindings(runner).AreaPreviewNative;

    @autoTranslateClass({
      constructorAsync: true,
      constructorValidator: areaPreviewConstructorValidator
    })
    class AreaPreview {
      private deferredReady = new DeferredEmitter();
      public readyPromise = this.deferredReady.getPromise();

      @exposeProp({ synch: true })
      public id: string | undefined;

      constructor(opt: AreaPreviewConstructorArg) {
        this._constructAsync(opt);
      }

      private async _constructAsync(opt: AreaPreviewConstructorArg) {
        try {
          // Convert {x,y} objects to [x,y] arrays for the RPC boundary.
          const polygon: arr2[] = opt.polygon.map((v) =>
            Array.isArray(v) ? (v as arr2) : [v.x, v.y]
          );
          const result = await rpcs.createPreview({
            polygon,
            attachToEntityId: opt.attachToEntityId ?? undefined,
            color: opt.color ?? undefined
          });
          this.id = result.id;
          this.deferredReady.emit("done");
        } catch (err) {
          console.warn("Failed to construct AreaPreview", err);
          this.deferredReady.emit("cancel");
        }
      }

      @exposeProp()
      public async recolor(r: number, g: number, b: number) {
        await this.readyPromise;
        if (this.id) {
          await rpcs.recolorPreview({ id: this.id, color: { r, g, b } });
        }
      }

      @exposeProp()
      public async destroy() {
        await this.readyPromise;
        if (this.id) {
          await rpcs.destroyPreview({ id: this.id });
        }
      }
    }

    return runner.translate.nativeToPseudo(AreaPreview);
  }
} satisfies SpellRuntimeModulePseudo;
