import { PayloadAction, createSlice } from "@reduxjs/toolkit";

import { extractOptsFromCurrentURL } from "src/util/devUtil";

const defaultDevOpts = extractOptsFromCurrentURL();

export type DevState = {
  enablePhysicsOverlay: boolean;
  enableToolsOverlay: boolean;
  enableFrameStepping: boolean;
  enableNoClip: boolean;
  /** When set, the death screen offers "Retry Level" instead of "Load Save" */
  editorTestLevelId: string | null;
};

const initialState: DevState = {
  enablePhysicsOverlay: !!defaultDevOpts?.showDevOverlay,
  enableToolsOverlay: false,
  enableFrameStepping: false,
  enableNoClip: false,
  editorTestLevelId: null
};

const devSlice = createSlice({
  name: "dev",
  initialState,
  reducers: {
    setEnablePhysicsOverlay(state, action: PayloadAction<boolean>) {
      state.enablePhysicsOverlay = action.payload;
    },
    setEnableToolsOverlay(state, action: PayloadAction<boolean>) {
      state.enableToolsOverlay = action.payload;
    },
    setEnableFrameStepping(state, action: PayloadAction<boolean>) {
      state.enableFrameStepping = action.payload;
    },
    setEditorTestLevelId(state, action: PayloadAction<string | null>) {
      state.editorTestLevelId = action.payload;
    },
    setEnableNoClip(state, action: PayloadAction<boolean>) {
      state.enableNoClip = action.payload;
    }
  }
});

export const {
  setEnablePhysicsOverlay,
  setEnableToolsOverlay,
  setEnableFrameStepping,
  setEditorTestLevelId,
  setEnableNoClip
} = devSlice.actions;
export const devReducer = devSlice.reducer;
