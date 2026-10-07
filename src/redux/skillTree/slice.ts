import { PayloadAction, createSlice } from "@reduxjs/toolkit";

import { loadGame } from "../shared/actions";

export type LearnedSkillsType = Record<string, Boolean>;

export type SkillTreeState = {
  learnedSkills: LearnedSkillsType;
  selectedSkillName: string;
  selectedSkillDescription: string;
};

const skillTreeSlice = createSlice({
  name: "skillTree",
  initialState: {
    // Keyed by SkillTreeNode name; starts empty (the old numeric ids were tied
    // to the now-removed SpellChart skill tree).
    learnedSkills: {},
    selectedSkillName: "",
    selectedSkillDescription: ""
  } as SkillTreeState,
  reducers: {
    learnSkill(state, action: PayloadAction<{ skillID: string }>) {
      state.learnedSkills[action.payload.skillID] = true;
    },
    setSelectedNode(
      state,
      action: PayloadAction<{
        selectedName: string;
        selectedDescription: string;
      }>
    ) {
      state.selectedSkillName = action.payload.selectedName;
      state.selectedSkillDescription = action.payload.selectedDescription;
    }
  },
  extraReducers: (builder) => {
    builder.addCase(loadGame, (state, action) => {
      const { skillTree } = action.payload.reduxStateData;
      if (!skillTree) return;
      const oldState = skillTree as Partial<SkillTreeState>;
      if (typeof oldState.learnedSkills === "object")
        state.learnedSkills = oldState.learnedSkills;
    });
  }
});

export const { learnSkill, setSelectedNode } = skillTreeSlice.actions;
export const skillTreeReducer = skillTreeSlice.reducer;
