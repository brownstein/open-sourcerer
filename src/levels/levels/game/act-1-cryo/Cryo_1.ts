import { savedSpellToItemData } from "src/api/spells";
import { typedEmitterPromise } from "src/api/util";
import { LevelDefinitionAPI } from "src/engine/level/LevelLoaderAPI";
import { getPlayer } from "src/engine/util/levelUtil";
import { vector3To2 } from "src/engine/util/vecTypes";
import { BrokenDoor } from "src/entities/environment/BrokenDoor";
import { Chest } from "src/entities/environment/Chest";
import { Switch } from "src/entities/environment/Switch";
import { Adana } from "src/entities/npcs/adana/Adana";
import { BeanBot } from "src/entities/npcs/bean-bot/BeanBot";
import { isPlayerAPI } from "src/entities/player/PlayerAPI";
import { PathFollowingBehaviorEvents } from "src/entities/shared/behaviors/NavPathFollowingBehavior";
import { OverlayConversation } from "src/entities/ui/OverlayConversation";
import { selectPlayerName } from "src/redux/status/selectors";
import { setCutsceneLocked } from "src/redux/status/slice";
import { store } from "src/redux/store";
import { builtInSpells } from "src/scripting/builtinScripts";

import Cryo_1Screenshot from "./Cryo_1.png";

export const Cryo_1: LevelDefinitionAPI = {
  id: "Cryo_1",
  screenshotImage: Cryo_1Screenshot,
  mapJson: async () =>
    (await import("src/levels/tiled/maps/act-1-cryo/cryo-1.tmj")).default,
  setup: async (level) => {
    const chest = level.getEntitiesForType<Chest>(Chest).at(0);

    const player = getPlayer(level);
    if (!player || !isPlayerAPI(player)) return;

    const bigDoor = level.getEntitiesForType<BrokenDoor>(BrokenDoor).at(0);
    const bigSwitch = level.getEntitiesForType(Switch).at(0);

    let adana: Adana | undefined;

    if (!player || !chest || !bigDoor || !bigSwitch) return;

    chest.behaviors.inventory.items = [
      {
        type: "Sword"
      },
      savedSpellToItemData(builtInSpells.AirBurst)
    ];

    chest.behaviors.inventory.events.on("takeAll", async () => {
      const beanBot = level.getEntitiesForType(BeanBot).at(0);
      if (!beanBot) return;
      store.dispatch(setCutsceneLocked(true));
      beanBot.swapControlMethod("physics");
      const targetPos = vector3To2(player.position);
      targetPos.x += 3;
      beanBot.behaviors.pathFollowing.planAndFollowPathToPosition(targetPos);
      await typedEmitterPromise(
        beanBot.behaviors.pathFollowing.pathEvents,
        PathFollowingBehaviorEvents.PathComplete
      );
      beanBot.faceLeft();
      const adanaPos = player.position.clone();
      adanaPos.x += 1.5;
      adanaPos.y += 0.25;
      adana = new Adana({
        position: adanaPos
      });
      adana.setOpacity(0, 0);
      adana.setOpacity(1);
      level.addEntity(adana);

      const convo = new OverlayConversation({
        position: adanaPos,
        conversation: {
          start: "start",
          steps: {
            start: {
              speaker: "Adana",
              text: () => [
                "I made this spell for you, as you’re going to need it to reach my shrine.",
                "Now be quick — we don’t have much time left before they find us."
              ],
              nextOptions: [
                {
                  text: () => "What's a shrine?",
                  next: "what"
                },
                {
                  text: () => "Ok.",
                  next: "done"
                }
              ]
            },
            what: {
              speaker: "Adana",
              text: () =>
                "A shrine is a place where I store parts of my consciousness.",
              nextOptions: [
                {
                  text: () => "Why?",
                  next: "why"
                },
                {
                  text: () => "Ok.",
                  next: "done"
                }
              ]
            },
            why: {
              speaker: "Adana",
              text: () => "I will explain in due time.",
              done: true
            },
            done: {
              speaker: "Adana",
              text: () => "Let's get going.",
              done: true
            }
          }
        }
      });
      level.addEntity(convo);
      await typedEmitterPromise(convo.conversationEvents, "complete");
      adana.setOpacity(0);
      store.dispatch(setCutsceneLocked(false));
      beanBot.swapControlMethod("physicsFollowPlayer");
    });

    bigSwitch.switchEvents.on("stateUpdateCompleted", async (active) => {
      const beanBot = level.getEntitiesForType(BeanBot).at(0);
      if (!active || !beanBot) return;
      store.dispatch(setCutsceneLocked(true));
      bigDoor.runOpeningSequence();
      await typedEmitterPromise(bigDoor.doorEvents, "openingSequenceDone");
      bigSwitch.setActive(false);

      beanBot.swapControlMethod("physics");
      const targetPos = vector3To2(player.position);
      targetPos.x += 3;
      beanBot.behaviors.pathFollowing.planAndFollowPathToPosition(targetPos);
      await typedEmitterPromise(
        beanBot.behaviors.pathFollowing.pathEvents,
        PathFollowingBehaviorEvents.PathComplete
      );
      beanBot.faceLeft();
      const adanaPos = player.position.clone();
      adanaPos.x += 1.5;
      adanaPos.y += 0.25;
      adana = new Adana({
        position: adanaPos
      });
      adana.setOpacity(0, 0);
      adana.setOpacity(1);
      level.addEntity(adana);

      const convo = new OverlayConversation({
        position: adanaPos,
        conversation: {
          start: "start",
          steps: {
            start: {
              speaker: "Adana",
              text: () => [
                "Darn it!",
                `Quick, ${selectPlayerName(store.getState())} — follow Bean-Bot, he will show you the way out.`,
                "Please hurry… for both our sakes."
              ],
              done: true
            }
          }
        }
      });
      level.addEntity(convo);
      await typedEmitterPromise(convo.conversationEvents, "complete");
      adana.setOpacity(0);
      store.dispatch(setCutsceneLocked(false));
      const bbGoRight = level.getEntityForName("BeanBotGoRight");
      if (!bbGoRight) return;
      beanBot.behaviors.pathFollowing.planAndFollowPathToPosition(
        vector3To2(bbGoRight.position)
      );
      beanBot.behaviors.pathFollowing.pathEvents.once(
        PathFollowingBehaviorEvents.PathComplete,
        () => {
          beanBot.setOpacity(0);
        }
      );
    });

    await typedEmitterPromise(bigDoor.doorEvents, "openingSequenceDone");
  }
};
