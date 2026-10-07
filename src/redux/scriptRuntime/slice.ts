import { createEntityAdapter, createSlice } from "@reduxjs/toolkit";

export type ScriptRuntime = {
  id: string;
  editorId?: string;
  scriptId?: string;
  consoleComponentId?: string;
};

export const scriptRuntimeAdapter = createEntityAdapter({
  selectId: (runtime: ScriptRuntime) => runtime.id
});

const scriptRuntimeSlice = createSlice({
  name: "scriptRuntime",
  initialState: scriptRuntimeAdapter.getInitialState(),
  reducers: {}
});

export const scriptRuntimeReducer = scriptRuntimeSlice.reducer;
