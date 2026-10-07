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

// An empty, enclosed room tiled with the cryolab (ice) tileset — a bare
// arena for testing against a frozen backdrop. Just a player and a flat floor.
export const IceLevel01: LevelDefinitionAPI = {
  id: "IceLevel01",
  backgroundColor: new Color("#16324a"),
  mapJson: async () =>
    (await import("src/levels/tiled/maps/dev/IceLevel01.tmj")).default,
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
