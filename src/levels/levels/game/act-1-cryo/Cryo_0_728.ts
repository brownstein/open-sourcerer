import shortid from "shortid";
import { Color, Vector3 } from "three";

import { CameraRequest, CameraRequestPriority } from "src/api/camera";
import { EntityLevelEvents } from "src/api/entity";
import { typedEmitterPromise } from "src/api/util";
import { promptCharacterCustomization } from "src/components/modals/character/promptCharacterCustomization";
import adanaPng from "src/components/shared-assets/character-images/adanaHologram.png";
import { setAssetDependencies } from "src/engine/entity/decorators";
import { LevelDefinitionAPI } from "src/engine/level/LevelLoaderAPI";
import { Scheduler } from "src/engine/scheduling/Scheduler";
import { getPlayer } from "src/engine/util/levelUtil";
import { vector3To2 } from "src/engine/util/vecTypes";
import { BeanBotDock } from "src/entities/environment/BeanBotDock";
import { Chest } from "src/entities/environment/Chest";
import { SolidColorForeground } from "src/entities/environment/SolidColorForeground";
import { TechDoor } from "src/entities/environment/doors/TechDoor";
import { IntroSeqTitleOverlay } from "src/entities/environment/special/cryo/IntroSeqTitleOverlay";
import { Adana } from "src/entities/npcs/adana/Adana";
import { BeanBot, BeanBotEvents } from "src/entities/npcs/bean-bot/BeanBot";
import { PathFollowingBehaviorEvents } from "src/entities/shared/behaviors/NavPathFollowingBehavior";
import { isTerrain } from "src/entities/terrain/BaseTerrain";
import { OverlayConversation } from "src/entities/ui/OverlayConversation";
import { setActiveAllies } from "src/redux/gameState/slice";
import { setCutsceneLocked } from "src/redux/status/slice";
import { store } from "src/redux/store";
import { EnableElements, enableUIElements } from "src/redux/ui/slice";

import bgImage from "../../../tiled/backgrounds/cryo/cryo-chambers-bg.png";
import fgImage from "../../../tiled/backgrounds/cryo/cryo-chambers-fg.png";

export const Cryo_0_728: LevelDefinitionAPI = {
  id: "Cryo_0_728",
  backgroundColor: new Color(0),
  ambientMusic: "caveMusic",
  ambientMusicGain: 0.6,
  mapJson: async () =>
    (await import("src/levels/tiled/maps/act-1-cryo/Cryo_0_728.tmj")).default,
  images: {
    "cryo-chambers-bg": bgImage,
    "cryo-chambers-fg": fgImage
  },
  setup: (level) => {
    const setupAll = async () => {
      const scheduler = new Scheduler();
      level.on(EntityLevelEvents.Step, (ms) => scheduler.step(ms));

      const foreground =
        level.getEntityForName<SolidColorForeground>("ForegroundFade");

      const invisibleTerrain = [...level.getEntities().values()].filter(
        (e) =>
          (isTerrain(e) && e.layerName === "Invisible Walls") ||
          e.layerName === "Base Tiles"
      );
      for (const terrain of invisibleTerrain) {
        if (terrain.object3D) terrain.object3D.visible = false;
      }

      const beanBot = level.getEntityForName<BeanBot>("BeanBot");
      const player = getPlayer(level);
      const dock = level.getEntitiesForType(BeanBotDock).at(0);
      const door = level.getEntitiesForType(TechDoor).at(0);

      if (level.state.getValue("introComplete")) {
        if (foreground) level.removeEntity(foreground.id);
        dock?.disable();
        door?.open();
        return;
      }

      if (!beanBot || !player || !dock || !door) return;

      const cameraReq: CameraRequest<"center" | "influence" | "distort"> = {
        id: shortid(),
        priority: CameraRequestPriority.SCRIPTED,
        center: vector3To2(beanBot.position),
        influence: 1,
        distort: 6
      };
      level.cameraDirector.sendRequest(cameraReq);

      // Set BeanBot on its path.
      beanBot.behaviors.motionPathFollowing.snapOntoNearestPathProvider();
      beanBot.behaviors.motionPathFollowing.setTraversalSpeed(1.5);
      beanBot.swapControlMethod("path");

      scheduler.add({
        duration: 15000,
        invokeFunction: (t) => {
          cameraReq.center.x = beanBot.position.x;
          cameraReq.center.y = beanBot.position.y;
          cameraReq.influence = Math.sqrt(1 - t);
          cameraReq.distort = Math.max(0, 1 - t * 20) * 8;
          level.cameraDirector.sendRequest(cameraReq);
          beanBot.behaviors.motionPathFollowing.setTraversalSpeed(1.5 + t * 2);
        },
        invokeFunctionAtComplete: () => {
          level.cameraDirector.removeRequests(cameraReq);
        },
        invokeEventAtComplete: "fadeInDone"
      });

      // This effectively waits for the level to fully transition.
      await typedEmitterPromise(level, EntityLevelEvents.Step);
      store.dispatch(setCutsceneLocked(true));
      foreground?.fadeOut(3000);
      const introSeqTitleOverlay = new IntroSeqTitleOverlay({
        position: new Vector3()
      });
      level.addEntity(introSeqTitleOverlay);
      introSeqTitleOverlay.overlayEvents.on("componentReady", () => {
        introSeqTitleOverlay.overlayEvents.emit("switchToGnarledHelix", 2000);
      });
      scheduler.add({ duration: 5000, invokeEventAtComplete: "ready" });
      await typedEmitterPromise(scheduler, "ready");
      introSeqTitleOverlay.overlayEvents.emit("switchToGameLogo", 5000);
      scheduler.add({ duration: 5000, invokeEventAtComplete: "ready" });
      await typedEmitterPromise(scheduler, "ready");
      introSeqTitleOverlay.overlayEvents.emit("disappear", 3000);
      await typedEmitterPromise(scheduler, "fadeInDone");

      // The camera has settled on the player, who is still a blank white
      // silhouette. Hold the sequence here until they've picked a look —
      // applying the customizer is what clears the silhouette.
      await promptCharacterCustomization();

      // Alright, fade in complete. Set up gameplay.
      beanBot.swapControlMethod("physics");
      const bbMarkerPos =
        level.getEntityForName("BeanBotMarker2")?.position ?? new Vector3();
      beanBot.behaviors.pathFollowing.planAndFollowPathToPosition(
        vector3To2(bbMarkerPos)
      );
      await typedEmitterPromise(
        beanBot.behaviors.pathFollowing.pathEvents,
        PathFollowingBehaviorEvents.PathComplete
      );
      beanBot.faceLeft();

      // Spawn Adana.
      const adanaPos = level.getEntityForName("AdanaMarker1")?.position;
      if (!adanaPos) return;

      const adana = new Adana({
        position: adanaPos
      });

      const convoPart1 = new OverlayConversation({
        position: adanaPos,
        conversation: {
          speakers: ["Player", "Adana"],
          speakerImages: {
            Adana: adanaPng
          },
          // speakerImageClassNames: { Adana: "adana-recolor" },
          start: "awake",
          steps: {
            awake: {
              speaker: "Adana",
              text: () => [
                "Finally.",
                "I've finally found you. You have no idea how many of these old labs there are around, and I had to go silo to silo...",
                "Oh.",
                "I should probably introduce myself.",
                "I am Professor Adana, or what's left of her at least.",
                "Really, this is just a small piece of me, and on a related note, I have a task for you."
              ],
              nextOptions: [
                {
                  text: () => "What?",
                  next: "what"
                },
                {
                  text: () =>
                    "I have no idea who you are, or who I am for that matter?",
                  next: "who"
                }
              ]
            },
            what: {
              speaker: "Adana",
              text: () => [
                "Sorry, I'm sure this is all a bit sudden.",
                "Let me try to make this succinct. The world needs saving but I'm not entirely sure why... This unit has a pretty limited memory bank so I'm pretty sure the original me left something out.",
                "I'm supposed to get you to an uplink site so we both know more about what's going on."
              ],
              nextOptions: [
                {
                  text: () => "Wait, so I'm just supposed to follow you?",
                  next: "followAddress"
                },
                {
                  text: () => "Well, I don't have much else to do down here...",
                  next: "followGreat"
                }
              ]
            },
            who: {
              speaker: "Adana",
              text: () => [
                "Well as I stated, I'm Professor Adana. Well, branch 4-C of a compacted copy of her. I'm piloting this maintainence bot, and just woke you up.",
                "You are a relic from a long forgotten conflict, built to fight a war that never found a satisfying conclusion, as so many seem to...",
                "We're both fragments, really. Either way, if you want to know more you're going to want to find an uplink station and talk to a more informed me."
              ],
              nextOptions: [
                {
                  text: () => "Wait, so I'm just supposed to follow you?",
                  next: "followAddress"
                },
                {
                  text: () => "Well, I don't have much else to do down here...",
                  next: "followGreat"
                }
              ]
            },
            followAddress: {
              speaker: "Adana",
              text: () => [
                "Yes, I need you to follow my directions to an uplink site.",
                "Besides, what else do you have to do down here? Pretty sure you're going to need my help to unlock this door and go anywhere."
              ],
              nextOptions: [
                {
                  text: () => "Fair point.",
                  next: "followGreat"
                }
              ]
            },
            followGreat: {
              speaker: "Adana",
              text: () => [
                "Great!",
                "Let's get going.",
                "I have to use this maintainence bot - I'm calling it 'Bean Bot' to open this door. Give me a second."
              ],
              done: true
            }
          }
        }
      });

      level.addEntity(adana);
      level.addEntity(convoPart1);

      adana.setOpacity(0);
      store.dispatch(setActiveAllies(["BeanBot"]));
      store.dispatch(
        enableUIElements([
          EnableElements.Layout,
          EnableElements.HUD,
          EnableElements.Health,
          EnableElements.Mana,
          EnableElements.HotBar,
          EnableElements.HotBarBottom
        ])
      );
      adana.setOpacity(0.8, 1000);
      await typedEmitterPromise(convoPart1.conversationEvents, "complete");
      adana.setOpacity(0, 500);

      beanBot.behaviors.pathFollowing.planAndFollowPathToPosition(
        vector3To2(dock.position)
      );

      adana.setOpacity(0, 500);
      scheduler.add({
        duration: 500,
        invokeEventAtComplete: "continue"
      });
      await typedEmitterPromise(scheduler, "continue");
      level.removeEntity(convoPart1.id);

      beanBot.swapControlMethod("dock", vector3To2(dock.position));
      await typedEmitterPromise(beanBot.beanBotEvents, BeanBotEvents.Docked);
      scheduler.add({
        duration: 500,
        invokeEventAtComplete: "continue"
      });
      await typedEmitterPromise(scheduler, "continue");

      const convoPart2 = new OverlayConversation({
        position: adanaPos,
        conversation: {
          speakers: ["Player", "Adana"],
          speakerImages: {
            Adana: adanaPng
          },
          start: "docked",
          steps: {
            docked: {
              speaker: "Adana",
              text: () => "Ok, we're good to go.",
              done: true
            }
          }
        }
      });
      level.addEntity(convoPart2);

      adana.setOpacity(0.8);
      await typedEmitterPromise(convoPart2.conversationEvents, "complete");
      adana.setOpacity(0);
      beanBot.swapControlMethod("physicsFollowPlayer");
      door.open();
      dock.disable();

      store.dispatch(setCutsceneLocked(false));
      level.state.setValue("introComplete", true);
      level.ctx?.saveStore?.saveGame();

      convoPart1.conversationEvents.on("complete", () => {
        adana.setOpacity(0, 500);
        scheduler.add({
          duration: 500,
          invokeFunctionAtComplete: () => {
            level.removeEntity(adana.id);
            store.dispatch(setCutsceneLocked(false));
            beanBot.swapControlMethod("physicsFollowPlayer");
            level.state.setValue("introComplete", true);
            level.ctx?.saveStore?.saveGame();
          }
        });
      });
    };
    setupAll();
  }
};

setAssetDependencies(() => ["caveMusic"])(Cryo_0_728);
