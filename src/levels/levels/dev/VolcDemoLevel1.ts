import { LevelDefinitionAPI } from "src/engine/level/LevelLoaderAPI";

import VolcDemoLevel1Screenshot from "./VolcDemoLevel1.png";

export const VolcDemoLevel1: LevelDefinitionAPI = {
  id: "VolcDemoLevel1",
  screenshotImage: VolcDemoLevel1Screenshot,
  mapJson: async () =>
    (await import("../../tiled/maps/dev/VolcDemoLevel1.tmj")).default
};
