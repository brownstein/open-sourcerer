import { RootState } from "../rootState";
import { getScriptEditorSelectors } from "./slice";

export const scriptEditorSelectors = getScriptEditorSelectors(
  (state: RootState) => state.scriptEditor
);

export const selectAllScriptEditorEntities = scriptEditorSelectors.selectEntities;
export const selectAllScriptEditors = scriptEditorSelectors.selectAll;
export const selectScriptEditor = scriptEditorSelectors.selectById;