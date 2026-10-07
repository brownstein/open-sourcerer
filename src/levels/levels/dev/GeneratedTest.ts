import { LevelDefinitionAPI } from "src/engine/level/LevelLoaderAPI";

import GeneratedTestScreenshot from "./GeneratedTest.png";

export const GeneratedTest: LevelDefinitionAPI = {
  id: "GeneratedTest",
  screenshotImage: GeneratedTestScreenshot,
  mapJson: async () =>
    (await import("src/levels/tiled/maps/dev/GeneratedTest.tmj")).default
};
