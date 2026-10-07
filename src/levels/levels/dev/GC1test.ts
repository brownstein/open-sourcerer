import { LevelDefinitionAPI } from "src/engine/level/LevelLoaderAPI";

import GC1testScreenshot from "./GC1test.png";

export const GC1test: LevelDefinitionAPI = {
  id: "GC1test",
  screenshotImage: GC1testScreenshot,
  mapJson: async () =>
    (await import("src/levels/tiled/maps/dev/GC1test.tmj")).default
};
