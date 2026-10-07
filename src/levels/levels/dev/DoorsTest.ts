import { LevelDefinitionAPI } from "src/engine/level/LevelLoaderAPI";

import DoorsTestScreenshot from "./DoorsTest.png";

export const DoorsTest: LevelDefinitionAPI = {
  id: "DoorsTest",
  screenshotImage: DoorsTestScreenshot,
  mapJson: async () =>
    (await import("src/levels/tiled/maps/dev/doorstest.tmj")).default
};
