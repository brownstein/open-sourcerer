import { PayloadAction, createSlice } from "@reduxjs/toolkit";

import { Direction } from "src/api/directions";
import { LevelAdjacencies, MapOfLevelAdjacencies } from "src/api/level";
import { checkMobile } from "src/engine/util/mobile";
import { DemoLevelAdjacencies } from "src/levels/levels/demoLevelAdjacencies";
import { extractOptsFromCurrentURL } from "src/util/devUtil";

import { loadGame, pushModal } from "../shared/actions";
import { analyticsTrackLevelProgression } from "src/engine/analytics/Analytics";

const initialOpt = extractOptsFromCurrentURL();

let defaultLevelId = "Dream_0_327";
if (initialOpt?.isMobile || checkMobile()) defaultLevelId = "Mobile";

export type GameState = {
  inTitleScreen: boolean;
  levelId: string | null;
  levelLoading: boolean;
  levelTransitionDirection: Direction | null;
  levelTransitionDoorName: string | null;
  levelLoadRequired: boolean;
  previousLevelId: string | null;
  paused: boolean;
  pausedPriorToOpeningModal: boolean;
  demoMode: boolean;
  activeAllies: string[];
  currentCodingChallengeId?: string;
  levelAdjacencyOverrides?: MapOfLevelAdjacencies;
};

// Defines a Redux slice for game state management with initial state and reducers
const gameStateSlice = createSlice({
  name: "gameState",
  initialState: {
    inTitleScreen: !initialOpt?.level && initialOpt?.mode !== "level-editor",
    levelId:
      initialOpt?.mode === "level-editor"
        ? null
        : initialOpt?.level ?? defaultLevelId,
    levelLoading: false,
    levelTransitionDirection: null,
    levelTransitionDoorName: null,
    levelLoadRequired: false,
    previousLevelId: null,
    paused: false,
    pausedPriorToOpeningModal: false,
    demoMode: !!initialOpt?.isDevMode,
    activeAllies: []
  } as GameState,
  reducers: {
    // Reducers to handle actions
    leaveTitleScreen(state, action: PayloadAction<{ isDemoMode?: boolean }>) {
      // Action to handle leaving the title screen
      state.inTitleScreen = false; // Sets the inTitleScreen state to false
      state.demoMode = !!action.payload.isDemoMode;
      if (state.demoMode) {
        state.levelId = "DemoHallway";
        state.levelAdjacencyOverrides = DemoLevelAdjacencies;
      }
    },
    returnToTitleScreen(state) {
      // Action to return to the title screen
      state.inTitleScreen = true; // Resets the inTitleScreen to true
      state.levelId = null; // Clears the current level ID
      state.previousLevelId = null;
      state.levelLoading = false; // Ensures level loading is set to false
      state.paused = false; // Ensures the game is not paused
    },
    gotoLevel(
      state,
      action: PayloadAction<{
        levelId: string;
        direction?: Direction;
        doorName?: string;
      }>
    ) {
      // Action to go to a specific game level
      state.previousLevelId = state.levelId;
      state.levelId = action.payload.levelId; // Sets the current level ID to the dispatched action payload
      state.levelLoading = true; // Sets level loading to true
      state.levelTransitionDirection = action.payload.direction ?? null;
      state.levelTransitionDoorName = action.payload.doorName ?? null;
      // Analytics side effect.
      analyticsTrackLevelProgression(action.payload.levelId);
    },
    gotoLevelComplete(state) {
      // Action to indicate that level transition is complete
      state.levelLoading = false; // Sets level loading to false
    },
    pauseGame(state) {
      // Action to pause the game
      state.paused = true; // Sets the game state to paused
    },
    unpauseGame(state) {
      // Action to unpause the game
      state.paused = false; // Sets the game state to unpaused
    },
    markLevelLoadCompleted(state) {
      state.levelLoadRequired = false;
    },
    setActiveAllies(state, action: PayloadAction<string[]>) {
      state.activeAllies = action.payload;
    },
    setCurrentCodingChallenge(state, action: PayloadAction<string | null>) {
      state.currentCodingChallengeId = action.payload ?? undefined;
    },
    setLevelAdjacencyOverrides(
      state,
      action: PayloadAction<Record<string, LevelAdjacencies> | undefined>
    ) {
      state.levelAdjacencyOverrides = action.payload;
    }
  },
  extraReducers: (builder) => {
    builder.addCase(pushModal, (state) => {
      state.pausedPriorToOpeningModal = state.paused;
      state.paused = true;
    });
    builder.addCase(loadGame, (state, action) => {
      const { gameState } = action.payload.reduxStateData;
      if (!gameState) return;
      state.inTitleScreen = false;
      state.levelLoadRequired = true;
      state.levelTransitionDirection = null;
      state.levelTransitionDoorName = null;
      const oldState = gameState as Partial<GameState>;
      if (typeof oldState.levelId === "string") {
        state.levelId = oldState.levelId;
      }
      state.activeAllies = oldState.activeAllies ?? [];
    });
  }
});

// Exporting actions and reducer for use in the application
export const {
  leaveTitleScreen,
  returnToTitleScreen,
  gotoLevel,
  gotoLevelComplete,
  pauseGame,
  unpauseGame,
  markLevelLoadCompleted,
  setActiveAllies,
  setLevelAdjacencyOverrides
} = gameStateSlice.actions;

export const gameStateReducer = gameStateSlice.reducer;
