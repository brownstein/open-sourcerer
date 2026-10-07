import { savedSpellToItemData } from "src/api/spells";
import { LevelDefinitionAPI } from "src/engine/level/LevelLoaderAPI";
import { Chest } from "src/entities/environment/Chest";
import { CurrencyType } from "src/items/currencies/Currency";

import levelScreenshot from "src/levels/tiled/maps/dev/ScalingChallenge.png";
import { builtInSpells } from "src/scripting/builtinScripts";

export const ScalingChallengePuzzle: LevelDefinitionAPI = {
  id: "ScalingChallengePuzzle",
  screenshotImage: levelScreenshot,
  mapJson: async () => (await import("src/levels/tiled/maps/dev/ScalingChallenge.tmj")).default,
  setup: (level) => {
    const spellChest = level.getEntityForName<Chest>("SpellChest");
    const rewardChest = level.getEntityForName<Chest>("RewardChest");
    if (!spellChest || !rewardChest) return;
    spellChest.behaviors.inventory.items = [
      savedSpellToItemData(builtInSpells.Climb)
    ];
    rewardChest.behaviors.inventory.items = [
      {
        type: "Currency",
        variant: CurrencyType.Red
      }
    ];
  }
}
