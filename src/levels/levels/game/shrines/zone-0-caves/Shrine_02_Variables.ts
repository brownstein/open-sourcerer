import { isTerrain } from "src/entities/terrain/BaseTerrain";
import { createCodingChallengeLevel } from "src/levels/levels/shared/codingChallengeWrapper";

import Shrine02VariablesScreenshot from "./Shrine02Variables.png";
import { Shrine02VariablesName } from "./ShrinesTypes";

export const Shrine02Variables = createCodingChallengeLevel({
  id: Shrine02VariablesName,
  challengeId: "Variables",
  screenshotImage: Shrine02VariablesScreenshot,
  mapJson: async () =>
    (await import("src/levels/tiled/maps/shrines/act-1/Shrine02Variables.tmj"))
      .default,
  setup: (level) => {
    // Hide boundary walls.
    for (const entity of level.getEntities().values()) {
      if (isTerrain(entity) && entity.layerName === "Invisible Walls") {
        entity.object3D.visible = false;
      }
    }
  }
});
