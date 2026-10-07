import { PayloadAction, createSlice } from "@reduxjs/toolkit";

import { HotKeys, OrderedHotKeys } from "src/api/hotkeys";
import { ItemData } from "src/api/item";
import { isSpellItemData } from "src/api/spells";
import { getItemDefinitionByType } from "src/items/allItems";
import {
  CurrencyType,
  getCurrencyVariantValue,
  isCurrencyVariant
} from "src/items/currencies/Currency";
import { deleteScript } from "src/redux/scriptLibrary/slice";
import { addItems, loadGame } from "src/redux/shared/actions";
import {
  EnableElements,
  disableUIElements,
  enableUIElements
} from "src/redux/ui/slice";

export enum ItemTypes {
  weapon = "weapon",
  consumable = "consumable",
  spell = "spell",
  quest = "quest"
}

export enum EquippedWeaponTypes {
  Sword = "Sword"
}

export type WeaponHotKeyAssignment = {
  type: "weapon";
  weaponType: EquippedWeaponTypes;
  itemData?: ItemData;
};

export type SpellHotKeyAssignment = {
  type: "spell";
  scriptId: string;
};

export type QuestAssignment = {
  type: "quest";
  itemType: string;
};

export function isSpellHotKeyAssignment(
  obj: any
): obj is SpellHotKeyAssignment {
  return (
    typeof obj === "object" &&
    obj != null &&
    obj.type === "spell" &&
    typeof obj.scriptId === "string"
  );
}

export type ConsumableHotKeyAssignment = {
  type: "consumable";
  // This could be an enum, but let's type as a string
  // for now and save some headache later if we want
  // to enable mods to inject custom items.
  itemType: string;
  itemVariant?: string;
};

export type HotKeyAssignment =
  | WeaponHotKeyAssignment
  | SpellHotKeyAssignment
  | ConsumableHotKeyAssignment;

export type GridAssignment = HotKeyAssignment | QuestAssignment;

export type ConsumableItem = {
  itemType: string;
  itemVariant?: string;
  count: number;
  gridIndex: number;
};

export type QuestItem = {
  itemType: string;
  count: number;
  gridIndex: number;
};

export type SpellItem = {
  scriptId: string;
};

export type CoinItem = {
  itemType: string;
  itemVariant?: string;
  count: number;
};

export type InventoryState = {
  equippedWeapon: EquippedWeaponTypes | null;
  hotKeyMap: Record<number, Partial<Record<HotKeys, HotKeyAssignment>>>;
  hotKeyCurrentRow: number;
  /**
   * How many hotkey rows the player can reach, mirrored from the
   * `HotBarMultipleRows` UI element flag. Rows past this are still readable in
   * the map (a save may have been made while they were unlocked) but are not
   * navigable and never receive auto-assigned pickups.
   */
  hotKeyRowCount: number;
  hotKeyUsedAt: Record<number, Partial<Record<HotKeys, number>>>;
  consumables: Record<string, ConsumableItem>;
  coins: number;
  questItems: Record<string, QuestItem>;
  spellItems: Record<string, SpellItem>;
  itemGrid: (GridAssignment | null)[];
};

export const typeVariantName = (type: string, variant?: string) =>
  variant ? `${type}:${variant}` : type;

export const kHotkeyRowCount = 5;
export const kHotKeyCountPerRow = 5;

const hotKeyRowCountForFlag = (multipleRowsEnabled: boolean) =>
  multipleRowsEnabled ? kHotkeyRowCount : 1;

function findHotKeySlot(
  state: InventoryState,
  predicate: (hk: HotKeyAssignment | null) => boolean,
  rowCount = kHotkeyRowCount
): [number, HotKeys] | null {
  for (let ri = 0; ri < rowCount; ri++) {
    if (!state.hotKeyMap[ri]) state.hotKeyMap[ri] = {};
    const hotKeyRow = state.hotKeyMap[ri];
    for (let ki = 0; ki < kHotKeyCountPerRow; ki++) {
      const hotKey = OrderedHotKeys[ki];
      if (predicate(hotKeyRow[hotKey] ?? null)) return [ri, hotKey];
    }
  }
  return null;
}

function findHotKeySlots(
  state: InventoryState,
  predicate: (hk: HotKeyAssignment | null) => boolean
): [number, HotKeys][] {
  let slots: [number, HotKeys][] = [];
  for (let ri = 0; ri < kHotkeyRowCount; ri++) {
    if (!state.hotKeyMap[ri]) state.hotKeyMap[ri] = {};
    const hotKeyRow = state.hotKeyMap[ri];
    for (let ki = 0; ki < kHotKeyCountPerRow; ki++) {
      const hotKey = OrderedHotKeys[ki];
      if (predicate(hotKeyRow[hotKey] ?? null)) slots.push([ri, hotKey]);
    }
  }
  return slots;
}

// Auto-assignment on pickup may only land in rows the player can actually
// reach, otherwise items disappear into a row with no way to switch to it.
const findOpenHotKeySlot = (state: InventoryState) =>
  findHotKeySlot(state, (hk) => !hk, state.hotKeyRowCount);

const inventorySlice = createSlice({
  name: "inventory",
  initialState: {
    equippedWeapon: null,
    hotKeyMap: {},
    hotKeyCurrentRow: 0,
    hotKeyRowCount: hotKeyRowCountForFlag(false),
    hotKeyUsedAt: {},
    consumables: {},
    questItems: {},
    spellItems: {},
    coins: 0,
    itemGrid: new Array(25).fill(null)
  } as InventoryState,
  reducers: {
    equipWeapon(state, action: PayloadAction<EquippedWeaponTypes | null>) {
      state.equippedWeapon = action.payload ?? null;
      if (state.equippedWeapon) {
        const itemDef = getItemDefinitionByType(state.equippedWeapon);
        if (!itemDef) {
          return;
        }
        itemDef.equip?.({
          type: itemDef.type
        });
      }
    },
    addCoins(
      state,
      action: PayloadAction<{ amount: number; variant?: CurrencyType | null }>
    ) {
      state.coins += action.payload.amount;
    },
    assignHotKey(
      state,
      action: PayloadAction<{
        hotKey: HotKeys;
        assignment: HotKeyAssignment | null;
      }>
    ) {
      const { hotKey, assignment } = action.payload;
      if (!state.hotKeyMap[state.hotKeyCurrentRow])
        state.hotKeyMap[state.hotKeyCurrentRow] = {};
      if (assignment) {
        state.hotKeyMap[state.hotKeyCurrentRow][hotKey] = assignment;
      } else {
        delete state.hotKeyMap[state.hotKeyCurrentRow][hotKey];
      }
    },
    assignHotKeys(
      state,
      action: PayloadAction<
        {
          hotKey: HotKeys;
          fromHotKey?: HotKeys;
          assignment?: HotKeyAssignment | null;
        }[]
      >
    ) {
      const currentHotKeyMap = { ...state.hotKeyMap };
      if (!state.hotKeyMap[state.hotKeyCurrentRow])
        state.hotKeyMap[state.hotKeyCurrentRow] = {};
      for (const { hotKey, fromHotKey, assignment } of action.payload) {
        if (fromHotKey) {
          state.hotKeyMap[state.hotKeyCurrentRow][hotKey] =
            currentHotKeyMap[state.hotKeyCurrentRow][fromHotKey];
        } else if (assignment) {
          state.hotKeyMap[state.hotKeyCurrentRow][hotKey] = assignment;
        } else {
          delete state.hotKeyMap[state.hotKeyCurrentRow][hotKey];
        }
      }
    },
    moveGridItem(
      state,
      action: PayloadAction<{
        indexFrom: number;
        indexTo: number;
      }>
    ) {
      const { indexFrom, indexTo } = action.payload;
      if (state.itemGrid[indexFrom] && indexTo >= 0) {
        let items = [state.itemGrid[indexFrom], state.itemGrid[indexTo]];
        let invIndexes = [indexTo, indexFrom];

        for (let i = 0; i < 2; i++) {
          let item = items[i];
          let index = invIndexes[i];

          switch (item?.type) {
            case "consumable":
              state.consumables[
                typeVariantName(item?.itemType, item?.itemVariant)
              ].gridIndex = index;
              break;
            case "weapon":
              state.questItems[typeVariantName(item?.weaponType)].gridIndex =
                index;
              break;
            case "quest":
              state.questItems[typeVariantName(item?.itemType)].gridIndex =
                index;
              break;
            case "spell":
              break;
          }
          state.itemGrid[index] = items[i];
        }
      }
    },
    consumeConsumableItem(
      state,
      action: PayloadAction<Pick<ConsumableItem, "itemType" | "itemVariant">>
    ) {
      const { itemType, itemVariant } = action.payload;
      const tv = typeVariantName(itemType, itemVariant);
      const stack = state.consumables[tv];
      if (!stack) return;
      stack.count--;
      if (stack.count === 0) {
        if (stack.gridIndex) state.itemGrid[stack.gridIndex] = null;
        delete state.consumables[tv];
      }
      const now = Date.now();
      for (let ri = 0; ri < kHotkeyRowCount; ri++) {
        const hotKeyRow = state.hotKeyMap[ri];
        if (!hotKeyRow) continue;
        for (const hotKeySlot of OrderedHotKeys) {
          const assignment = hotKeyRow[hotKeySlot];
          if (
            !assignment ||
            assignment.type !== "consumable" ||
            assignment.itemType !== itemType ||
            assignment.itemVariant !== itemVariant
          )
            continue;

          if (stack.count === 0) delete hotKeyRow[hotKeySlot];
          state.hotKeyUsedAt[ri][hotKeySlot] = now;
          break;
        }
      }
    },
    removeQuestItem(
      state,
      action: PayloadAction<Pick<QuestItem, "itemType"> & { count?: number }>
    ) {
      const { itemType, count = 1 } = action.payload;
      const tv = typeVariantName(itemType);
      const stack = state.questItems[tv];
      if (!stack) return;
      stack.count -= count;
      if (stack.count <= 0) {
        if (stack.gridIndex) state.itemGrid[stack.gridIndex] = null;
        delete state.questItems[tv];
      }
    },
    setHotKeyCurrentRow(state, action: PayloadAction<number>) {
      state.hotKeyCurrentRow = Math.min(
        Math.max(action.payload, 0),
        state.hotKeyRowCount - 1
      );
    },
    flushInventory(state) {
      state.coins = 0;
      state.consumables = {};
      state.hotKeyMap = {};
      for (const [key, item] of Object.entries(state.questItems)) {
        if (item === null) continue;
        const itemDef = getItemDefinitionByType(item.itemType);
        if (!itemDef) {
          console.warn("Item definition not found for type", key, item.itemType);
          continue;
        }
        itemDef.unEquip?.({
          type: item.itemType
        });
      }
      state.questItems = {};
      for (const item of state.itemGrid) {
        if (item === null) continue;
        const itemDef = getItemDefinitionByType(item.type);
        if (!itemDef) {
          console.warn("Item definition not found for type", item.type);
          continue;
        }
        itemDef.unEquip?.(item);
      }
      state.equippedWeapon = null;
      state.itemGrid = new Array(25).fill(null);
    }
  },
  extraReducers: (builder) => {
    builder.addCase(enableUIElements, (state, action) => {
      if (!action.payload.includes(EnableElements.HotBarMultipleRows)) return;
      state.hotKeyRowCount = hotKeyRowCountForFlag(true);
    });
    builder.addCase(disableUIElements, (state, action) => {
      if (!action.payload.includes(EnableElements.HotBarMultipleRows)) return;
      state.hotKeyRowCount = hotKeyRowCountForFlag(false);
      state.hotKeyCurrentRow = 0;
    });
    builder.addCase(addItems, (state, action) => {
      for (const itemPayload of action.payload) {
        const { item, hotkey, ignoreIfPresent } = itemPayload;
        const isScript = isSpellItemData(item);
        if (isScript) {
          const existingMatch = findHotKeySlot(
            state,
            (hk) => hk?.type === "spell" && hk.scriptId === item.scriptId
          );
          if (existingMatch) continue;
          state.spellItems[item.scriptId] = {
            scriptId: item.scriptId
          };
          if (hotkey) {
            const openHotKeySlot = findOpenHotKeySlot(state);
            if (openHotKeySlot) {
              const [openRowIndex, openIndex] = openHotKeySlot;
              state.hotKeyMap[openRowIndex][openIndex] = {
                type: "spell",
                scriptId: item.scriptId
              };
            }
          }
          continue;
        }
        const itemDef = getItemDefinitionByType(item.type);
        if (!itemDef) {
          console.warn("Item definition not found for type", item.type);
          continue;
        }
        // Note sure this is the best place to put this, but here's a hook callback to equip behavior.
        itemDef.equip?.(item);
        if (itemDef.isCurrency) {
          // The coin's value comes from its own variant (Green/Red/Blue);
          // fall back to the definition's variant, then to Green.
          const variant = isCurrencyVariant(item.variant)
            ? item.variant
            : isCurrencyVariant(itemDef.variant)
              ? itemDef.variant
              : CurrencyType.Green;
          const value = getCurrencyVariantValue(variant);
          state.coins += value * (itemPayload.count ?? 1);
          continue;
        }
        const typeVariant = typeVariantName(item.type, item.variant);
        if (itemDef.isQuestItem) {
          let stack = state.questItems[typeVariant];
          if (ignoreIfPresent && stack) continue;
          const isWeapon = item.type === EquippedWeaponTypes.Sword;
          if (!stack) {
            for (let i = 0; i < state.itemGrid.length; i++) {
              // Empty slots may be null or an unfilled hole (undefined), so
              // use a loose comparison to treat both as available.
              if (state.itemGrid[i]) continue;
              state.itemGrid[i] = isWeapon
                ? {
                    type: "weapon",
                    weaponType: item.type as EquippedWeaponTypes
                  }
                : {
                    type: "quest",
                    itemType: item.type
                  };
              state.questItems[typeVariant] = {
                itemType: item.type,
                count: 0,
                gridIndex: i
              };
              stack = state.questItems[typeVariant];
              break;
            }
          }
          // Kludge.
          if (!stack) continue;
          stack = state.questItems[typeVariant];
          stack.count += itemPayload.count ?? 1;
          if (isWeapon && hotkey) {
            if (
              !findHotKeySlot(
                state,
                (hk) => hk?.type === "weapon" && hk.weaponType === item.type
              )
            ) {
              const openHotKeySlot = findOpenHotKeySlot(state);
              if (openHotKeySlot) {
                const [openRowIndex, openIndex] = openHotKeySlot;
                state.hotKeyMap[openRowIndex][openIndex] = {
                  type: "weapon",
                  weaponType: item.type as EquippedWeaponTypes
                };
              }
            }
          }
          continue;
        }
        let stack = state.consumables[typeVariant];
        if (!stack) {
          for (let i = 0; i < state.itemGrid.length; i++) {
            // Empty slots may be null or an unfilled hole (undefined), so
            // use a loose comparison to treat both as available.
            if (state.itemGrid[i]) continue;
            state.itemGrid[i] = {
              type: "consumable",
              itemType: item.type,
              itemVariant: item.variant
            };
            state.consumables[typeVariant] = {
              itemType: item.type,
              itemVariant: item.variant,
              count: 0,
              gridIndex: i
            };
            stack = state.consumables[typeVariant];
            break;
          }
        }
        // Kludge.
        if (!stack) continue;
        stack.count += itemPayload.count ?? 1;
        if (hotkey) {
          if (
            !findHotKeySlot(
              state,
              (hk) =>
                hk?.type === "consumable" &&
                hk.itemType === item.type &&
                hk.itemVariant === item.variant
            )
          ) {
            const openHotKeySlot = findOpenHotKeySlot(state);
            if (openHotKeySlot) {
              const [openRowIndex, openIndex] = openHotKeySlot;
              state.hotKeyMap[openRowIndex][openIndex] = {
                type: "consumable",
                itemType: item.type,
                itemVariant: item.variant
              };
            }
          }
        }
      }
    });
    builder.addCase(deleteScript, (state, action) => {
      for (const hotKeySlot of findHotKeySlots(
        state,
        (hk) => hk?.type === "spell" && hk.scriptId === action.payload
      )) {
        delete state.hotKeyMap[hotKeySlot[0]][hotKeySlot[1]];
      }
      delete state.spellItems[action.payload];
    });
    builder.addCase(loadGame, (state, action) => {
      const { inventory, ui } = action.payload.reduxStateData;
      // The ui slice restores enableElements from the save, so the mirrored
      // row count has to follow it rather than the current session's value.
      const enableElements = (ui as { enableElements?: Record<string, boolean> })
        ?.enableElements;
      state.hotKeyRowCount = hotKeyRowCountForFlag(
        !!enableElements?.[EnableElements.HotBarMultipleRows]
      );
      state.hotKeyCurrentRow = Math.min(
        state.hotKeyCurrentRow,
        state.hotKeyRowCount - 1
      );
      if (!inventory) return;
      const oldState = inventory as InventoryState;
      if (typeof oldState.hotKeyMap === "object")
        state.hotKeyMap = oldState.hotKeyMap;
      if (typeof oldState.equippedWeapon === "string") {
        state.equippedWeapon = oldState.equippedWeapon;
        const itemDef = getItemDefinitionByType(state.equippedWeapon);
        if (!itemDef) {
          console.warn("Item definition not found");
        }
        itemDef?.equip?.({
          type: state.equippedWeapon
        });
      }
      if (typeof oldState.consumables === "object")
        state.consumables = oldState.consumables;
      if (typeof oldState.questItems === "object") {
        state.questItems = oldState.questItems;
        for (const [_key, item] of Object.entries(oldState.questItems)) {
          const itemDef = getItemDefinitionByType(item.itemType);
          if (!itemDef) continue;
          itemDef.equip?.({ type: item.itemType });
        }
      }
      if (typeof oldState.spellItems === "object")
        state.spellItems = oldState.spellItems;
      if (typeof oldState.coins === "number") state.coins = oldState.coins;
      if (typeof oldState.itemGrid === "object") {
        state.itemGrid = oldState.itemGrid;
        for (const item of state.itemGrid) {
          if (!item) continue;
          const itemDef = getItemDefinitionByType(item.type);
          itemDef?.equip?.({ type: item.type });
        }
      }
    });
  }
});

export const {
  equipWeapon,
  addCoins,
  assignHotKey,
  assignHotKeys,
  consumeConsumableItem,
  removeQuestItem,
  setHotKeyCurrentRow,
  flushInventory,
  moveGridItem
} = inventorySlice.actions;

export const inventoryReducer = inventorySlice.reducer;
