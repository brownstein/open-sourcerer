import { savedSpellToItemData } from "src/api/spells";
import { LevelDefinitionAPI } from "src/engine/level/LevelLoaderAPI";
import { builtInSpells } from "src/scripting/builtinScripts";

import { ensureInventory } from "../shared/ensureInventory";
import SimpleTesterScreenshot from "./SimpleTester.png";

export const SimpleTester: LevelDefinitionAPI = {
  id: "SimpleTester",
  screenshotImage: SimpleTesterScreenshot,
  mapJson: async () =>
    (await import("../../tiled/maps/dev/SimpleTester.tmj")).default,
  setup: (level) => {
    ensureInventory({
      item: savedSpellToItemData(builtInSpells.Fireball),
      hotkey: true,
      ignoreIfPresent: true
    });
  }
};
