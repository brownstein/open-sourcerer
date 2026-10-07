import { LevelDefinitionAPI } from "src/engine/level/LevelLoaderAPI";
import { store } from "src/redux/store";
import { EnableElements, enableUIElements } from "src/redux/ui/slice";

import DemoHallwayScreenshot from "../../tiled/maps/demo/DemoHallway.png";
import cityBg1 from "./backgrounds/city-1.png";
import cityBg2 from "./backgrounds/city-2.png";
import cityBg3 from "./backgrounds/city-3.png";
import { Bee } from "src/entities/enemies/critters/Bee";
import { MotionPath } from "src/entities/environment/MotionPath";

export const DemoHallway: LevelDefinitionAPI = {
  id: "DemoHallway",
  screenshotImage: DemoHallwayScreenshot,
  mapJson: async () =>
    (await import("../../tiled/maps/demo/DemoHallway.tmj")).default,
  images: {
    "city-1": cityBg1,
    "city-2": cityBg2,
    "city-3": cityBg3
  },
  setup: (level) => {
    store.dispatch(
      enableUIElements([
        EnableElements.CodeEditor,
        EnableElements.HUD,
        EnableElements.Health,
        EnableElements.Mana,
        EnableElements.HotBar,
        EnableElements.HotBarBottom,
        EnableElements.Layout
      ])
    );

    const bee = level.getEntityForName<Bee>("PathBee");
    const path = level.getEntityForName<MotionPath>("BeePath");
    if (bee && path) {
      bee.behaviors.scriptedControl.setMode("path");
      bee.behaviors.motionPathFollowing.enable();
    }
  }
};
