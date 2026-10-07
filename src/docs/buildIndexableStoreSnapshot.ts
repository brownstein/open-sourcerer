import { DeepPartial } from "src/api/util";
import {
  TutorialId,
  allTutorials
} from "src/components/tutorials/tutorials/allTutorials";
import { RootState } from "src/redux/rootState";

import { allDocIds } from "./allDocs";
import { DocId } from "./indexedDocs/docTypes";

/*
 * NOTE: some doc components depend on redux state, and it is our job to tune
 * a snapshot of redux state we wish to use to build our build-time docs indexes.
 *
 * NOTE: alvin: I prefer a "most-content" approach, as parts of the index can be locked at run-time, while
 * the index itself cannot be regenerated at run-time.
 *
 * NOTE: if a docs component uses redux state we have not defined here, the index
 * building plugin will immediately error by design. Add that piece of state in
 */
export const buildIndexableStoreSnapshot = (): DeepPartial<RootState> => {
  const allDocsUnlocked: Partial<Record<DocId, boolean>> = {};
  for (const docId of allDocIds) {
    allDocsUnlocked[docId] = true;
  }

  const allTutorialsCompleted: Partial<Record<TutorialId, boolean>> = {};
  for (const tutorialId of allTutorials.keys()) {
    const typedTutorialId = tutorialId as TutorialId;
    allTutorialsCompleted[typedTutorialId] = true;
  }

  return {
    progression: {
      unlockedDocs: allDocsUnlocked,
      completedTutorials: allTutorialsCompleted,
      // Doc read-tracking state (see progression/slice.ts). Selectors like
      // selectUnreadDocsWithKeyNesting call Object.keys() on these, so they
      // must exist or SSR indexing throws. Default to a fresh-progress state
      // (all docs unlocked, none viewed) — consistent with the most-content
      // approach: every doc renders as available and unread.
      recentlyViewedDocs: [],
      docsViewCounts: {},
      docsViewedPercentage: {},
      docsFullyViewed: {}
    },
    status: { customization: { name: "" } },
    ui: { tutorialQueue: [] }
  };
};
