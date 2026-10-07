import { LevelDefinitionAPI } from "src/engine/level/LevelLoaderAPI";

import VolcDebugRoomScreenshot from "./VolcDebugRoom.png";

export const VolcDebugRoom: LevelDefinitionAPI = {
  id: "VolcDebugRoom",
  screenshotImage: VolcDebugRoomScreenshot,
  mapJson: async () =>
    (await import("../../tiled/maps/dev/VolcDebugRoom.tmj")).default
};
