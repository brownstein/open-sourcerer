import { LevelDefinitionAPI } from "src/engine/level/LevelLoaderAPI";

import { act1PrereqsA } from "../../prereqs/allPrereqs";

export const RBHallway1: LevelDefinitionAPI = {
  id: "RBHallway1",
  mapJson: async () => (await import("./RBHallway1.tmj")).default,
  demoItems: act1PrereqsA
};

export const RBHallway2: LevelDefinitionAPI = {
  id: "RBHallway2",
  mapJson: async () => (await import("./RBHallway2.tmj")).default,
  demoItems: act1PrereqsA
};
