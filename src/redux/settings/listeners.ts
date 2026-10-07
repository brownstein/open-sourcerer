import { createListenerMiddleware, isAnyOf } from "@reduxjs/toolkit";

import { SoundType } from "src/api/sound";
import { centralSoundManager } from "src/engine/sound/Sound";

import { RootState } from "../rootState";
import { loadGame } from "../shared/actions";
import { saveKeyBindingOverrides } from "./keyBindingStorage";
import {
  clearKeyBindingOverride,
  resetAllKeyBindings,
  setAmbianceVolume,
  setKeyBindingOverride,
  setMasterVolume,
  setMusicVolume,
  setMuted,
  setSfxVolume,
  setUiVolume
} from "./slice";

const settingsListeners = createListenerMiddleware<RootState>();

settingsListeners.startListening({
  actionCreator: setMasterVolume,
  effect: (action) => {
    centralSoundManager.setMasterVolume(action.payload);
  }
});

settingsListeners.startListening({
  actionCreator: setSfxVolume,
  effect: (action) => {
    centralSoundManager.setAudioBusVolume(SoundType.SFX, action.payload);
  }
});

settingsListeners.startListening({
  actionCreator: setMusicVolume,
  effect: (action) => {
    centralSoundManager.setAudioBusVolume(SoundType.Music, action.payload);
  }
});

settingsListeners.startListening({
  actionCreator: setAmbianceVolume,
  effect: (action) => {
    centralSoundManager.setAudioBusVolume(SoundType.Ambiance, action.payload);
  }
});

settingsListeners.startListening({
  actionCreator: setUiVolume,
  effect: (action) => {
    centralSoundManager.setAudioBusVolume(SoundType.UI, action.payload);
  }
});

settingsListeners.startListening({
  actionCreator: setMuted,
  effect: (action) => {
    if (action.payload) centralSoundManager.mute();
    else centralSoundManager.unmute();
  }
});

settingsListeners.startListening({
  actionCreator: loadGame,
  effect: (_action, listenerApi) => {
    const settings = listenerApi.getState().settings;
    centralSoundManager.setMasterVolume(settings.masterVolume);
    centralSoundManager.setAudioBusVolume(SoundType.SFX, settings.sfxVolume);
    centralSoundManager.setAudioBusVolume(
      SoundType.Music,
      settings.musicVolume
    );
    centralSoundManager.setAudioBusVolume(
      SoundType.Ambiance,
      settings.ambianceVolume
    );
    centralSoundManager.setAudioBusVolume(SoundType.UI, settings.uiVolume);
    if (settings.muted) centralSoundManager.mute();
    else centralSoundManager.unmute();
  }
});

settingsListeners.startListening({
  matcher: isAnyOf(
    setKeyBindingOverride,
    clearKeyBindingOverride,
    resetAllKeyBindings
  ),
  effect: (_action, listenerApi) => {
    saveKeyBindingOverrides(
      listenerApi.getState().settings.keyBindingOverrides
    );
  }
});

export { settingsListeners };
