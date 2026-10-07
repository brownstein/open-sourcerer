import { LevelDefinitionAPI } from "src/engine/level/LevelLoaderAPI";

import MobileScreenshot from "./Mobile.png";

export const Mobile: LevelDefinitionAPI = {
  id: "Mobile",
  screenshotImage: MobileScreenshot,
  mapJson: async () =>
    (await import("../../tiled/maps/demo/mobile.tmj")).default,
  images: {}
};
