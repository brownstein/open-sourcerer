import { PayloadAction, createSlice } from "@reduxjs/toolkit";

export type MatchPhase =
  | "idle"
  | "loading"
  | "countdown"
  | "active"
  | "matchEnd";

/** Where the player is in the multiplayer experience. Drives which screens
 *  render (MainEntryPoint for the title-side screens, Viewport for the
 *  in-game results overlay). */
export type MultiplayerFlow = "none" | "menu" | "lobby" | "inMatch" | "results";

export type MatchOpponent = {
  peerId: string;
  name: string;
  color: string;
};

export type MatchSliceType = {
  flow: MultiplayerFlow;
  phase: MatchPhase;
  levelId: string | null;
  /** KO points per peer id (self included). */
  scores: Record<string, number>;
  targetScore: number;
  opponents: MatchOpponent[];
  selfPeerId: string | null;
  /** Live opponent health ratios, keyed by peer id. */
  opponentHp: Record<string, number>;
  countdownSeconds: number;
  winnerPeerId: string | null;
  /** Wall-clock stamps for the results screen's match duration. */
  matchStartedAtMs: number | null;
  matchEndedAtMs: number | null;
};

const initialState: MatchSliceType = {
  flow: "none",
  phase: "idle",
  levelId: null,
  scores: {},
  targetScore: 3,
  opponents: [],
  selfPeerId: null,
  opponentHp: {},
  countdownSeconds: 0,
  winnerPeerId: null,
  matchStartedAtMs: null,
  matchEndedAtMs: null
};

const matchSlice = createSlice({
  name: "multiplayerMatch",
  initialState,
  reducers: {
    setMultiplayerFlow(state, action: PayloadAction<MultiplayerFlow>) {
      state.flow = action.payload;
    },
    matchSetup(
      state,
      action: PayloadAction<{
        levelId: string;
        selfPeerId: string;
        opponents: MatchOpponent[];
        targetScore: number;
      }>
    ) {
      state.flow = "inMatch";
      state.phase = "loading";
      state.levelId = action.payload.levelId;
      state.selfPeerId = action.payload.selfPeerId;
      state.opponents = action.payload.opponents;
      state.targetScore = action.payload.targetScore;
      state.scores = {};
      state.opponentHp = {};
      state.winnerPeerId = null;
      state.matchStartedAtMs = null;
      state.matchEndedAtMs = null;
      state.scores[action.payload.selfPeerId] = 0;
      for (const opponent of action.payload.opponents) {
        state.scores[opponent.peerId] = 0;
        state.opponentHp[opponent.peerId] = 1;
      }
    },
    setMatchPhase(state, action: PayloadAction<MatchPhase>) {
      state.phase = action.payload;
    },
    matchBecameActive(state, action: PayloadAction<{ atMs: number }>) {
      state.phase = "active";
      if (state.matchStartedAtMs === null) {
        state.matchStartedAtMs = action.payload.atMs;
      }
    },
    setCountdownSeconds(state, action: PayloadAction<number>) {
      state.countdownSeconds = action.payload;
    },
    recordKo(state, action: PayloadAction<{ victimPeerId: string }>) {
      for (const peerId of Object.keys(state.scores)) {
        if (peerId !== action.payload.victimPeerId) {
          state.scores[peerId] += 1;
        }
      }
    },
    setOpponentHp(
      state,
      action: PayloadAction<{ peerId: string; hp: number }>
    ) {
      state.opponentHp[action.payload.peerId] = action.payload.hp;
    },
    endMatch(
      state,
      action: PayloadAction<{ winnerPeerId: string | null; atMs?: number }>
    ) {
      state.phase = "matchEnd";
      state.flow = "results";
      state.winnerPeerId = action.payload.winnerPeerId;
      state.matchEndedAtMs = action.payload.atMs ?? null;
    },
    /** Clears match state; the flow position is preserved (a rematch or
     *  back-to-lobby decides where to go, not the reset itself). */
    resetMatch(state) {
      const flow = state.flow;
      return { ...initialState, flow };
    },
    leaveMultiplayer() {
      return initialState;
    }
  }
});

export const {
  setMultiplayerFlow,
  matchSetup,
  setMatchPhase,
  matchBecameActive,
  setCountdownSeconds,
  recordKo,
  setOpponentHp,
  endMatch,
  resetMatch,
  leaveMultiplayer
} = matchSlice.actions;

export const matchReducer = matchSlice.reducer;
