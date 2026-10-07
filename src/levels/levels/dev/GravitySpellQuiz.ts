import { LevelDefinitionAPI } from "src/engine/level/LevelLoaderAPI";
import { AreaTrigger } from "src/entities/environment/AreaTrigger";
import { ShrineDoor } from "src/entities/environment/ShrineDoor";
import { AreaSensorEvents } from "src/entities/shared/behaviors/AreaSensorBehavior";

import GravitySpellQuizScreenshot from "./GravitySpellQuiz.png";

export const GravitySpellQuiz: LevelDefinitionAPI = {
  id: "GravitySpellQuiz",
  screenshotImage: GravitySpellQuizScreenshot,
  mapJson: async () =>
    (await import("src/levels/tiled/maps/dev/GravitySpellQuiz.tmj")).default,
  setup(level) {
    const trigger1 = level.getEntityForName<AreaTrigger>("Trigger1");
    const trigger2 = level.getEntityForName<AreaTrigger>("Trigger2");
    const door = level.getEntityForName<ShrineDoor>("PuzzleDoor");

    trigger1?.behaviors.sensor.events.on(
      AreaSensorEvents.EntityContactEnd,
      () => {
        if (
          trigger1.behaviors.sensor.contactedEntityIds.size - 1 <= 1 &&
          (trigger2?.behaviors.sensor.contactedEntityIds.size ?? 0) === 0
        ) {
          door?.open();
        }
      }
    );

    trigger2?.behaviors.sensor.events.on(
      AreaSensorEvents.EntityContactEnd,
      () => {
        if (
          (trigger1?.behaviors.sensor.contactedEntityIds.size ?? 0) === 0 &&
          (trigger2.behaviors.sensor.contactedEntityIds.size ?? 0) <= 1
        ) {
          door?.open();
        }
      }
    );
  }
};
