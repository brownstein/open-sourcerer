import { createAction } from "@reduxjs/toolkit";
import { IJsonRowNode } from "flexlayout-react";
import shortid from "shortid";

import { ItemData } from "src/api/item";
import { KnownModalNames, ModalConfigType } from "src/api/modal";
import { SavedSpell } from "src/api/spells";
import { ComponentConfigType } from "src/components/ui/config/types";

export const reset = createAction("reset", () => ({
  payload: null
}));

export const openNewCodeEditorPhase2 = createAction(
  "openNewCodeEditorPhase2",
  (tabId: string, savedSpellSnapshot?: SavedSpell) => ({
    payload: {
      tabId,
      editorId: shortid(),
      savedSpellSnapshot
    }
  })
);

export const openTab = createAction(
  "openTab",
  ({
    nextToTabId,
    nextToTabBefore,
    componentName,
    componentConfig,
    relativeWeight,
    slideIn,
    duration,
    editorConfig
  }: {
    nextToTabId?: string;
    nextToTabBefore?: boolean;
    componentName: string;
    componentConfig?: ComponentConfigType;
    relativeWeight?: number;
    slideIn?: boolean;
    duration?: number;
    editorConfig?: {
      code: string;
      spell?: SavedSpell;
    };
  }) => {
    const editorId = editorConfig ? shortid() : undefined;
    return {
      payload: {
        // Define the tab and tabset ID up front so that they
        // can be referenced in both the slice and listener.
        tabId: shortid(),
        tabSetId: shortid(),
        nextToTabId,
        nextToTabBefore,
        componentName,
        componentConfig: editorConfig
          ? {
              ...componentConfig,
              editorId
            }
          : componentConfig,
        relativeWeight,
        slideIn,
        duration,
        editorConfig,
        editorId
      }
    };
  }
);

export type UpdateLayoutExtTransition = {
  id: string;
  duration: number;
  relativeWeight: number;
  closeAfterComplete?: boolean;
};

export const updateLayoutExt = createAction(
  "updateLayoutExt",
  (payload: {
    layout: IJsonRowNode;
    componentConfigs?: Record<string, ComponentConfigType>;
    transitions?: UpdateLayoutExtTransition[];
    editor?: {
      id: string;
      config: {
        code?: string;
        spell?: SavedSpell;
      };
    };
  }) => ({
    payload
  })
);

export const closeTabs = createAction(
  "closeTabs",
  ({
    ids,
    componentName,
    smooth
  }: {
    ids?: string[];
    componentName?: string;
    smooth?: boolean;
  }) => ({
    payload: {
      ids,
      componentName,
      smooth
    }
  })
);

// Alias for openTab.
export const openCodeEditor = ({
  nextToTabId,
  code = "",
  spell
}: {
  nextToTabId?: string;
  code?: string;
  spell?: SavedSpell;
}) =>
  openTab({
    nextToTabId,
    componentName: "codeEditor",
    slideIn: true,
    duration: 500,
    editorConfig: {
      code,
      spell
    }
  });

export const pushModal = createAction(
  "pushModal",
  (modalConfig: ModalConfigType) => ({
    payload: {
      ...modalConfig,
      id: shortid()
    }
  })
);

export function pushModalTyped<T extends ModalConfigType<KnownModalNames>>(
  modalConfig: T
) {
  return pushModal(modalConfig);
}

export const saveGame = createAction("saveGame");
export const loadGameRequested = createAction("loadGameRequested");
export const loadGame = createAction(
  "loadGame",
  (
    reduxStateData: Record<string, unknown>,
    options?: { preserveLayout?: boolean }
  ) => ({
    payload: { reduxStateData, preserveLayout: options?.preserveLayout }
  })
);

export const setCodingChallenge = createAction(
  "startCodingChallenge",
  (payload: { codingChallengeId: string | null }) => ({ payload })
);

export const completeCodingChallenge = createAction(
  "completeCodingChallenge",
  (payload: { codingChallengeId: string }) => ({ payload })
);

export type AddItemsItem = {
  item: ItemData;
  hotkey?: boolean;
  ignoreIfPresent?: boolean;
  count?: number;
  // For spell items: rebind the editor with this id to the saved spell,
  // pointing it at the spell's scriptId and refreshing its snapshot. Used
  // when saving the spell currently open in an editor.
  updateEditorId?: string;
};

export type AddItemsArgument = ItemData | AddItemsItem;

export function isAddItemsItem(item: AddItemsArgument): item is AddItemsItem {
  return !!item.item;
}

// This is a common action for adding items to the game state, regardless of whether they are
// consumable or not.
export const addItems = createAction(
  "addItems",
  (...items: AddItemsArgument[]) => {
    const payload: AddItemsItem[] = [];
    for (const item of items) {
      if (isAddItemsItem(item)) {
        payload.push(item);
      } else {
        payload.push({ item });
      }
    }
    return { payload };
  }
);
