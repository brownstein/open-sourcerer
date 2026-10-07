import shortid from "shortid";
import { Color, Vector3 } from "three";

import { CameraRequest, CameraRequestPriority } from "src/api/camera";
import { EntityLevelEvents } from "src/api/entity";
import { typedEmitterPromise } from "src/api/util";
import adanaPng from "src/components/shared-assets/character-images/adanaHologram.png";
import { setAssetDependencies } from "src/engine/entity/decorators";
import { LevelDefinitionAPI } from "src/engine/level/LevelLoaderAPI";
import { Scheduler } from "src/engine/scheduling/Scheduler";
import { getPlayer } from "src/engine/util/levelUtil";
import { vector3To2 } from "src/engine/util/vecTypes";
import { Chest } from "src/entities/environment/Chest";
import { SolidColorForeground } from "src/entities/environment/SolidColorForeground";
import { IntroSeqTitleOverlay } from "src/entities/environment/special/cryo/IntroSeqTitleOverlay";
import { Adana } from "src/entities/npcs/adana/Adana";
import { BeanBot } from "src/entities/npcs/bean-bot/BeanBot";
import { PathFollowingBehaviorEvents } from "src/entities/shared/behaviors/NavPathFollowingBehavior";
import { isTerrain } from "src/entities/terrain/BaseTerrain";
import { OverlayConversation } from "src/entities/ui/OverlayConversation";
import { setActiveAllies } from "src/redux/gameState/slice";
import { setCutsceneLocked } from "src/redux/status/slice";
import { store } from "src/redux/store";
import { EnableElements, enableUIElements } from "src/redux/ui/slice";

import bgImage from "../../../tiled/backgrounds/cryo/cryo-chambers-bg.png";
import fgImage from "../../../tiled/backgrounds/cryo/cryo-chambers-fg.png";
import { act1PrereqsA } from "../../prereqs/allPrereqs";
import Cryo_0_409Screenshot from "./Cryo_0_409.png";

export const Cryo_0_409: LevelDefinitionAPI = {
  id: "Cryo_0_409",
  screenshotImage: Cryo_0_409Screenshot,
  backgroundColor: new Color(0),
  ambientMusic: "caveMusic",
  ambientMusicGain: 0.6,
  mapJson: async () =>
    (await import("src/levels/tiled/maps/act-1-cryo/Cryo_0_409.tmj")).default,
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

      if (level.state.getValue("introComplete")) {
        foreground?.fadeOut(0);
        return;
      }

      const beanBot = level.getEntityForName<BeanBot>("BeanBot");
      const player = getPlayer(level);
      const chest = level.getEntitiesForType(Chest).at(0);

      if (!beanBot || !player) return;

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

      let collapsing = false;

      // Spawn Adana.
      const adanaPos = level.getEntityForName("AdanaMarker1")?.position;
      if (!adanaPos) return;
      const adana = new Adana({
        position: adanaPos
      });
      const convo = new OverlayConversation({
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
                "Good, you're awake!",
                "Hurry up and follow me, there isn't much time.",
                "This lab is going to collapse soon!"
              ],
              nextOptions: [
                {
                  text: () => "What?",
                  next: "what"
                },
                {
                  text: () => "OK.",
                  next: "following"
                }
              ]
            },
            what: {
              speaker: "Player",
              text: () => ["What?"],
              next: "whatAdana"
            },
            whatAdana: {
              speaker: "Adana",
              text: () => [
                "This cryolab... it's collapsing. Follow bean bot!",
                "Make sure to grab the items in that chest to the right."
              ],
              done: true,
              onStart: () => {
                collapsing = true;
              }
            },
            following: {
              speaker: "Adana",
              text: () => [
                "Make sure grab the items in that chest to the right!"
              ],
              done: true,
              onStart: () => {
                collapsing = true;
              }
            }
          }
        }
      });

      level.addEntity(adana);
      level.addEntity(convo);

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
      adana.setOpacity(0.5, 1000);

      convo.conversationEvents.on("complete", () => {
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

      const shakeReq: CameraRequest<"shake"> = {
        id: shortid(),
        priority: CameraRequestPriority.SCRIPTED,
        subPriority: 1,
        shake: 0
      };
      level.cameraDirector.sendRequest(shakeReq);
      scheduler.add({
        duration: 1000,
        recurring: true,
        invokeFunctionAtComplete: () => {
          if (collapsing) {
            shakeReq.shake = Math.random() * 1.5;
            level.cameraDirector.sendRequest(shakeReq);
          }
        }
      });

      if (!chest) return;
      chest.behaviors.inventory.items = act1PrereqsA;
    };
    setupAll();
  }
};

setAssetDependencies(() => ["caveMusic"])(Cryo_0_409);
