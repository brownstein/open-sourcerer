import { LevelDefinitionAPI } from "src/engine/level/LevelLoaderAPI";
import levelScreenshot from "src/levels/tiled/maps/dev/RB_Puzzle_02.png";
import level3Screenshot from "src/levels/tiled/maps/dev/RB_Puzzle_03.png";
import level4Screenshot from "src/levels/tiled/maps/dev/RB_Puzzle_04.png";

export const RBPuzzle02: LevelDefinitionAPI = {
  id: "RBPuzzle02",
  screenshotImage: levelScreenshot,
  mapJson: async () =>
    (await import("src/levels/tiled/maps/dev/RB_Puzzle_02.tmj")).default,
  setup: (_level) => {}
};

export const RBPuzzle03: LevelDefinitionAPI = {
  id: "RBPuzzle03",
  screenshotImage: level3Screenshot,
  mapJson: async () =>
    (await import("src/levels/tiled/maps/dev/RB_Puzzle_03.tmj")).default,
  setup: (_level) => {}
};

export const RBPuzzle04: LevelDefinitionAPI = {
  id: "RBPuzzle04",
  screenshotImage: level4Screenshot,
  mapJson: async () =>
    (await import("src/levels/tiled/maps/dev/RB_Puzzle_04.tmj")).default,
  setup: (_level) => {}
};

export const RBUntitled01: LevelDefinitionAPI = {
  id: "RBUntitled01",
  mapJson: async () =>
    (await import("src/levels/tiled/maps/dev/RB Untitled 1.tmj")).default
};

export const RBUntitled02: LevelDefinitionAPI = {
  id: "RBUntitled02",
  mapJson: async () =>
    (await import("src/levels/tiled/maps/dev/RB Untitled 2.tmj")).default
};

export const RBUntitled03: LevelDefinitionAPI = {
  id: "RBUntitled03",
  mapJson: async () =>
    (await import("src/levels/tiled/maps/dev/RB Untitled 3.tmj")).default
};

export const Fork: LevelDefinitionAPI = {
  id: "Fork",
  mapJson: async () =>
    (await import("src/levels/tiled/maps/dev/Fork.tmj")).default
};
