import { LevelDefinitionAPI } from "src/engine/level/LevelLoaderAPI";

export const Area1_7_ShrinePuzzles1: LevelDefinitionAPI = {
  id: "Area1_7_ShrinePuzzles1",
  mapJson: async () => (await import("../../../tiled/maps/area1-intro/a7-shrine-puzzle-1.tmj")).default,
};
