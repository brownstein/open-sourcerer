import { LevelDefinitionAPI } from "src/engine/level/LevelLoaderAPI";

import DoorsTest2Screenshot from "./DoorsTest2.png";

export const DoorsTest2: LevelDefinitionAPI = {
  id: "DoorsTest2",
  screenshotImage: DoorsTest2Screenshot,
  mapJson: async () =>
    (await import("src/levels/tiled/maps/dev/doorstest2.tmj")).default
};
