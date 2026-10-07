import { LevelDefinitionAPI } from "src/engine/level/LevelLoaderAPI";

import DebugPlaygroundScreenshot from "./DebugPlayground.png";

export const DebugPlayground: LevelDefinitionAPI = {
  id: "DebugPlayground",
  screenshotImage: DebugPlaygroundScreenshot,
  mapJson: async () =>
    (await import("src/levels/tiled/maps/dev/DebugPlayground.tmj")).default
};
