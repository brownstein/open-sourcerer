import { Color } from "three";

import { LevelDefinitionAPI } from "src/engine/level/LevelLoaderAPI";
export const GaianArena: LevelDefinitionAPI = {
  id: "GaianArena",
  mapJson: async () => (await import("src/levels/tiled/maps/area-1-forest/gaianBossArea.tmj")).default,
  backgroundColor: new Color(235 / 255, 209 / 255, 174 / 255).multiplyScalar(
    0.9
  )
};
