import { LevelDefinitionAPI } from "src/engine/level/LevelLoaderAPI";

export const Area1_5_ShrineHallA: LevelDefinitionAPI = {
  id: "Area1_5_ShrineHallA",
  mapJson: async () => (await import("../../../tiled/maps/area1-intro/a5-shrine-hall-a.tmj")).default,
};
