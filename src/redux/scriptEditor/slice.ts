import {
  EntityState,
  PayloadAction,
  createEntityAdapter,
  createSlice
} from "@reduxjs/toolkit";

import {
  SavedSpell,
  isSpellItemData,
  itemDataToSavedSpell
} from "src/api/spells";

import {
  addItems,
  loadGame,
  openNewCodeEditorPhase2,
  openTab,
  updateLayoutExt
} from "../shared/actions";

export type EditorData = {
  id: string;
  scriptId?: string;
  code?: string;
  codeUpdatedAt?: number;
  runtimeId?: string;
  savedSpellSnapshot?: SavedSpell;
};

export const scriptEditorsAdapter = createEntityAdapter({
  selectId: (editor: EditorData) => editor.id
});

const scriptEditorSlice = createSlice({
  name: "scriptEditor",
  initialState: scriptEditorsAdapter.getInitialState(),
  reducers: {
    upsertEditor(state, action: PayloadAction<EditorData>) {
      const editorData = {
        ...action.payload,
        codeUpdatedAt: Date.now()
      };
      scriptEditorsAdapter.upsertOne(state, editorData);
    },
    closeEditor(state, action: PayloadAction<string>) {
      scriptEditorsAdapter.removeOne(state, action.payload);
    }
  },
  extraReducers: (builder) => {
    builder.addCase(openNewCodeEditorPhase2, (state, action) => {
      if (state.ids.includes(action.payload.editorId)) return;
      scriptEditorsAdapter.addOne(state, {
        id: action.payload.editorId,
        code: action.payload.savedSpellSnapshot?.code,
        savedSpellSnapshot: action.payload.savedSpellSnapshot
      });
    });
    builder.addCase(openTab, (state, action) => {
      if (!action.payload.editorId) return;
      if (state.ids.includes(action.payload.editorId)) return;
      scriptEditorsAdapter.addOne(state, {
        id: action.payload.editorId,
        code: action.payload.editorConfig?.code,
        savedSpellSnapshot: action.payload.editorConfig?.spell
      });
    });
    builder.addCase(updateLayoutExt, (state, action) => {
      if (action.payload.editor) {
        scriptEditorsAdapter.addOne(state, {
          id: action.payload.editor.id,
          code: action.payload.editor.config.code,
          savedSpellSnapshot: action.payload.editor.config.spell
        });
      }
    });
    builder.addCase(addItems, (state, action) => {
      for (const { item, updateEditorId } of action.payload) {
        if (!updateEditorId) continue;
        if (!isSpellItemData(item)) continue;
        if (!state.entities[updateEditorId]) continue;
        scriptEditorsAdapter.updateOne(state, {
          id: updateEditorId,
          changes: {
            scriptId: item.scriptId,
            savedSpellSnapshot: itemDataToSavedSpell(item)
          }
        });
      }
    });
    builder.addCase(loadGame, (state, action) => {
      if (action.payload.preserveLayout) return;
      const { scriptEditor, scriptLibrary } = action.payload.reduxStateData;

      const oldState = scriptEditor as
        | EntityState<EditorData, string>
        | undefined;
      if (typeof oldState === "object") {
        for (const id of oldState.ids) {
          const editor = oldState.entities[id];
          if (editor && !state.entities[id]) {
            scriptEditorsAdapter.addOne(state, editor);
          }
        }
      }

      const libState = scriptLibrary as
        | EntityState<SavedSpell, string>
        | undefined;
      if (typeof libState === "object") {
        for (const id of state.ids) {
          const editor = state.entities[id];
          if (!editor) continue;
          const spellId = editor.scriptId ?? editor.savedSpellSnapshot?.id;
          if (!spellId) continue;
          const spell = libState.entities[spellId];
          if (spell) {
            editor.savedSpellSnapshot = spell;
          }
        }
      }
    });
  }
});

export const { upsertEditor, closeEditor } = scriptEditorSlice.actions;

export const scriptEditorReducer = scriptEditorSlice.reducer;

export const getScriptEditorSelectors = scriptEditorsAdapter.getSelectors;
