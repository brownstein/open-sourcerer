import { LevelDefinitionAPI } from "src/engine/level/LevelLoaderAPI";

import DebugInfiniteFallDeathScreenshot from "./DebugInfiniteFallDeath.png";

export const DebugInfiniteFallDeath: LevelDefinitionAPI = {
  id: "DebugInfiniteFallDeath",
  screenshotImage: DebugInfiniteFallDeathScreenshot,
  mapJson: async () =>
    (await import("../../tiled/maps/dev/DebugInfiniteFallDeath.tmj")).default
};
