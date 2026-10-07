import { ItemDefinition } from "src/api/item";

import { PortraitDefinition } from "../components/viewport/overlays/hud/Portrait";
import { PotionDefinition } from "./consumables/Potion";
import { CurrencyDefinition } from "./currencies/Currency";
import { SwordDefinition } from "./equipment/Sword";
import { JunkDefinition } from "./quests/Junk";
import { BookDefinition, LogDefinition } from "./quests/QuestItems";
import { SpellDefinition } from "./spells/spell";
import { CrystalsDefintiion } from "./equipment/ManaCrystal";

export const allItems: ItemDefinition[] = [
  SpellDefinition,
  SwordDefinition,
  PotionDefinition,
  CurrencyDefinition,
  JunkDefinition,
  LogDefinition,
  BookDefinition,
  PortraitDefinition,
  CrystalsDefintiion,
];

const allItemDefinitionsByType: Record<string, ItemDefinition> = {};
for (const itemDef of allItems) {
  allItemDefinitionsByType[itemDef.type] = itemDef;
}

export { allItemDefinitionsByType };

export function getItemDefinitionByType(
  itemType: string
): ItemDefinition | undefined {
  return allItemDefinitionsByType[itemType];
}
