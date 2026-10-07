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

import { addItems, loadGame } from "../shared/actions";

export const scriptsAdapter = createEntityAdapter({
  selectId: (script: SavedSpell) => script.id,
  sortComparer: (a, b) => a.name.localeCompare(b.name)
});

const scriptLibrarySlice = createSlice({
  name: "scriptLibrary",
  initialState: scriptsAdapter.getInitialState(),
  reducers: {
    saveScript(state, action: PayloadAction<SavedSpell>) {
      scriptsAdapter.upsertOne(state, action.payload);
    },
    deleteScript(state, action: PayloadAction<string>) {
      scriptsAdapter.removeOne(state, action.payload);
    }
  },
  extraReducers: (builder) => {
    builder.addCase(addItems, (state, action) => {
      for (const item of action.payload) {
        if (!isSpellItemData(item.item)) continue;
        const spell: SavedSpell = itemDataToSavedSpell(item.item);
        scriptsAdapter.upsertOne(state, spell);
      }
    });
    builder.addCase(loadGame, (state, action) => {
      const { scriptLibrary } = action.payload.reduxStateData;
      const oldState = scriptLibrary as
        | EntityState<SavedSpell, string>
        | undefined;
      if (typeof oldState !== "object") return;

      const savedScripts = oldState.ids
        .map((id) => oldState.entities[id])
        .filter((s): s is SavedSpell => !!s);
      scriptsAdapter.upsertMany(state, savedScripts);
    });
  }
});

export const { saveScript, deleteScript } = scriptLibrarySlice.actions;

export const scriptLibraryReducer = scriptLibrarySlice.reducer;
export const getScriptSelectors = scriptsAdapter.getSelectors;
