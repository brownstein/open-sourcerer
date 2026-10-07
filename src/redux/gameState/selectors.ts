import { RootState } from "../store";

export const selectInTitleScreen = (state: RootState) =>
  state.gameState.inTitleScreen;
export const selectLevelId = (state: RootState) => state.gameState.levelId;
export const selectLevelLoading = (state: RootState) =>
  state.gameState.levelLoading;
export const selectGamePaused = (state: RootState) => state.gameState.paused;
export const selectLevelTransitionData = (state: RootState) => ({
  previousLevelId: state.gameState.previousLevelId,
  levelTransitionDirection: state.gameState.levelTransitionDirection,
  levelTransitionDoorName: state.gameState.levelTransitionDoorName
});
export const selectIsDemoMode = (state: RootState) => state.gameState.demoMode;
export const selectActiveAllies = (state: RootState) =>
  state.gameState.activeAllies;
export const selectLevelAdjacencyOverrides = (state: RootState) =>
  state.gameState.levelAdjacencyOverrides;
