import { LevelDefinitionAPI } from "src/engine/level/LevelLoaderAPI";

export const Area1_3_Cave2: LevelDefinitionAPI = {
  id: "Area1_3_Cave2",
  mapJson: async () => (await import("../../../tiled/maps/area1-intro/a3.2-cave-2.tmj")).default,
};
