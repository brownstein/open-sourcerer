import { JSRunnerCtx } from "src/scripting/core/api";
import { getAutoPseudoRPCBindings } from "src/scripting/modules/autoPseudo";
import { SpellRuntimeModulePseudo } from "src/scripting/runtime/SpellRuntimeAPI";
import { SpellPseudoRuntimeCtx } from "src/scripting/runtime/SpellWorkerModuleAPI";

export default {
  name: "playerControls",
  manifest: {
    description: "Drives the player's controls (jump, move, attack).",
    export: {
      kind: "object",
      description: "Functions that emit player control events.",
      properties: {
        jump: { kind: "function", description: "Makes the player jump." },
        moveHorizontally: {
          kind: "function",
          description: "Moves the player horizontally (-1 left, 1 right).",
          params: [{ name: "direction", type: "number" }]
        },
        secondaryAttack: {
          kind: "function",
          description: "Triggers the player's secondary attack."
        },
        swordSwing: {
          kind: "function",
          description: "Triggers a sword swing."
        }
      }
    }
  },
  requirePseudo: (ctx: JSRunnerCtx<SpellPseudoRuntimeCtx>) => {
    const { runner } = ctx;
    const rpcs = getAutoPseudoRPCBindings(runner).PlayerControlsNative;
    const api = {
      jump: () => {
        rpcs.jump();
      },
      moveHorizontally: (direction: number) => {
        rpcs.moveHorizontally(direction);
      },
      secondaryAttack: () => {
        rpcs.secondaryAttack();
      },
      swordSwing: () => {
        rpcs.swordSwing();
      }
    };
    return runner.translate.nativeToPseudo(api);
  }
} satisfies SpellRuntimeModulePseudo;
