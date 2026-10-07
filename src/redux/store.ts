import { configureStore } from "@reduxjs/toolkit";

import { matchReducer } from "src/multiplayer/match/matchSlice";

import { devReducer } from "./dev/slice";
import { docsNavListener } from "./docsNav/listeners";
import { docsNavReducer } from "./docsNav/slice";
import { gameStateListener } from "./gameState/listeners";
import { gameStateReducer } from "./gameState/slice";
import { inventoryReducer } from "./inventory/slice";
import { levelEditorInit, levelEditorListener } from "./levelEditor/listeners";
import { progressionReducer } from "./progression/slice";
import { RootState } from "./rootState";
import { scriptEditorListener } from "./scriptEditor/listeners";
import { scriptEditorReducer } from "./scriptEditor/slice";
import { scriptLibraryReducer } from "./scriptLibrary/slice";
import { scriptRuntimeReducer } from "./scriptRuntime/slice";
import { settingsListeners } from "./settings/listeners";
import { settingsReducer } from "./settings/slice";
import { sharedListener } from "./shared/listeners";
import { skillTreeReducer } from "./skillTree/slice";
import { healthListener } from "./status/listeners";
import { statusReducer } from "./status/slice";
import { uiListener } from "./ui/listeners";
import { uiReducer } from "./ui/slice";

// This is exported to make context creation for testing easier.
export const createStore = () =>
  configureStore({
    devTools: true,
    reducer: {
      gameState: gameStateReducer,
      inventory: inventoryReducer,
      progression: progressionReducer,
      scriptEditor: scriptEditorReducer,
      scriptLibrary: scriptLibraryReducer,
      scriptRuntime: scriptRuntimeReducer,
      settings: settingsReducer,
      status: statusReducer,
      ui: uiReducer,
      skillTree: skillTreeReducer,
      docsNav: docsNavReducer,
      dev: devReducer,
      multiplayerMatch: matchReducer
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware().prepend([
        gameStateListener.middleware,
        scriptEditorListener.middleware,
        uiListener.middleware,
        sharedListener.middleware,
        healthListener.middleware,
        settingsListeners.middleware,
        levelEditorListener.middleware,
        docsNavListener.middleware
      ])
  });

export const store = createStore();

// Apply URL-driven init for features like level-editor mode.
store.dispatch(levelEditorInit());

export type { RootState };

export type AppStore = typeof store;
export type AppDispatch = typeof store.dispatch;
