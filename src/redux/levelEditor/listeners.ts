import { createAction, createListenerMiddleware } from "@reduxjs/toolkit";
import { IJsonRowNode } from "flexlayout-react";
import shortid from "shortid";

import { RootState } from "src/redux/rootState";
import { updateLayout } from "src/redux/ui/slice";
import { isDevMode } from "src/util/devUtil";

/** Build a fullscreen layout with the level editor tab selected and viewport behind it. */
export function buildLevelEditorFullscreenLayout(): IJsonRowNode {
  return {
    type: "row",
    weight: 100,
    children: [
      {
        type: "tabset",
        id: shortid(),
        weight: 100,
        selected: 1,
        children: [
          {
            type: "tab",
            id: "viewport",
            component: "viewport",
            enableClose: false,
          },
          {
            type: "tab",
            id: shortid(),
            component: "levelEditor",
          },
        ],
      },
    ],
  };
}

/**
 * Dispatched once after store creation to apply URL-driven init that the
 * normal title-screen button flow would handle interactively.
 */
export const levelEditorInit = createAction("levelEditor/init");

export const levelEditorListener = createListenerMiddleware<RootState>();

// When the level editor init action fires, check the URL and apply the layout.
levelEditorListener.startListening({
  actionCreator: levelEditorInit,
  effect: (_action, listenerApi) => {
    if (!isDevMode()) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("mode") === "level-editor") {
      listenerApi.dispatch(updateLayout(buildLevelEditorFullscreenLayout()));
    }
  },
});
