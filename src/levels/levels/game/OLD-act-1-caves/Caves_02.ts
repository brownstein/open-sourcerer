import { Color, Vector3 } from "three";

import { T000AimSpell } from "src/components/tutorials/tutorials/t000AimSpell";
import { setAssetDependencies } from "src/engine/entity/decorators";
import { LevelDefinitionAPI } from "src/engine/level/LevelLoaderAPI";
import { Scheduler } from "src/engine/scheduling/Scheduler";
import { mutateLayout } from "src/engine/util/tabHelpers";
import { Bat } from "src/entities/enemies/critters/Bat";
import { AreaTrigger } from "src/entities/environment/AreaTrigger";
import { BeanBot } from "src/entities/npcs/bean-bot/BeanBot";
import { Player } from "src/entities/player/Player";
import { isPlayerAPI } from "src/entities/player/PlayerAPI";
import { AreaSensorEvents } from "src/entities/shared/behaviors/AreaSensorBehavior";
import { OverlayConversation } from "src/entities/ui/OverlayConversation";
import { store } from "src/redux/store";
import { exitTutorial, startTutorial } from "src/redux/ui/slice";

import { act1PrereqsA } from "../../prereqs/allPrereqs";
import Caves_02Screenshot from "./Caves_02.png";

export const OLD_Caves_02: LevelDefinitionAPI = {
  id: "OLD_Caves_02",
  screenshotImage: Caves_02Screenshot,
  mapJson: async () =>
    (await import("src/levels/tiled/maps/OLD-act-1-caves/caves-02-045.tmj"))
      .default,
  backgroundColor: new Color(0.05, 0.08, 0.1),
  ambientMusic: "caveMusic",
  demoItems: act1PrereqsA,
  demoAllies: [BeanBot],
  setup: (level) => {
    const player = level.getEntitiesForType(Player).at(0);
    const scheduler = new Scheduler();
    const bat = level.getEntitiesForType(Bat).at(0);
    const tutorial1Trigger =
      level.getEntityForName<AreaTrigger>("TutorialTrigger1");

    if (!player || !tutorial1Trigger) return;

    const cutscene1Convo = new OverlayConversation({
      position: new Vector3(),
      conversation: {
        start: "updateSpell",
        steps: {
          updateSpell: {
            speaker: "Adana",
            text: () => [
              "Looks like this switch is too high to hit directly..."
            ],
            next: "luckily"
          },
          luckily: {
            speaker: "Adana",
            text: () => [
              "Luckily, you have access to a wealth of information to study and tackle these problems.",
              "Let me show you."
            ],
            done: true
          }
        }
      }
    });
    cutscene1Convo.conversationEvents.on("complete", () => {
      store.dispatch(startTutorial(T000AimSpell.id));
    });

    let cutscene1Started = false;
    tutorial1Trigger.behaviors.sensor.events.on(
      AreaSensorEvents.EntityContact,
      (e) => {
        if (!isPlayerAPI(e) || cutscene1Started) return;
        cutscene1Started = true;
        level.addEntity(cutscene1Convo);
      }
    );
  },
  teardown: () => {
    store.dispatch(exitTutorial(T000AimSpell.id));
  }
};

setAssetDependencies(() => ["caveMusic"])(OLD_Caves_02);
