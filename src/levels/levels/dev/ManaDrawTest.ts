import { LevelDefinitionAPI } from "src/engine/level/LevelLoaderAPI";

import ManaDrawTestScreenshot from "./ManaDrawTest.png";

export const ManaDrawTest: LevelDefinitionAPI = {
  id: "ManaDrawTest",
  screenshotImage: ManaDrawTestScreenshot,
  mapJson: async () =>
    (await import("src/levels/tiled/maps/dev/ManaDrawTest.tmj")).default
};
