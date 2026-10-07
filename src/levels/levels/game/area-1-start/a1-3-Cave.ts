import { LevelDefinitionAPI } from "src/engine/level/LevelLoaderAPI";

export const Area1_3_Cave: LevelDefinitionAPI = {
  id: "Area1_3_Cave",
  mapJson: async () => (await import("../../../tiled/maps/area1-intro/a3-cave.tmj")).default,
};
