import { PayloadAction, createSlice } from "@reduxjs/toolkit";

import { GameControlActions, KeyBindingOverrides } from "src/api/keybindings";
import i18Next, { resources } from "src/i18n/i18n";

import { loadGame } from "../shared/actions";
import { loadKeyBindingOverrides } from "./keyBindingStorage";

export type RGBAColor = { r: number; g: number; b: number; a: number };

export const availableLanguages: Array<string> = Object.keys(resources);

export const defaultLanguage: string = "en";
export const defaultOverlayColor: RGBAColor = { r: 10, g: 12, b: 15, a: 0.85 };
export const defaultButtonTextColor: RGBAColor = {
  r: 140,
  g: 200,
  b: 245,
  a: 1
};
export const defaultMasterVolume = 1;
export const defaultSfxVolume = 1;
export const defaultMusicVolume = 1;
export const defaultAmbianceVolume = 1;
export const defaultUiVolume = 1;
export const defaultMuted = false;
export const defaultDarkMode = true;

const clampVolume = (value: number) => Math.max(0, Math.min(1, value));

type SettingsState = {
  tabOverlayColor: RGBAColor;
  tabButtonTextColor: RGBAColor;
  language: string;
  masterVolume: number;
  sfxVolume: number;
  musicVolume: number;
  ambianceVolume: number;
  uiVolume: number;
  muted: boolean;
  darkMode: boolean;
  keyBindingOverrides: KeyBindingOverrides;
};

const settingsSlice = createSlice({
  name: "settings",
  initialState: {
    tabOverlayColor: defaultOverlayColor,
    tabButtonTextColor: defaultButtonTextColor,
    language: defaultLanguage,
    masterVolume: defaultMasterVolume,
    sfxVolume: defaultSfxVolume,
    musicVolume: defaultMusicVolume,
    ambianceVolume: defaultAmbianceVolume,
    uiVolume: defaultUiVolume,
    muted: defaultMuted,
    darkMode: defaultDarkMode,
    keyBindingOverrides: loadKeyBindingOverrides()
  } satisfies SettingsState as SettingsState,
  reducers: {
    setTabOverlayColor(state, action: PayloadAction<RGBAColor>) {
      state.tabOverlayColor = action.payload;
    },
    setTabButtonTextColor(state, action: PayloadAction<RGBAColor>) {
      state.tabButtonTextColor = action.payload;
    },
    setLanguage(state, action: PayloadAction<string>) {
      state.language = action.payload;
      i18Next.changeLanguage(state.language);
    },
    setMasterVolume(state, action: PayloadAction<number>) {
      state.masterVolume = clampVolume(action.payload);
    },
    setSfxVolume(state, action: PayloadAction<number>) {
      state.sfxVolume = clampVolume(action.payload);
    },
    setMusicVolume(state, action: PayloadAction<number>) {
      state.musicVolume = clampVolume(action.payload);
    },
    setAmbianceVolume(state, action: PayloadAction<number>) {
      state.ambianceVolume = clampVolume(action.payload);
    },
    setUiVolume(state, action: PayloadAction<number>) {
      state.uiVolume = clampVolume(action.payload);
    },
    setMuted(state, action: PayloadAction<boolean>) {
      state.muted = action.payload;
    },
    setDarkMode(state, action: PayloadAction<boolean>) {
      state.darkMode = action.payload;
    },
    setKeyBindingOverride(
      state,
      action: PayloadAction<{ action: GameControlActions; keys: string[] }>
    ) {
      state.keyBindingOverrides[action.payload.action] = action.payload.keys;
    },
    clearKeyBindingOverride(state, action: PayloadAction<GameControlActions>) {
      delete state.keyBindingOverrides[action.payload];
    },
    resetAllKeyBindings(state) {
      state.keyBindingOverrides = {};
    },
    cycleLanguage(state) {
      state.language =
        availableLanguages[
          (availableLanguages.indexOf(state.language) + 1) %
            availableLanguages.length
        ];
      i18Next.changeLanguage(state.language);
    }
  },
  extraReducers: (builder) => {
    builder.addCase(loadGame, (state, action) => {
      const settingsPayload = action.payload.reduxStateData.settings as
        | SettingsState
        | undefined;
      state.tabButtonTextColor =
        settingsPayload?.tabButtonTextColor ?? defaultButtonTextColor;
      state.tabOverlayColor =
        settingsPayload?.tabOverlayColor ?? defaultOverlayColor;
      state.language = settingsPayload?.language ?? defaultLanguage;
      state.masterVolume = settingsPayload?.masterVolume ?? defaultMasterVolume;
      state.sfxVolume = settingsPayload?.sfxVolume ?? defaultSfxVolume;
      state.musicVolume = settingsPayload?.musicVolume ?? defaultMusicVolume;
      state.ambianceVolume =
        settingsPayload?.ambianceVolume ?? defaultAmbianceVolume;
      state.uiVolume = settingsPayload?.uiVolume ?? defaultUiVolume;
      state.muted = settingsPayload?.muted ?? defaultMuted;
      state.darkMode = settingsPayload?.darkMode ?? defaultDarkMode;
      // keyBindingOverrides intentionally not restored from the save file —
      // bindings are machine-local and persist via their own localStorage
      // entry (see keyBindingStorage.ts).
    });
  }
});

export const {
  setTabOverlayColor,
  setTabButtonTextColor,
  setLanguage,
  setMuted,
  setDarkMode,
  setKeyBindingOverride,
  clearKeyBindingOverride,
  resetAllKeyBindings,
  cycleLanguage,
  setMasterVolume,
  setSfxVolume,
  setMusicVolume,
  setAmbianceVolume,
  setUiVolume
} = settingsSlice.actions;

export const settingsReducer = settingsSlice.reducer;
