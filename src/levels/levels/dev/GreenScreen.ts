import { LevelAPI } from "src/api/entity";
import { LevelDefinitionAPI } from "src/engine/level/LevelLoaderAPI";
import { BaseTerrain } from "src/entities/terrain/BaseTerrain";

import GreenScreenScreenshot from "./GreenScreen.png";

export const GreenScreen: LevelDefinitionAPI = {
  id: "GreenScreen",
  screenshotImage: GreenScreenScreenshot,
  mapJson: async () =>
    (await import("../../tiled/maps/dev/green-screen.tmj")).default,
  setup: (level: LevelAPI) => {
    level
      .getEntitiesForType(BaseTerrain)
      .filter((tile) => tile.layerName === "Boundaries")
      .forEach((boundary) => (boundary.object3D.visible = false));
  }
};
