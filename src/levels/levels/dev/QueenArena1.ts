import { LevelDefinitionAPI } from "src/engine/level/LevelLoaderAPI";

import crystalcaveBg0 from "../../tiled/backgrounds/caves/crystalcave-bg-0.png";
import crystalcaveBg1 from "../../tiled/backgrounds/caves/crystalcave-bg-1.png";
import crystalcaveBg2 from "../../tiled/backgrounds/caves/crystalcave-bg-2.png";
import crystalcaveBg3 from "../../tiled/backgrounds/caves/crystalcave-bg-3.png";
import { ensureQueenArenaLoadout } from "../shared/ensureQueenArenaLoadout";

export const QueenArena1: LevelDefinitionAPI = {
  id: "QueenArena1",
  mapJson: async () => (await import("./QueenArena1.tmj")).default,
  images: {
    "crystalcave-bg-0": crystalcaveBg0,
    "crystalcave-bg-1": crystalcaveBg1,
    "crystalcave-bg-2": crystalcaveBg2,
    "crystalcave-bg-3": crystalcaveBg3
  },
  setup: () => ensureQueenArenaLoadout()
};
