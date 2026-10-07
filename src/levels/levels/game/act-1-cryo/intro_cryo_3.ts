import { Color } from "three";

import { LevelDefinitionAPI } from "src/engine/level/LevelLoaderAPI";
import bg from "src/levels/tiled/maps/act-1/l4-bunker-side.png";
import purpleTank from "src/levels/tiled/maps/act-1/purple-tank.png";

export const Cryo_3: LevelDefinitionAPI = {
  id: "Cryo_3",
  mapJson: async () => (await import("src/levels/tiled/maps/act-1/area-2-cryo-cave-transition.tmj")).default,
  backgroundColor: new Color("#443300"),
  images: {
    "l4-bunker-side": bg,
    "purple-tank": purpleTank
  },
  setup: (level) => {
    level.state.setValue("allowFallToNextLevel", true);
  }
};
