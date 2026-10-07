import { EntityLevelEvents } from "src/api/entity";
import { LevelDefinitionAPI } from "src/engine/level/LevelLoaderAPI";
import { Scheduler } from "src/engine/scheduling/Scheduler";
import { Echo } from "src/entities/enemies/bosses/echo/Echo";
import { EchoBossPhase } from "src/entities/enemies/bosses/echo/dataTypes";
import { AreaTrigger } from "src/entities/environment/AreaTrigger";
import { isPlayerAPI } from "src/entities/player/PlayerAPI";
import { AreaSensorEvents } from "src/entities/shared/behaviors/AreaSensorBehavior";
import { BaseTerrain } from "src/entities/terrain/BaseTerrain";

import EchoBossChamberScreenshot from "./EchoBossChamber.png";

export const EchoBossChamber: LevelDefinitionAPI = {
  id: "EchoBossChamber",
  screenshotImage: EchoBossChamberScreenshot,
  mapJson: async () =>
    (await import("src/levels/tiled/maps/bosses/EchoBossChamber609.tmj"))
      .default,
  setup: (level) => {
    // Hide collision layer.
    const mainCollisionsTerrain = [
      ...level.getEntitiesForType(BaseTerrain).values()
    ].filter((e) => e.layerName === "Main Collisions");
    for (const wall of mainCollisionsTerrain) wall.object3D.visible = false;

    // Trigger boss fight based on proximity to Echo.
    const echo = level.getEntitiesForType(Echo).at(0);
    const startTrigger = level.getEntityForName<AreaTrigger>("StartBossFight");
    if (!echo || !startTrigger) return;

    const scheduler = new Scheduler();
    level.on(EntityLevelEvents.Step, scheduler.step.bind(scheduler));
    scheduler.add({
      startIn: 500,
      invokeFunctionAtComplete: () => echo.wakeUpAndStartFight()
    });
    scheduler.add({
      startIn: 10000,
      invokeFunctionAtComplete: () => echo.setPhase(EchoBossPhase.Phase_2)
    });

    startTrigger.behaviors.sensor.events.on(
      AreaSensorEvents.EntityContact,
      (entity) => {
        if (isPlayerAPI(entity)) {
          echo.wakeUpAndStartFight();
        }
      }
    );
  }
};
