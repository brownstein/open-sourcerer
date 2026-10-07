import { savedSpellToItemData } from "src/api/spells";
import { LevelDefinitionAPI } from "src/engine/level/LevelLoaderAPI";
import { builtInSpells } from "src/scripting/builtinScripts";

import { ensureInventory } from "../shared/ensureInventory";

export const SignalPlatforms: LevelDefinitionAPI = {
  id: "SignalPlatforms",
  mapJson: async () =>
    (await import("./SignalPlatforms.tmj")).default,
  setup: (level) => {
    ensureInventory({
      item: savedSpellToItemData(builtInSpells.Fireball),
      hotkey: true,
      ignoreIfPresent: true
    });
  }
};
