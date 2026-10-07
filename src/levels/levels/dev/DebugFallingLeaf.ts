import { LevelDefinitionAPI } from "src/engine/level/LevelLoaderAPI";

import DebugFallingLeafScreenshot from "./DebugFallingLeaf.png";

export const DebugFallingLeaf: LevelDefinitionAPI = {
  id: "DebugFallingLeaf",
  screenshotImage: DebugFallingLeafScreenshot,
  mapJson: async () =>
    (await import("../../tiled/maps/dev/DebugFallingLeaf.tmj")).default
};
