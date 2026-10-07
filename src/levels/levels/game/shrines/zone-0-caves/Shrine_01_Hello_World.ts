import { isTerrain } from "src/entities/terrain/BaseTerrain";
import { createCodingChallengeLevel } from "src/levels/levels/shared/codingChallengeWrapper";

import Shrine01HelloWorldScreenshot from "./Shrine01HelloWorld.png";
import { Shrine01HelloWorldName } from "./ShrinesTypes";

export const Shrine01HelloWorld = createCodingChallengeLevel({
  id: Shrine01HelloWorldName,
  challengeId: "HelloWorld",
  screenshotImage: Shrine01HelloWorldScreenshot,
  localizedName: "challenges.c01.name",
  mapJson: async () =>
    (await import("src/levels/tiled/maps/shrines/act-1/Shrine01HelloWorld.tmj"))
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
