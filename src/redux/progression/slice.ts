import { PayloadAction, createSlice } from "@reduxjs/toolkit";
import { clamp } from "three/src/math/MathUtils.js";

import { Quest } from "src/api/quest";
import { SignalData } from "src/api/signal";
import { INDEX_DOC_BASE_FILENAME } from "src/docs/configuration";
import { DocId } from "src/docs/indexedDocs/docTypes";
import { getDocFilenameForId } from "src/docs/util";

import { completeCodingChallenge, loadGame } from "../shared/actions";

const MAX_RECENTLY_VIEWED_DOCS = 100;

export type CompletedTutorial = {
  type: "tutorial";
  slug: string;
};

export type CompletedChalllenge = {
  type: "challenge";
  challengeId: string;
};

export type CompletedQuest = {
  type: "quest";
  name: string;
};

export type CompletedHistoryItem =
  | CompletedTutorial
  | CompletedChalllenge
  | CompletedQuest;

type ProgressionState = {
  cutScenesCompleted: Record<string, boolean>;
  completedTutorials: Record<string, boolean>;
  completedChallenges: Record<string, boolean>;
  unlockedDocs: Partial<Record<DocId, boolean>>;
  recentlyViewedDocs: DocId[];
  docsViewCounts: Partial<Record<DocId, number>>;
  docsViewedPercentage: Partial<Record<DocId, number>>;
  docsFullyViewed: Partial<Record<DocId, boolean>>;
  quests: Quest[];
  history: CompletedHistoryItem[];
  globalChannels: Record<string, SignalData>;
};

const progressionSlice = createSlice({
  name: "progression",
  initialState: {
    cutScenesCompleted: {},
    completedTutorials: {},
    completedChallenges: {},
    unlockedDocs: {
      index: true,
      "tutorials/read-this-first": true,
      "javascript/index": true
    },
    recentlyViewedDocs: [],
    docsViewCounts: {},
    docsViewedPercentage: {},
    docsFullyViewed: {},
    quests: [],
    history: [],
    globalChannels: {}
  } satisfies ProgressionState as ProgressionState,
  reducers: {
    completeTutorial(state, action: PayloadAction<string>) {
      if (!state.completedTutorials[action.payload])
        state.history.push({
          type: "tutorial",
          slug: action.payload
        });
      state.completedTutorials[action.payload] = true;
    },
    completeCutScene(state, action: PayloadAction<string>) {
      state.cutScenesCompleted[action.payload] = true;
    },
    addQuest(state, action: PayloadAction<Quest>) {
      state.quests.push(action.payload);
    },
    completeQuest(state, action: PayloadAction<string>) {
      const name = action.payload;
      const quest = state.quests.find((q) => q.name === name);
      if (!quest) return;
      quest.complete = true;
      state.history.push({
        type: "quest",
        name: quest.name
      });
    },
    completeQuestStep(
      state,
      action: PayloadAction<{ quest: string; step: string }>
    ) {
      const { quest: questName, step: stepName } = action.payload;
      const quest = state.quests.find((q) => q.name === questName);
      if (!quest) return;
      const step = quest.steps.find((s) => s.name === stepName);
      if (!step) return;
      step.complete = true;
    },
    unlockDoc(state, action: PayloadAction<DocId>) {
      state.unlockedDocs[action.payload] = true;
    },
    viewDoc(state, action: PayloadAction<DocId>) {
      if (getDocFilenameForId(action.payload) === INDEX_DOC_BASE_FILENAME)
        return;

      const { recentlyViewedDocs, docsViewCounts } = state;

      const existingViewedDocIndex = recentlyViewedDocs.indexOf(action.payload);
      if (existingViewedDocIndex !== -1)
        recentlyViewedDocs.splice(existingViewedDocIndex, 1);

      recentlyViewedDocs.push(action.payload);
      if (recentlyViewedDocs.length > MAX_RECENTLY_VIEWED_DOCS)
        recentlyViewedDocs.shift();

      const oldViewCountForDoc = docsViewCounts[action.payload] ?? 0;
      docsViewCounts[action.payload] = oldViewCountForDoc + 1;
    },
    setDocsViewedPercentage(
      state,
      action: PayloadAction<[docId: DocId, viewedPercentage: number]>
    ) {
      const [docId, viewedPercentage] = action.payload;
      const clampedViewedPercentage = +clamp(viewedPercentage, 0, 1).toFixed(2);

      state.docsViewedPercentage[docId] = clampedViewedPercentage;
      if (clampedViewedPercentage >= 1) state.docsFullyViewed[docId] = true;
    },
    unsetDocFullyViewed(state, action: PayloadAction<DocId>) {
      state.docsFullyViewed[action.payload] = false;
    },
    setGlobalChannel(
      state,
      action: PayloadAction<{ name: string; value: SignalData }>
    ) {
      state.globalChannels[action.payload.name] = action.payload.value;
    }
  },
  extraReducers: (builder) => {
    builder.addCase(loadGame, (state, action) => {
      const savedProgression = action.payload.reduxStateData.progression as
        | ProgressionState
        | undefined;
      if (savedProgression) {
        Object.assign(state, savedProgression);
      }
    });
    builder.addCase(completeCodingChallenge, (state, action) => {
      const { codingChallengeId } = action.payload;
      if (!state.completedChallenges[codingChallengeId])
        state.history.push({
          type: "challenge",
          challengeId: codingChallengeId
        });
      state.completedChallenges[codingChallengeId] = true;
    });
  }
});

export const {
  addQuest,
  completeQuest,
  completeQuestStep,
  completeTutorial,
  completeCutScene,
  unlockDoc,
  viewDoc,
  setDocsViewedPercentage,
  unsetDocFullyViewed,
  setGlobalChannel
} = progressionSlice.actions;

export const progressionReducer = progressionSlice.reducer;
