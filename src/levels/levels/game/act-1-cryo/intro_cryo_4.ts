import { Color } from "three";

import { LevelDefinitionAPI } from "src/engine/level/LevelLoaderAPI";
export const Cryo_4: LevelDefinitionAPI = {
  id: "Cryo_4",
  mapJson: async () => (await import("src/levels/tiled/maps/act-1/area-3-caves-1.tmj")).default,
  backgroundColor: new Color("#443311")
};
