import { LevelDefinitionAPI } from "src/engine/level/LevelLoaderAPI";

export const Area1_8_DeepWell: LevelDefinitionAPI = {
  id: "Area1_8_DeepWell",

  mapJson: async () => (await import("../../../tiled/maps/area1-intro/a8-DeepWell.tmj")).default,
};
