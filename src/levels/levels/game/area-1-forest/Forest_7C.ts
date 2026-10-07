import { Color } from "three";

import { LevelDefinitionAPI } from "src/engine/level/LevelLoaderAPI";
export const Forest_7C: LevelDefinitionAPI = {
  id: "Forest_7C",
  mapJson: async () => (await import("src/levels/tiled/maps/area-1-forest/Forest-7C.tmj")).default,
  backgroundColor: new Color(235 / 255, 209 / 255, 174 / 255).multiplyScalar(
    0.9
  )
};
