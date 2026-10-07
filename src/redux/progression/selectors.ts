import { createSelector } from "reselect";

import { DocId } from "src/docs/indexedDocs/docTypes";

import { RootState } from "../rootState";

export const selectCompletedTutorials = (state: RootState) =>
  state.progression.completedTutorials;

export const selectTutorialCompleted = (state: RootState, tutorialId: string) =>
  !!selectCompletedTutorials(state)[tutorialId];

export const selectCutScenesCompleted = (state: RootState) =>
  state.progression.cutScenesCompleted;

export const selectChallengeComplete = (
  state: RootState,
  challengeId: string
) => !!state.progression.completedChallenges[challengeId];

export const selectOpenQuests = createSelector(
  [(state: RootState) => state.progression.quests],
  (quests) => quests.filter((q) => !q.complete)
);

export const selectProgressionHistory = (state: RootState) =>
  state.progression.history;

export const selectGlobalChannels = (state: RootState) =>
  state.progression.globalChannels;

export const selectIsDocUnlocked = (state: RootState, docId: DocId): boolean =>
  !!state.progression.unlockedDocs[docId];

export const selectRecentlyViewedDocs = (state: RootState): DocId[] =>
  state.progression.recentlyViewedDocs;

export const selectViewCountForDoc = (state: RootState, docId: DocId): number =>
  state.progression.docsViewCounts[docId] ?? 0;

export const selectViewedPercentageForDoc = (
  state: RootState,
  docId: DocId
): number => state.progression.docsViewedPercentage[docId] ?? 0;

export const selectHasDocBeenFullyViewed = (
  state: RootState,
  docId: DocId
): boolean => !!state.progression.docsFullyViewed[docId];

export const selectUnreadDocsWithKeyNesting = createSelector(
  [
    (state: RootState) => state.progression.unlockedDocs,
    (state: RootState) => state.progression.docsFullyViewed
  ],
  (unlocked, viewed) => {
    const unlockedSet = new Set<string>(Object.keys(unlocked));
    const fullyViewedSet = new Set<string>(Object.keys(viewed));
    const result = new Map<string, string[]>();
    for (const unlockedMember of unlockedSet) {
      if (fullyViewedSet.has(unlockedMember)) continue;
      const parts = unlockedMember.split("/");
      for (let i = 0; i < parts.length; i++) {
        const key = parts.slice(i).join("/");
        if (!result.has(key)) result.set(key, []);
        result.get(key)?.push(unlockedMember);
      }
    }
    return result;
  }
);
