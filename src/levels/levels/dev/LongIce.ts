import { Color } from "three";

import { savedSpellToItemData } from "src/api/spells";
import { LevelDefinitionAPI } from "src/engine/level/LevelLoaderAPI";
import { builtInSpells } from "src/scripting/builtinScripts";

import { ensureInventory } from "../shared/ensureInventory";

// Built-in ice spells handed to the player on load, one per hotbar slot.
const iceSpells = [
  builtInSpells.IceSpike,
  builtInSpells.IceRam,
  builtInSpells.IceShield,
  builtInSpells.IceBubble
];

// A long, horizontally-scrolling room tiled with the cryolab (ice) tileset —
// a wide arena for testing traversal and combat against a frozen backdrop.
export const LongIce: LevelDefinitionAPI = {
  id: "LongIce",
  backgroundColor: new Color("#112233"),
  mapJson: async () =>
    (await import("src/levels/tiled/maps/dev/LongIce.tmj")).default,
  setup: () => {
    ensureInventory(
      ...iceSpells.map((spell) => ({
        item: savedSpellToItemData(spell),
        hotkey: true,
        ignoreIfPresent: true
      }))
    );
  }
};
