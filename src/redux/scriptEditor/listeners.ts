import { createListenerMiddleware, isAnyOf } from "@reduxjs/toolkit";

import { ModalConfigType } from "src/api/modal";

import { RootState } from "../rootState";
import {
  selectComponentConfigsByComponentName,
  selectModalStack
} from "../ui/selectors";
import { closeCurrentModal, closeTab } from "../ui/slice";
import { scriptEditorSelectors } from "./selectors";
import { closeEditor } from "./slice";

export const scriptEditorListener = createListenerMiddleware<RootState>();

// Listen for close tab actions and terminate editors that closed.
scriptEditorListener.startListening({
  matcher: isAnyOf(closeTab, closeCurrentModal),
  effect: (_action, listenerApi) => {
    const state = listenerApi.getState();
    const componentConfigsByComponentName =
      selectComponentConfigsByComponentName(state);
    const editorComponents = componentConfigsByComponentName.codeEditor ?? [];
    // const consoleComponents = componentConfigsByComponentName.console ?? [];
    const mountedEditorIds = new Set<string>();
    for (const [_tabId, componentConfig] of editorComponents) {
      if (componentConfig.editorId)
        mountedEditorIds.add(componentConfig.editorId as string);
    }
    const editorModals = selectModalStack(state).filter(
      (m) => m.modalName === "entityCode"
    ) as ModalConfigType<"entityCode">[];
    for (const modal of editorModals) {
      if (modal.modalArg.editorId !== undefined)
        mountedEditorIds.add(modal.modalArg.editorId);
    }

    const editorIds = scriptEditorSelectors.selectIds(state);
    for (const editorId of editorIds) {
      if (!mountedEditorIds.has(editorId))
        listenerApi.dispatch(closeEditor(editorId));
    }
    // for (const componentConfig of consoleComponents) {

    // }
  }
});
