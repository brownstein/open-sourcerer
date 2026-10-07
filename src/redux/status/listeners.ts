import { createListenerMiddleware } from "@reduxjs/toolkit";

import { ElementalType } from "src/api/entity";

import { RootState } from "../rootState";
import {
  directSetHealthAndMana,
  incrementHealth,
  setLastElementalHitType,
  setPortraitHealthy
} from "./slice";

// Durations match StatusBehavior sprite glow per element
const ELEMENTAL_EFFECT_DURATION_MS: Partial<Record<ElementalType, number>> = {
  [ElementalType.Fire]: 1500,
  [ElementalType.Wind]: 800,
  [ElementalType.Nature]: 200
};

export const healthListener = createListenerMiddleware<RootState>();

healthListener.startListening({
  actionCreator: incrementHealth,
  effect: async (action, listenerApi) => {
    try {
      listenerApi.cancelActiveListeners();

      await listenerApi.delay(2000);

      const state = listenerApi.getState();
      if (state.status.health >= state.status.maxHealth / 2) {
        //Only swap back to healthy look if over 50% Health
        listenerApi.dispatch(setPortraitHealthy());
      }
    } catch (err) {}
  }
});

healthListener.startListening({
  actionCreator: directSetHealthAndMana,
  effect: async (action, listenerApi) => {
    try {
      listenerApi.cancelActiveListeners();

      await listenerApi.delay(2000);

      const state = listenerApi.getState();
      if (state.status.health >= state.status.maxHealth / 2) {
        //Only swap back to healthy look if over 50% Health
        listenerApi.dispatch(setPortraitHealthy());
      }
    } catch (err) {}
  }
});

healthListener.startListening({
  actionCreator: setLastElementalHitType,
  effect: async (action, listenerApi) => {
    if (action.payload === null) return;
    try {
      listenerApi.cancelActiveListeners();
      const durationMs = ELEMENTAL_EFFECT_DURATION_MS[action.payload] ?? 100;
      await listenerApi.delay(durationMs);
      listenerApi.dispatch(setLastElementalHitType(null));
    } catch (err) {}
  }
});
