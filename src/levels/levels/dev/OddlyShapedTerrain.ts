import { LevelDefinitionAPI } from "src/engine/level/LevelLoaderAPI";

import OddlyShapedTerrainScreenshot from "./OddlyShapedTerrain.png";

export const OddlyShapedTerrain: LevelDefinitionAPI = {
  id: "OddlyShapedTerrain",
  screenshotImage: OddlyShapedTerrainScreenshot,
  mapJson: async () =>
    (await import("src/levels/tiled/maps/dev/OddlyShapedTerrain.tmj")).default
};
