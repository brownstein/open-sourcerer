import { createSelector } from "reselect";

import { RootState } from "../rootState";

export function selectDocProgress(state: RootState, docId: string) {
  return state.docsNav.progressById[docId] ?? null;
}

export function selectDocScrollProgressFraction(
  state: RootState,
  docId: string
) {
  return selectDocProgress(state, docId)?.scrollFraction ?? 0;
}

export const selectDocHeadingCompletionSet = createSelector(
  [selectDocProgress],
  (progress) => {
    return new Set(progress?.sectionIdsCompleted);
  }
);
