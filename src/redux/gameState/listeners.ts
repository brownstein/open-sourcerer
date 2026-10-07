import { createListenerMiddleware, isAnyOf } from "@reduxjs/toolkit";

import {
  applyOptsToCurrentURL,
  extractOptsFromCurrentURL,
  isDevMode
} from "src/util/devUtil";

import { selectDevPhysicsOverlayEnabled } from "../dev/selectors";
import { setEnablePhysicsOverlay, setEnableToolsOverlay } from "../dev/slice";
import { RootState } from "../rootState";
import { closeCurrentModal } from "../ui/slice";
import { gotoLevel, unpauseGame } from "./slice";

export const gameStateListener = createListenerMiddleware<RootState>();

gameStateListener.startListening({
  actionCreator: closeCurrentModal,
  effect: (_action, listenerApi) => {
    const state = listenerApi.getState();
    const isPaused = state.gameState.paused;
    const wasPaused = state.gameState.pausedPriorToOpeningModal;
    const hasModal = !!state.ui.modalStack?.length;
    if (!hasModal && !wasPaused && isPaused) {
      listenerApi.dispatch(unpauseGame());
    }
  }
});

// Keep URL params updated.
gameStateListener.startListening({
  matcher: isAnyOf(gotoLevel, setEnablePhysicsOverlay, setEnableToolsOverlay),
  effect: (_action, listenerApi) => {
    if (!isDevMode()) return;
    const state = listenerApi.getState();
    applyOptsToCurrentURL({
      ...extractOptsFromCurrentURL(),
      isDevMode: true,
      isDemoMode: state.gameState.demoMode,
      showDevOverlay: selectDevPhysicsOverlayEnabled(state),
      level: state.gameState.levelId ?? undefined
    });
  }
});
