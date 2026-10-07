import { InterpreterFunction, InterpreterScope } from "js-interpreter";

import { createTypedEventEmitter } from "src/api/util";
import { IVector2 } from "src/engine/util/vecTypes";
import { autoTranslateClass, exposeProp } from "src/scripting/core/Bindings";
import { JSRunnerCtx } from "src/scripting/core/api";
import { getAutoPseudoRPCBindings } from "src/scripting/modules/autoPseudo";
import {
  addAsyncCall,
  earlyResolveWithPromise
} from "src/scripting/modules/shared/stackMagic";
import { SpellVector } from "src/scripting/modules/shared/spellVector";
import { SpellRuntimeModulePseudo } from "src/scripting/runtime/SpellRuntimeAPI";
import {
  SpellPseudoRuntimeCtx,
  moduleAPIFromRunner
} from "src/scripting/runtime/SpellWorkerModuleAPI";

import { AIM_MODULE_NAME, AimModuleMessage } from "./Aim.native";

function isAimModuleMessage(data: unknown): data is AimModuleMessage {
  return !!(data as AimModuleMessage).isAimModuleMessage;
}

export default {
  name: "aim",
  manifest: {
    description: "Lets the player aim a point with the cursor.",
    export: {
      kind: "object",
      description: "Aim functions and click callbacks.",
      properties: {
        world: {
          kind: "function",
          description: "Resolves to the clicked world position as a Vector.",
          returns: "Vector"
        },
        relative: {
          kind: "function",
          description:
            "Resolves to the clicked position relative to the caster, as a Vector.",
          returns: "Vector"
        },
        asyncRelative: {
          kind: "function",
          description: "Promise variant of relative().",
          returns: "Vector"
        },
        onClick: {
          kind: "function",
          description: "Registers a callback fired on each click.",
          params: [{ name: "cb", type: "function" }]
        },
        offClick: {
          kind: "function",
          description: "Removes a previously registered click callback.",
          params: [{ name: "cb", type: "function" }]
        }
      }
    }
  },
  requirePseudo: async (ctx: JSRunnerCtx<SpellPseudoRuntimeCtx>) => {
    const { runner } = ctx;
    const rpcs = getAutoPseudoRPCBindings(runner).AimNative;
    const moduleEvents = moduleAPIFromRunner(runner)?.getModuleEvents(
      AIM_MODULE_NAME
    );

    await rpcs.init();

    @autoTranslateClass()
    class AimLib {
      private clickHandlers: {
        func: InterpreterFunction;
        scope: InterpreterScope;
      }[] = [];
      private events = createTypedEventEmitter<{ click: IVector2 }>();
      private listeningForMessages = false;
      private listening = false;

      private onModuleMessage = (msg: unknown) => {
        if (isAimModuleMessage(msg)) {
          if (msg.clickAtCoordinates)
            this.events.emit("click", msg.clickAtCoordinates);
        }
      };

      constructor() {
        this.beginListening();
      }

      @exposeProp()
      public async beginListening() {
        if (this.listening) return;
        this.listening = true;
        this.events.on("click", (coordinates) => {
          const coordinatesVector = new SpellVector(coordinates.x, coordinates.y);
          for (const cb of this.clickHandlers) {
            addAsyncCall(
              runner,
              cb.func,
              [runner.translate.nativeToPseudo(coordinatesVector)],
              cb.scope
            );
          }
        });
      }

      @exposeProp()
      public async world() {
        const aimResult = await rpcs.aim();
        if (!aimResult) return null;
        return new SpellVector(aimResult.x, aimResult.y);
      }

      @exposeProp()
      public async relative() {
        const aimResult = await rpcs.aimRelative();
        if (!aimResult) return null;
        return new SpellVector(aimResult.x, aimResult.y);
      }

      @exposeProp({ synch: true })
      asyncRelative() {
        const [resolve, reject] = earlyResolveWithPromise(runner);
        this.relative()
          .then((vect) => {
            resolve(runner.translate.nativeToPseudo(vect));
          })
          .catch((err) => {
            reject(runner.translate.nativeToPseudo(err));
          });
      }

      @exposeProp({ synch: true, raw: true })
      public onClick(cb: InterpreterFunction) {
        const interpreter = runner.interpreter;
        if (!interpreter.isa(cb, interpreter.FUNCTION)) {
          throw new Error("Supplied callback is not a function.");
        }
        this.clickHandlers.push({ func: cb, scope: interpreter.getScope() });
        runner.incrementOutstandingPromises(1);
        if (!this.listeningForMessages) {
          this.listeningForMessages = true;
          moduleEvents?.on("moduleMessage", this.onModuleMessage);
        }
      }

      @exposeProp({ synch: true, raw: true })
      public offClick(cb: InterpreterFunction) {
        const interpreter = runner.interpreter;
        if (!interpreter.isa(cb, interpreter.FUNCTION)) {
          throw new Error("Supplied callback is not a function.");
        }
        const initialLength = this.clickHandlers.length;
        this.clickHandlers = this.clickHandlers.filter((h) => h.func !== cb);
        runner.incrementOutstandingPromises(
          this.clickHandlers.length - initialLength
        );
        if (this.clickHandlers.length === 0 && this.listeningForMessages) {
          this.listeningForMessages = false;
          moduleEvents?.off("moduleMessage", this.onModuleMessage);
        }
      }
    }

    return runner.translate.nativeToPseudo(new AimLib());
  }
} satisfies SpellRuntimeModulePseudo;
