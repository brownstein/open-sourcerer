import { MatchSliceType } from "./matchSlice";

// The multiplayer reducer is registered in src/redux/store.ts under this key.
type StateWithMatch = { multiplayerMatch: MatchSliceType };

export const selectMatchPhase = (state: StateWithMatch) =>
  state.multiplayerMatch.phase;

export const selectMatchState = (state: StateWithMatch) =>
  state.multiplayerMatch;

/** True while match rules own the player (suppress the death screen etc.). */
export const selectMatchInProgress = (state: StateWithMatch) => {
  const phase = state.multiplayerMatch.phase;
  return phase === "loading" || phase === "countdown" || phase === "active";
};

export const selectMultiplayerFlow = (state: StateWithMatch) =>
  state.multiplayerMatch.flow;
