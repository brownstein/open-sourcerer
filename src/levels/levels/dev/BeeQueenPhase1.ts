import { LevelDefinitionAPI } from "src/engine/level/LevelLoaderAPI";

import { ensureQueenArenaLoadout } from "../shared/ensureQueenArenaLoadout";

export const BeeQueenPhase1: LevelDefinitionAPI = {
  id: "BeeQueenPhase1",
  mapJson: async () => (await import("./BeeQueenPhase1.tmj")).default,
  images: {},
  setup: () => ensureQueenArenaLoadout()
};
