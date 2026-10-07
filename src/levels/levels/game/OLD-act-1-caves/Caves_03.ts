import { Color, Vector3 } from "three";

import { T000_5SpellGravity } from "src/components/tutorials/tutorials/t000_5SpellGravity";
import { setAssetDependencies } from "src/engine/entity/decorators";
import { LevelDefinitionAPI } from "src/engine/level/LevelLoaderAPI";
import { mutateLayout } from "src/engine/util/tabHelpers";
import { AreaTrigger } from "src/entities/environment/AreaTrigger";
import { BeanBot } from "src/entities/npcs/bean-bot/BeanBot";
import { Player } from "src/entities/player/Player";
import { isPlayerAPI } from "src/entities/player/PlayerAPI";
import { AreaSensorEvents } from "src/entities/shared/behaviors/AreaSensorBehavior";
import { OverlayConversation } from "src/entities/ui/OverlayConversation";
import {
  setDocsViewedPercentage,
  unsetDocFullyViewed
} from "src/redux/progression/slice";
import { store } from "src/redux/store";
import { startTutorial } from "src/redux/ui/slice";

import { act1PrereqsA } from "../../prereqs/allPrereqs";
import Caves_03Screenshot from "./Caves_03.png";

export const OLD_Caves_03: LevelDefinitionAPI = {
  id: "OLD_Caves_03",
  screenshotImage: Caves_03Screenshot,
  mapJson: async () =>
    (await import("src/levels/tiled/maps/OLD-act-1-caves/caves-03-0523.tmj"))
      .default,
  backgroundColor: new Color(0.05, 0.08, 0.1),
  ambientMusic: "caveMusic",
  demoItems: act1PrereqsA,
  demoAllies: [BeanBot],
  setup: (level) => {
    const player = level.getEntitiesForType(Player).at(0);
    const tutorialTrigger =
      level.getEntityForName<AreaTrigger>("tutorialTrigger");

    // Create boolean and logic between channels A and B, updating C.
    const updateBooleanLogic = () => {
      const a = level.state.getValue("A");
      const b = level.state.getValue("B");
      level.state.setValue("C", a && b);
    };
    level.state.subValue("A", updateBooleanLogic);
    level.state.subValue("B", updateBooleanLogic);

    if (!player || !tutorialTrigger) return;

    const cutsceneConvo = new OverlayConversation({
      position: new Vector3(),
      conversation: {
        start: "updateSpell",
        steps: {
          updateSpell: {
            speaker: "Adana",
            text: () => [
              "It looks like we will need to modify your Projectile even further..."
            ],
            next: "onToDocs"
          },
          onToDocs: {
            speaker: "Adana",
            text: () => [
              "Let us navigate through the documentation once more - You have unlocked more of its capabilities!"
            ],
            done: true
          }
        }
      }
    });
    cutsceneConvo.conversationEvents.on("complete", () => {
      store.dispatch(
        unsetDocFullyViewed("spell-api-guides/projectile-api-guide")
      );
      store.dispatch(
        setDocsViewedPercentage(["spell-api-guides/projectile-api-guide", 0])
      );
      store.dispatch(startTutorial(T000_5SpellGravity.id));
    });

    let cutsceneStarted = false;
    tutorialTrigger.behaviors.sensor.events.on(
      AreaSensorEvents.EntityContact,
      (e) => {
        if (!isPlayerAPI(e) || cutsceneStarted) return;
        cutsceneStarted = true;
        level.addEntity(cutsceneConvo);
      }
    );
  }
};

setAssetDependencies(() => ["caveMusic"])(OLD_Caves_03);
