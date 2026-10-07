import { LevelDefinitionAPI } from "src/engine/level/LevelLoaderAPI";

/**
 * The skill-tree "level": an object-only Tiled map of SkillTreeNode /
 * SkillTreeConnection entities. It is intentionally NOT registered in
 * `allLevels` — it is never the controller's active level. The Skill Tree tab
 * loads it standalone via `LevelLoader.setLevelDef(SkillTreeLevel)` and renders
 * it in a temporary, component-owned viewport.
 */
export const SkillTreeLevel: LevelDefinitionAPI = {
  id: "SkillTree",
  mapJson: async () =>
    (await import("../../tiled/maps/dev/SkillTreeSample.tmj")).default,
  setup: (level) => {
    
  }
};
