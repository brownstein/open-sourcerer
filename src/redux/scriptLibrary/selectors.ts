import { RootState } from "../rootState";
import { getScriptSelectors } from "./slice";

const scriptSelectors = getScriptSelectors(
  (state: RootState) => state.scriptLibrary
);

export const selectScriptById = (state: RootState, scriptId: string) =>
  scriptSelectors.selectById(state, scriptId);

export const selectAllScripts = (state: RootState) =>
  scriptSelectors.selectAll(state);

export const selectAllScriptsById = (state: RootState) =>
  scriptSelectors.selectEntities(state);
