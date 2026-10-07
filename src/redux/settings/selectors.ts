import { createSelector } from "@reduxjs/toolkit";

import { resolveKeyBindings } from "src/api/keybindings";

import { RootState } from "../store";

export const selectTabOverlayColor = (state: RootState) =>
  state.settings.tabOverlayColor;
export const selectTabButtonTextColor = (state: RootState) =>
  state.settings.tabButtonTextColor;
export const selectLanguage = (state: RootState) => state.settings.language;
export const selectMasterVolume = (state: RootState) =>
  state.settings.masterVolume;
export const selectSfxVolume = (state: RootState) => state.settings.sfxVolume;
export const selectMusicVolume = (state: RootState) =>
  state.settings.musicVolume;
export const selectAmbianceVolume = (state: RootState) =>
  state.settings.ambianceVolume;
export const selectUiVolume = (state: RootState) => state.settings.uiVolume;
export const selectMuted = (state: RootState) => state.settings.muted;
export const selectDarkMode = (state: RootState) => state.settings.darkMode;
export const selectKeyBindingOverrides = (state: RootState) =>
  state.settings.keyBindingOverrides;
export const selectResolvedKeyBindings = createSelector(
  selectKeyBindingOverrides,
  resolveKeyBindings
);
