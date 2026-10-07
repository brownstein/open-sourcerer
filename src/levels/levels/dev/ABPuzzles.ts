import { LevelDefinitionAPI } from "src/engine/level/LevelLoaderAPI";

export const ABPuzzleArray01: LevelDefinitionAPI = {
  id: "ABPuzzleArray01",
  mapJson: async () =>
    (await import("src/levels/tiled/maps/dev/ABPuzzleArray01.tmj")).default
};

export const ABPuzzleDataType01: LevelDefinitionAPI = {
  id: "ABPuzzleDataType01",
  mapJson: async () =>
    (await import("src/levels/tiled/maps/dev/ABPuzzleDataType01.tmj")).default
};

export const ABPuzzleIsEven: LevelDefinitionAPI = {
  id: "ABPuzzleIsEven",
  mapJson: async () =>
    (await import("src/levels/tiled/maps/dev/ABPuzzleIsEven.tmj")).default
};

export const ABPuzzleModulus01: LevelDefinitionAPI = {
  id: "ABPuzzleModulus01",
  mapJson: async () =>
    (await import("src/levels/tiled/maps/dev/ABPuzzleModulus01.tmj")).default
};

export const ABPuzzleOperator01: LevelDefinitionAPI = {
  id: "ABPuzzleOperator01",
  mapJson: async () =>
    (await import("src/levels/tiled/maps/dev/ABPuzzleOperator01.tmj")).default
};
