import { LevelDefinitionAPI } from "src/engine/level/LevelLoaderAPI";

import VisualizerScreenshot from "./Visualizer.png";

export const Visualizer: LevelDefinitionAPI = {
  id: "Visualizer",
  screenshotImage: VisualizerScreenshot,
  mapJson: async () =>
    (await import("../../tiled/maps/dev/Visualizer.tmj")).default
};
