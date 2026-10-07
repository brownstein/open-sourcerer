import { createSelector } from "reselect";

import { HotKeys } from "src/api/hotkeys";
import { ItemData } from "src/api/item";
import { SpellItemData } from "src/api/spells";
import { savedSpellToItemData } from "src/api/spells";
import { PotionDefinition, PotionType } from "src/items/consumables/Potion";
import { RootState } from "src/redux/rootState";
import { selectAllScriptsById } from "src/redux/scriptLibrary/selectors";

import { EquippedWeaponTypes, ItemTypes, typeVariantName } from "./slice";

// Use this fallback for selector defaults to prevent re-renders.
const empty_fallback = {};

export const selectCurrencies = (state: RootState) => state.inventory.coins;

export const selectEquippedWeapon = (state: RootState) =>
  state.inventory.equippedWeapon;

export const selectHotKeyCurrentRow = (state: RootState) =>
  state.inventory.hotKeyCurrentRow;
/** Number of hotkey rows the player can switch between — 1 unless unlocked. */
export const selectHotKeyRowCount = (state: RootState) =>
  state.inventory.hotKeyRowCount;
export const selectHotKeyMap = (state: RootState) =>
  state.inventory.hotKeyMap[selectHotKeyCurrentRow(state)] ?? empty_fallback;
export const selectHotKeyMapForRow = (state: RootState, row: number) =>
  state.inventory.hotKeyMap[row] ?? empty_fallback;
export const selectHotKeysUsedAt = (state: RootState) =>
  state.inventory.hotKeyUsedAt[selectHotKeyCurrentRow(state)] ?? empty_fallback;

export const selectItemGrid = (state: RootState) => state.inventory.itemGrid;

export const selectConsumableItem = (
  state: RootState,
  itemType: string,
  itemVariant: string
) => state.inventory.consumables[typeVariantName(itemType, itemVariant)];

export const selectQuestItem = (state: RootState, itemType: string) =>
  state.inventory.questItems[typeVariantName(itemType)];

export const selectSpellItem = (state: RootState, scriptId: string) =>
  state.inventory.spellItems[scriptId];

export const selectHotKeyUsedAt = (state: RootState) =>
  state.inventory.hotKeyUsedAt;

export const selectConsumablesMap = (state: RootState) =>
  state.inventory.consumables;

export const selectQuestItemsMap = (state: RootState) =>
  state.inventory.questItems;

export const selectHealthPotions = createSelector(
  [selectConsumablesMap],
  (consumables) => {
    const typeVariant = typeVariantName(
      PotionDefinition.type,
      PotionType.Health
    );
    const consumable = consumables[typeVariant];
    if (!consumable) return null;
    return {
      type: consumable.itemType,
      variant: consumable.itemVariant,
      count: consumable.count ?? 1
    };
  }
);

export const selectManaPotions = createSelector(
  [selectConsumablesMap],
  (consumables) => {
    const typeVariant = typeVariantName(PotionDefinition.type, PotionType.Mana);
    const consumable = consumables[typeVariant];
    if (!consumable) return null;
    return {
      type: consumable.itemType,
      variant: consumable.itemVariant,
      count: consumable.count ?? 1
    };
  }
);

export const selectHotKeyItems = createSelector(
  [selectHotKeyMap, selectAllScriptsById, selectConsumablesMap],
  (hotKeyMap, allScripts, consumableMap) => {
    const result: Partial<Record<HotKeys, ItemData>> = {};
    if (!hotKeyMap) return result;
    for (const [hotKey, assignment] of Object.entries(hotKeyMap)) {
      if (!assignment) continue;
      switch (assignment.type) {
        case "spell":
          const spell = allScripts[assignment.scriptId];
          result[hotKey as HotKeys] = savedSpellToItemData(spell);
          break;
        case "weapon":
          result[hotKey as HotKeys] = {
            type: assignment.weaponType
          };
          break;
        case "consumable": {
          const { itemType, itemVariant } = assignment;
          const tv = typeVariantName(itemType, itemVariant);
          const consumable = consumableMap[tv];
          if (!consumable) break;
          result[hotKey as HotKeys] = {
            type: consumable.itemType,
            variant: consumable.itemVariant,
            count: consumable.count ?? 1
          };
          break;
        }
        default:
          break;
      }
    }
    return result;
  }
);

export function selectHotKeyItemsForRow(
  state: RootState,
  row: number
): Partial<Record<HotKeys, ItemData>> {
  const hotKeyMap = selectHotKeyMapForRow(state, row);
  const allScripts = selectAllScriptsById(state);
  const consumableMap = selectConsumablesMap(state);
  const result: Partial<Record<HotKeys, ItemData>> = {};
  if (!hotKeyMap) return result;
  for (const [hotKey, assignment] of Object.entries(hotKeyMap)) {
    if (!assignment) continue;
    switch (assignment.type) {
      case "spell":
        const spell = allScripts[assignment.scriptId];
        result[hotKey as HotKeys] = savedSpellToItemData(spell);
        break;
      case "weapon":
        result[hotKey as HotKeys] = {
          type: assignment.weaponType
        };
        break;
      case "consumable": {
        const { itemType, itemVariant } = assignment;
        const tv = typeVariantName(itemType, itemVariant);
        const consumable = consumableMap[tv];
        if (!consumable) break;
        result[hotKey as HotKeys] = {
          type: consumable.itemType,
          variant: consumable.itemVariant,
          count: consumable.count ?? 1
        };
        break;
      }
      default:
        break;
    }
  }
  return result;
}

export const selectHasSword = (state: RootState) =>
  !!state.inventory.questItems["Sword"];

export const selectItemGridItems = createSelector(
  [selectItemGrid, selectConsumablesMap],
  (itemGrid, consumableMap) => {
    if (!itemGrid) return [];

    const result = new Array<ItemData | null>(25);

    for (let i = 0; i < itemGrid.length; i++) {
      const assignment = itemGrid[i];
      if (!assignment) {
        result[i] = null;
        continue;
      }

      switch (assignment.type) {
        case "weapon":
          result[i] = {
            type: assignment.weaponType
          };
          break;
        case "quest": {
          result[i] = {
            type: assignment.itemType
          };
          break;
        }
        case "consumable": {
          const { itemType, itemVariant } = assignment;
          const tv = typeVariantName(itemType, itemVariant);
          const consumable = consumableMap[tv];
          if (!consumable) break;
          result[i] = {
            type: consumable.itemType,
            variant: consumable.itemVariant,
            count: consumable.count ?? 1
          };
          break;
        }
        default:
          break;
      }
    }
    return result;
  }
);

export const selectSpellsAsItemData = createSelector(
  [selectAllScriptsById],
  (allScripts) => {
    return Object.values(allScripts).map(savedSpellToItemData);
  }
);

export const selectConsumablesAsItemData = createSelector(
  [selectConsumablesMap],
  (consumablesMap) => {
    return Object.values(consumablesMap).map((consumable) => ({
      type: consumable.itemType,
      variant: consumable.itemVariant,
      count: consumable.count ?? 1
    }));
  }
);

export const selectQuestItemsAsItemData = createSelector(
  [selectQuestItemsMap],
  (questItemsMap) => {
    return Object.values(questItemsMap)
      .filter(
        (i) =>
          !Object.values(EquippedWeaponTypes).includes(
            i.itemType as EquippedWeaponTypes
          )
      )
      .map((questItem) => ({
        type: questItem.itemType
      }));
  }
);

export const selectWeaponItemsAsItemData = createSelector(
  [selectQuestItemsMap],
  (questItemsMap) => {
    return Object.values(questItemsMap)
      .filter((i) =>
        Object.values(EquippedWeaponTypes).includes(
          i.itemType as EquippedWeaponTypes
        )
      )
      .map((questItem) => ({
        type: questItem.itemType
      }));
  }
);

export const selectedItemTypes: Record<
  ItemTypes,
  (state: RootState) => ItemData[]
> = {
  [ItemTypes.weapon]: selectWeaponItemsAsItemData,
  [ItemTypes.consumable]: selectConsumablesAsItemData,
  [ItemTypes.spell]: selectSpellsAsItemData,
  [ItemTypes.quest]: selectQuestItemsAsItemData
};

export enum Orders {
  alphabetical = "A-Z",
  rAlphabetical = "Z-A",
  numerical = "0-9",
  rNumerical = "9-0"
}

export const orderFunctions: Record<
  Orders,
  (a: ItemData, b: ItemData) => number
> = {
  [Orders.alphabetical]: (a, b) =>
    a.type.localeCompare(b.type) ||
    (a?.variant ?? "").localeCompare(b?.variant ?? "") ||
    ((a as SpellItemData)?.scriptName ?? "").localeCompare(
      (b as SpellItemData)?.scriptName ?? ""
    ),
  [Orders.rAlphabetical]: (a, b) =>
    -(
      a.type.localeCompare(b.type) ||
      (a?.variant ?? "").localeCompare(b?.variant ?? "") ||
      ((a as SpellItemData)?.scriptName ?? "").localeCompare(
        (b as SpellItemData)?.scriptName ?? ""
      )
    ),

  [Orders.numerical]: (a, b) => (a.count ?? 0) - (b.count ?? 0),
  [Orders.rNumerical]: (a, b) => -((a.count ?? 0) - (b.count ?? 0))
};
