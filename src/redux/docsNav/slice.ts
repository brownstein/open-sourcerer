import { PayloadAction, createSlice, nanoid } from "@reduxjs/toolkit";

import { DocLocation } from "src/api/docs";
import { DocId } from "src/docs/indexedDocs/docTypes";

export type DocsNavRequest = DocLocation<DocId> & { requestId: string };

export type DocReadProgress = {
  scrollFraction?: number;
  sectionIdsCompleted?: string[];
};

type DocsNavState = {
  pending: DocsNavRequest | null;
  progressById: Record<string, DocReadProgress>;
};

const initialState: DocsNavState = {
  pending: null,
  progressById: {}
};

const docsNavSlice = createSlice({
  name: "docsNav",
  initialState,
  reducers: {
    openDocAt: {
      reducer(state, action: PayloadAction<DocsNavRequest>) {
        state.pending = action.payload;
      },
      prepare(location: DocLocation<DocId>) {
        return {
          payload: { ...location, requestId: nanoid() }
        };
      }
    },
    acknowledgeOpenDoc(state, action: PayloadAction<{ requestId: string }>) {
      if (
        state.pending &&
        state.pending.requestId === action.payload.requestId
      ) {
        state.pending = null;
      }
    },
    updateReadProgress(
      state,
      action: PayloadAction<{
        docId: string;
        progress: Partial<DocReadProgress>;
      }>
    ) {
      const { docId, progress } = action.payload;
      if (!(docId in state.progressById)) {
        state.progressById[docId] = {};
      }
      if (progress.scrollFraction)
        state.progressById[docId].scrollFraction = Math.max(
          state.progressById[docId].scrollFraction ?? 0,
          progress.scrollFraction
        );
      if (progress.sectionIdsCompleted)
        state.progressById[docId].sectionIdsCompleted = [
          ...new Set([
            ...(state.progressById[docId].sectionIdsCompleted ?? []),
            ...progress.sectionIdsCompleted
          ])
        ];
    }
  }
  // TODO: load game support here for docs.
});

const { openDocAt: untypedOpenDocAt, acknowledgeOpenDoc } =
  docsNavSlice.actions;

export const openDocAt = Object.assign(
  <TDoc extends DocId>(location: DocLocation<TDoc>) =>
    untypedOpenDocAt(location),
  { type: untypedOpenDocAt.type, match: untypedOpenDocAt.match }
);

export { acknowledgeOpenDoc };

export const docsNavReducer = docsNavSlice.reducer;
