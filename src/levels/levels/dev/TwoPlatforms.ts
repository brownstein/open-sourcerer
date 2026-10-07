import { savedSpellToItemData } from "src/api/spells";
import { LevelDefinitionAPI } from "src/engine/level/LevelLoaderAPI";
import { ToggleableTerrain } from "src/entities/environment/ToggleableTerrain";
import { IOCustomNode } from "src/entities/environment/connectors/IOCustomNode";
import { builtInSpells } from "src/scripting/builtinScripts";

import { ensureInventory } from "../shared/ensureInventory";
import TwoPlatformsScreenshot from "./TwoPlatforms.png";

export const TwoPlatforms: LevelDefinitionAPI = {
  id: "TwoPlatforms",
  screenshotImage: TwoPlatformsScreenshot,
  mapJson: async () =>
    (await import("src/levels/tiled/maps/dev/TwoPlatforms.tmj")).default,
  setup: (level) => {
    ensureInventory({
      item: savedSpellToItemData(builtInSpells.Fireball),
      hotkey: true,
      ignoreIfPresent: true
    });

    const test = level.getEntityForName<IOCustomNode>("Test");
    if (!test) {
      console.warn(":(");
      return;
    }

    const terrainTest = level.getEntitiesForType(ToggleableTerrain).at(0);
    if (!terrainTest) {
      console.warn(":(");
      return;
    }

    test.attachProcessingCallback((inputs) => {
      const input = inputs.input;
      if (!(typeof input === "boolean")) return;

      if (input) terrainTest.activate();
      else terrainTest.deactivate();
    });
  }
};
