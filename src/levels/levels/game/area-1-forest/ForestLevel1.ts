import { Color } from "three";

import { LevelDefinitionAPI } from "src/engine/level/LevelLoaderAPI";
export const ForestLevel1: LevelDefinitionAPI = {
  id: "ForestLevel1",
  mapJson: async () => (await import("src/levels/tiled/maps/area-1-forest/forestlevel1.tmj")).default,
  backgroundColor: new Color(235 / 255, 209 / 255, 174 / 255).multiplyScalar(
    0.5
  )
};
