import { LevelDefinitionAPI } from "src/engine/level/LevelLoaderAPI";
import { store } from "src/redux/store";
import { EnableElements, enableUIElements } from "src/redux/ui/slice";

import industryPng from "../../tiled/maps/dev/industry-bg.png";
import CombatZoneScreenshot from "./CombatZone.png";

export const CombatZone: LevelDefinitionAPI = {
  id: "CombatZone",
  screenshotImage: CombatZoneScreenshot,
  mapJson: async () =>
    (await import("../../tiled/maps/dev/CombatZone.tmj")).default,
  images: {
    "industry-bg": industryPng
  },
  setup: () => {
    // Ensure we're displaying everything.
    store.dispatch(
      enableUIElements([
        EnableElements.CodeEditor,
        EnableElements.HUD,
        EnableElements.HotBar,
        EnableElements.Health,
        EnableElements.Mana
      ])
    );
  }
};
