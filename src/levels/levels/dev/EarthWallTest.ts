import { savedSpellToItemData } from "src/api/spells";
import { LevelDefinitionAPI } from "src/engine/level/LevelLoaderAPI";
import { builtInSpells } from "src/scripting/builtinScripts";

import { ensureInventory } from "../shared/ensureInventory";
import SimpleTesterScreenshot from "./SimpleTester.png";

export const EarthWallTest: LevelDefinitionAPI = {
  id: "EarthWallTest",
  screenshotImage: SimpleTesterScreenshot,
  mapJson: async () =>
    (await import("../../tiled/maps/dev/EarthWallTest.tmj")).default,
  setup: (level) => {
    ensureInventory({
      item: savedSpellToItemData(builtInSpells.EarthWall),
      hotkey: true,
      ignoreIfPresent: true
    });
  }
};
