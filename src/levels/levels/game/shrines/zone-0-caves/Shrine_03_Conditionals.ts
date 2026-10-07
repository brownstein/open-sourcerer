import { isTerrain } from "src/entities/terrain/BaseTerrain";
import { createCodingChallengeLevel } from "src/levels/levels/shared/codingChallengeWrapper";

import { Shrine03ConditionalsName } from "./ShrinesTypes";

export const Shrine03Conditionals = createCodingChallengeLevel({
  id: Shrine03ConditionalsName,
  localizedName: "challenges.03.name",
  challengeId: "ConditionalsAndLoops",
  mapJson: async () =>
    (
      await import(
        "src/levels/tiled/maps/shrines/act-1/Shrine03Conditionals.tmj"
      )
    ).default,
  setup: (level) => {
    // Hide boundary walls.
    for (const entity of level.getEntities().values()) {
      if (isTerrain(entity) && entity.layerName === "Invisible Walls") {
        entity.object3D.visible = false;
      }
    }
  }
});
