import { Color } from "three";

import { EntityLevelEvents, LevelAPI } from "src/api/entity";
import { typedEmitterPromise } from "src/api/util";
import { setAssetDependencies } from "src/engine/entity/decorators";
import { LevelDefinitionAPI } from "src/engine/level/LevelLoaderAPI";
import { Scheduler } from "src/engine/scheduling/Scheduler";
import { AreaTrigger } from "src/entities/environment/AreaTrigger";
import { ShrineEntranceBackground } from "src/entities/environment/ShrineEntranceBackground";
import { BeanBot } from "src/entities/npcs/bean-bot/BeanBot";
import { isPlayerAPI } from "src/entities/player/PlayerAPI";
import { AreaSensorEvents } from "src/entities/shared/behaviors/AreaSensorBehavior";
import { selectCutScenesCompleted } from "src/redux/progression/selectors";
import { completeCutScene } from "src/redux/progression/slice";
import { store } from "src/redux/store";

import { act1PrereqsA } from "../../prereqs/allPrereqs";
import Caves_06Screenshot from "./Caves_06.png";

export const OLD_Caves_06: LevelDefinitionAPI = {
  id: "OLD_Caves_06",
  screenshotImage: Caves_06Screenshot,
  mapJson: async () =>
    (await import("src/levels/tiled/maps/OLD-act-1-caves/caves-06-0425.tmj"))
      .default,
  backgroundColor: new Color(0.05, 0.08, 0.1),
  ambientMusic: "caveMusic",
  demoItems: act1PrereqsA,
  demoAllies: [BeanBot],
  setup: (level: LevelAPI) => {
    const cutsceneSensor =
      level.getEntityForName<AreaTrigger>("Cutscene Start");
    if (!cutsceneSensor) {
      console.error("Cutscene start sensor is missing");
      return;
    }

    const shrineEntrance = level
      .getEntitiesForType(ShrineEntranceBackground)
      .at(0);
    if (!shrineEntrance) {
      console.error("Shrine entrance is missing");
      return;
    }

    const alreadyCompletedCutscene = selectCutScenesCompleted(store.getState())[
      OLD_Caves_06.id
    ];
    if (alreadyCompletedCutscene) {
      shrineEntrance.openImmediately();
      return;
    }

    const scheduler = new Scheduler();
    level.on(EntityLevelEvents.Step, (deltaMs) => scheduler.step(deltaMs));

    cutsceneSensor.behaviors.sensor.events.on(
      AreaSensorEvents.EntityContact,
      async function cutscene(contactedEntity) {
        if (!isPlayerAPI(contactedEntity)) return;

        cutsceneSensor.behaviors.sensor.events.off(
          AreaSensorEvents.EntityContact,
          cutscene
        );

        contactedEntity.setMovementEnabled(false);

        await scheduler.asyncTimeout(1000);

        shrineEntrance.open();

        await typedEmitterPromise(
          shrineEntrance.shrineEntranceEvents,
          "cutsceneEnd"
        );

        store.dispatch(completeCutScene(OLD_Caves_06.id));

        contactedEntity.setMovementEnabled(true);
      }
    );
  }
};

setAssetDependencies(() => ["caveMusic"])(OLD_Caves_06);
