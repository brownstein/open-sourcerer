import { LevelDefinitionAPI } from "src/engine/level/LevelLoaderAPI";

import industryPng from "../../tiled/maps/dev/industry-bg.png";

export const DreTestingRoom: LevelDefinitionAPI = {
  id: "DreTestingRoom",
  mapJson: async () => (await import("../../tiled/maps/dev/DreTestingRoom.tmj")).default,
  images: {
    "industry-bg": industryPng
  }
};
