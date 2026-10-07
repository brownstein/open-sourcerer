import { RootState } from "../rootState";

export const selectLearnedSkillsMap = (state: RootState) =>
  state.skillTree.learnedSkills;

export const selectSkillName = (state: RootState) =>
  state.skillTree.selectedSkillName;

export const selectSkillDescription = (state: RootState) =>
  state.skillTree.selectedSkillDescription;
