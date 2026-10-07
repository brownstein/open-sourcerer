import { savedSpellToItemData } from "src/api/spells";
import { EquippedWeaponTypes } from "src/redux/inventory/slice";
import { builtInSpells } from "src/scripting/builtinScripts";

import { ensureInventory } from "./ensureInventory";

export function ensureQueenArenaLoadout() {
  ensureInventory(
    {
      item: { type: EquippedWeaponTypes.Sword },
      hotkey: true,
      ignoreIfPresent: true
    },
    ...[
      builtInSpells.EarthWall,
      builtInSpells.Firerang,
      builtInSpells.AirBurst,
      builtInSpells.AirDodge,
      builtInSpells.Heal
    ].map((spell) => ({
      item: savedSpellToItemData(spell),
      hotkey: true,
      ignoreIfPresent: true
    }))
  );
}
