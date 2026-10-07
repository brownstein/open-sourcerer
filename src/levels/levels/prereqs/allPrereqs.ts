import { ItemData } from "src/api/item";
import { savedSpellToItemData } from "src/api/spells";
import { SwordDefinition } from "src/items/equipment/Sword";
import { builtInSpells } from "src/scripting/builtinScripts";

export const act1PrereqsA: ItemData[] = [
  {
    type: SwordDefinition.type
  },
  savedSpellToItemData(builtInSpells.GenericProjectile)
];
