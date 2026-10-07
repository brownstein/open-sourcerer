import { LevelDefinitionAPI } from "src/engine/level/LevelLoaderAPI";

export const GateOfComparison: LevelDefinitionAPI = {
  id: "GateOfComparison",
  mapJson: async () => (await import("../../tiled/maps/dev/GateOfComparison.tmj")).default,
};
