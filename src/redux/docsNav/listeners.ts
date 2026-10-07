import { createListenerMiddleware } from "@reduxjs/toolkit";

import { buildOpenTabExtAction } from "src/engine/util/tabHelpers";

import { RootState } from "../rootState";
import { updateLayoutExt } from "../shared/actions";
import { selectLayout, selectLayoutTabsByComponentName } from "../ui/selectors";
import { openDocAt } from "./slice";

export const docsNavListener = createListenerMiddleware<RootState>();

docsNavListener.startListening({
  actionCreator: openDocAt,
  effect: (_action, listenerApi) => {
    const state = listenerApi.getState();
    const tabsByName = selectLayoutTabsByComponentName(state);
    const existingDocsTabs = tabsByName.get("docs") ?? [];
    if (existingDocsTabs.length > 0) return;

    const openTabAction = buildOpenTabExtAction({
      extendAction: updateLayoutExt({ layout: selectLayout(state) }),
      currentNodeId: "viewport",
      componentName: "docs",
      relativePosition: "bottom",
      duration: 500
    });

    listenerApi.dispatch(openTabAction);
  }
});
