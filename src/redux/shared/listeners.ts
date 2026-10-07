import { createListenerMiddleware, isAnyOf } from "@reduxjs/toolkit";

import { isSpellItemData } from "src/api/spells";
import { getItemDefinitionByType } from "src/items/allItems";
import {
  CurrencyDefinition,
  CurrencyType,
  getCurrencyVariantValue,
  isCurrencyVariant
} from "src/items/currencies/Currency";
import { SpellDefinition } from "src/items/spells/spell";
import { getSingleton } from "src/singletons/Singletons";

import { addCoins } from "../inventory/slice";
import { RootState } from "../rootState";
import {
  selectAllScriptEditorEntities,
} from "../scriptEditor/selectors";
import { closeEditor } from "../scriptEditor/slice";
import { selectComponentConfigs } from "../ui/selectors";
import { closeTab, updateLayout } from "../ui/slice";
import {
  addItems,
  closeTabs,
  completeCodingChallenge,
  updateLayoutExt
} from "./actions";
import { NotificationEvents, notificationEvents } from "./events";
import { ComponentConfigType } from "src/components/ui/config/types";

export const sharedListener = createListenerMiddleware<RootState>();

sharedListener.startListening({
  matcher: isAnyOf(addCoins, addItems, completeCodingChallenge),
  effect: (action, listenerApi) => {
    switch (action.type) {
      case addCoins.type: {
        const coinsPayload = (action as ReturnType<typeof addCoins>).payload;
        const { amount } = coinsPayload;
        notificationEvents.emit(NotificationEvents.Notify, {
          type: "item",
          itemType: CurrencyDefinition.type,
          count: amount
        });
        break;
      }
      case addItems.type: {
        const payload = (action as ReturnType<typeof addItems>).payload;
        for (const { item, count } of payload) {
          // Spell items notify under the spell type, using the script name.
          if (isSpellItemData(item)) {
            notificationEvents.emit(NotificationEvents.Notify, {
              type: "item",
              itemType: SpellDefinition.type,
              itemName: item.scriptName,
              count: 1
            });
            continue;
          }
          const itemDef = getItemDefinitionByType(item.type);
          // Currency notifies under the currency type, with the coin value added
          // (variant value times count), mirroring the addCoins notification.
          if (itemDef?.isCurrency) {
            const variant = isCurrencyVariant(item.variant)
              ? item.variant
              : isCurrencyVariant(itemDef.variant)
                ? itemDef.variant
                : CurrencyType.Green;
            notificationEvents.emit(NotificationEvents.Notify, {
              type: "currency",
              count: getCurrencyVariantValue(variant) * (count ?? 1)
            });
            continue;
          }
          notificationEvents.emit(NotificationEvents.Notify, {
            type: "item",
            itemType: item.type,
            itemVariant: item.variant,
            count: count ?? 1
          });
        }
        break;
      }
      case completeCodingChallenge.type: {
        // listenerApi.dispatch(
        //   pushModal({
        //     name: "ChallengeSummary"
        //   })
        // );
        break;
      }
    }
  }
});

// Handle code editor session closure when there are no editor components referencing
// a given runtime.
sharedListener.startListening({
  matcher: isAnyOf(updateLayoutExt, updateLayout, closeTab, closeTabs),
  effect: (_action, listenerApi) => {
    const spells = getSingleton("spells");
    const initialState = listenerApi.getOriginalState();
    const state = listenerApi.getState();
    const initialOpenEditorIds = new Set<string>();
    const openEditorIds = new Set<string>();

    const editors = selectAllScriptEditorEntities(state);
    for (const config of Object.values(selectComponentConfigs(initialState))) {
      const { editorId } = config as ComponentConfigType<"codeEditor">;
      if (editorId) initialOpenEditorIds.add(editorId);
    }
    for (const config of Object.values(selectComponentConfigs(state))) {
      const { editorId } = config as ComponentConfigType<"codeEditor">;
      if (editorId) openEditorIds.add(editorId);
    }
    const editorsToRemove = new Set<string>();
    for (const id of initialOpenEditorIds) {
      if (openEditorIds.has(id)) continue;
      if (editors[id]) {
        editorsToRemove.add(id);
      }
    }
    if (editorsToRemove.size === 0) return;
    for (const id of editorsToRemove) {
      const editor = editors[id];
      listenerApi.dispatch(closeEditor(id));
      if (editor.runtimeId) spells?.getSpellCtx(editor.runtimeId)?.destroy();
    }
  }
});
