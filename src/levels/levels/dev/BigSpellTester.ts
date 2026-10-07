import { LevelDefinitionAPI } from "src/engine/level/LevelLoaderAPI";
import { store } from "src/redux/store";
import { EnableElements, enableUIElements } from "src/redux/ui/slice";

import BigSpellTesterScreenshot from "./BigSpellTester.png";

export const BigSpellTester: LevelDefinitionAPI = {
  id: "BigSpellTester",
  screenshotImage: BigSpellTesterScreenshot,
  mapJson: async () =>
    (await import("../../tiled/maps/dev/Big Spell Tester.tmj")).default,
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
