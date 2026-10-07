import { JSRunnerCtx } from "src/scripting/core/api";
import { getAutoPseudoRPCBindings } from "src/scripting/modules/autoPseudo";
import { SpellRuntimeModulePseudo } from "src/scripting/runtime/SpellRuntimeAPI";
import { SpellPseudoRuntimeCtx } from "src/scripting/runtime/SpellWorkerModuleAPI";

import type { LineOfSightOpts, TerrainQueryOpts } from "./Terrain.native";

export default {
  name: "terrain",
  manifest: {
    description: "Query terrain — line of sight and nav-grid sampling.",
    export: {
      kind: "object",
      description: "Terrain query functions.",
      properties: {
        checkLineOfSight: {
          kind: "function",
          description:
            "Returns whether terrain blocks the line between two points.",
          params: [
            {
              name: "opts",
              type: "{ from: { x: number, y: number }, to: { x: number, y: number }, ignoreEntities?: boolean }"
            }
          ],
          returns: "boolean"
        },
        queryGrid: {
          kind: "function",
          description:
            "Samples the nav-grid over a region, returning a 2D block grid.",
          params: [
            {
              name: "opts",
              type: "{ min: { x: number, y: number }, max: { x: number, y: number }, relative?: boolean }"
            }
          ],
          returns: "{ grid: number[][], resolution: number }"
        }
      }
    }
  },
  requirePseudo: (ctx: JSRunnerCtx<SpellPseudoRuntimeCtx>) => {
    const { runner } = ctx;
    const rpcs = getAutoPseudoRPCBindings(runner).TerrainNative;
    return runner.translate.nativeToPseudo({
      async checkLineOfSight(opts: LineOfSightOpts) {
        return await rpcs.checkLineOfSight(opts);
      },
      async queryGrid(opts: TerrainQueryOpts) {
        return await rpcs.queryGrid(opts);
      }
    });
  }
} satisfies SpellRuntimeModulePseudo;
