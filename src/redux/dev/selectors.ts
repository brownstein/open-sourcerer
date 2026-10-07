import { RootState } from "../rootState";

export function selectDevPhysicsOverlayEnabled(state: RootState) {
  return state.dev.enablePhysicsOverlay;
}

export function selectDevToolsOverlayEnabled(state: RootState) {
  return state.dev.enableToolsOverlay;
}

export function selectDevFrameSteppingEnabled(state: RootState) {
  return state.dev.enableFrameStepping;
}

export function selectEditorTestLevelId(state: RootState) {
  return state.dev.editorTestLevelId;
}

export const selectNoClipEnabled = (state: RootState): boolean =>
  state.dev.enableNoClip;
