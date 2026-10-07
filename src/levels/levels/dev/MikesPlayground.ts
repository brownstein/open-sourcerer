import { LevelDefinitionAPI } from "src/engine/level/LevelLoaderAPI";

import MikesPlaygroundScreenshot from "./MikesPlayground.png";

export const MikesPlayground: LevelDefinitionAPI = {
  id: "MikesPlayground",
  screenshotImage: MikesPlaygroundScreenshot,
  mapJson: async () =>
    (await import("../../tiled/maps/dev/MikesPlayground.tmj")).default
};
