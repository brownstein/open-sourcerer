import { LevelDefinitionAPI } from "src/engine/level/LevelLoaderAPI";

import DoxistestScreenshot from "./Doxistest.png";

export const Doxistest: LevelDefinitionAPI = {
  id: "Doxistest",
  screenshotImage: DoxistestScreenshot,
  mapJson: async () =>
    (await import("src/levels/tiled/maps/dev/forest zone 3.tmj")).default
};
