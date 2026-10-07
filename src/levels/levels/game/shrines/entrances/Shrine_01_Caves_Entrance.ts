import { Vector2, Vector3 } from "three";

import { CameraRequestPriority } from "src/api/camera";
import { EntityLevelEvents, LevelAPI } from "src/api/entity";
import { typedEmitterPromise } from "src/api/util";
import { LevelDefinitionAPI } from "src/engine/level/LevelLoaderAPI";
import { Scheduler } from "src/engine/scheduling/Scheduler";
import { getPlayer } from "src/engine/util/levelUtil";
import { vector3To2 } from "src/engine/util/vecTypes";
import { AreaTrigger } from "src/entities/environment/AreaTrigger";
import { Marker } from "src/entities/environment/Marker";
import { ShrineBackground } from "src/entities/environment/ShrineBackground";
import { ShrineBridge } from "src/entities/environment/ShrineBridge";
import { ShrineDarkness } from "src/entities/environment/ShrineDarkness";
import { ShrineGodRay } from "src/entities/environment/ShrineGodRay";
import { Switch } from "src/entities/environment/Switch";
import {
  ShrineHelix,
  ShrineHelixEvents
} from "src/entities/environment/shrines/ShrineHelix";
import { Adana } from "src/entities/npcs/adana/Adana";
import { BeanBot } from "src/entities/npcs/bean-bot/BeanBot";
import { Player } from "src/entities/player/Player";
import { isPlayerAPI } from "src/entities/player/PlayerAPI";
import { AreaSensorEvents } from "src/entities/shared/behaviors/AreaSensorBehavior";
import { PathFollowingBehaviorEvents } from "src/entities/shared/behaviors/NavPathFollowingBehavior";
import { BaseTerrain } from "src/entities/terrain/BaseTerrain";
import { OverlayConversation } from "src/entities/ui/OverlayConversation";
import bigShrine0BackPlatforms from "src/levels/tiled/backgrounds/big-shrine/big-shrine-0-back-platforms.png";
import bigShrine0FrontPlatforms from "src/levels/tiled/backgrounds/big-shrine/big-shrine-0-front-platforms.png";
import { gotoLevel } from "src/redux/gameState/slice";
import { selectCutScenesCompleted } from "src/redux/progression/selectors";
import { completeCutScene } from "src/redux/progression/slice";
import { store } from "src/redux/store";

import { Shrine01HelloWorldName } from "../zone-0-caves/ShrinesTypes";
import Shrine01CaveEntranceScreenshot from "./Shrine01CaveEntrance.png";

const SEQUENCE_DONE_PLAYER_POSITION_KEY = "SEQUENCE_DONE_PLAYER_POSITION_KEY";

export const Shrine01CaveEntrance: LevelDefinitionAPI = {
  id: "Shrine01CaveEntrance",
  screenshotImage: Shrine01CaveEntranceScreenshot,
  mapJson: async () =>
    (
      await import(
        "src/levels/tiled/maps/shrines/act-1/Shrine01CaveEntrance.tmj"
      )
    ).default,
  images: {
    "big-shrine-0-back-platforms": bigShrine0BackPlatforms,
    "big-shrine-0-front-platforms": bigShrine0FrontPlatforms
  },
  setup: (level) => {
    makeBoundariesInvisible(level);

    const adanaCutsceneId = `${Shrine01CaveEntrance.id}-adana`;
    const mainCutsceneId = `${Shrine01CaveEntrance.id}-main`;

    const shrineEntities = {
      background:
        level.getEntityForName<ShrineBackground>("Shrine Background")!,
      leftBridge: level.getEntityForName<ShrineBridge>("Left Shrine Bridge")!,
      rightBridge: level.getEntityForName<ShrineBridge>("Right Shrine Bridge")!,
      helix: level.getEntityForName<ShrineHelix>("Shrine Helix")!,
      darkness: level.getEntityForName<ShrineDarkness>("Shrine Darkness")!,
      godRay: level.getEntityForName<ShrineGodRay>("Shrine God Ray")!,
      leftBridgeTrigger: level.getEntityForName<AreaTrigger>(
        "Left Bridge Trigger"
      )!,
      rightBridgeTrigger: level.getEntityForName<AreaTrigger>(
        "Right Bridge Trigger"
      )!,
      sequenceSwitch: level.getEntityForName<Switch>("Sequence Switch")!,
      centerMarker: level.getEntityForName<Marker>("Center Marker")!,
      topMarker: level.getEntityForName<Marker>("Top Marker")!
    };

    for (const [entityName, shrineEntity] of Object.entries(shrineEntities)) {
      if (!shrineEntity) {
        console.error(
          entityName +
            " shrine entity is not defined in the Tiled map!! Fix now!!"
        );
        return;
      }
    }

    /*
     * SET UP BRIDGE TRIGGERS
     */

    shrineEntities.leftBridgeTrigger.behaviors.sensor.events.on(
      AreaSensorEvents.EntityContact,
      (contactedEntity) => {
        if (!isPlayerAPI(contactedEntity)) return;
        shrineEntities.leftBridge.startAnimation();
      }
    );

    shrineEntities.leftBridgeTrigger.behaviors.sensor.events.on(
      AreaSensorEvents.EntityContactEnd,
      (contactedEntity) => {
        if (!isPlayerAPI(contactedEntity)) return;
        shrineEntities.leftBridge.stopAnimation();
      }
    );

    shrineEntities.rightBridgeTrigger.behaviors.sensor.events.on(
      AreaSensorEvents.EntityContact,
      (contactedEntity) => {
        if (!isPlayerAPI(contactedEntity)) return;
        shrineEntities.rightBridge.startAnimation();
      }
    );

    shrineEntities.rightBridgeTrigger.behaviors.sensor.events.on(
      AreaSensorEvents.EntityContactEnd,
      (contactedEntity) => {
        if (!isPlayerAPI(contactedEntity)) return;
        shrineEntities.rightBridge.stopAnimation();
      }
    );

    shrineEntities.sequenceSwitch.object3D.visible = false;
    const sequenceAlreadyCompleted = selectCutScenesCompleted(store.getState())[
      mainCutsceneId
    ];
    if (sequenceAlreadyCompleted) {
      shrineEntities.sequenceSwitch.disableInteraction();
      shrineEntities.helix.instantExtend();
      shrineEntities.background.instantComplete();
      shrineEntities.darkness.instantComplete();
      shrineEntities.godRay.startAnimation2(3000);
      // TODO: return from shrine position restore.
      // See BigShrine_0A
      return;
    }

    // Scheduler is shared between cutscenes.
    const scheduler = new Scheduler();
    level.on(EntityLevelEvents.Step, (deltaMs) => scheduler.step(deltaMs));

    const doMainCutscene = async () => {
      const player = getPlayer(level);
      if (!player) {
        console.error("The player can not be found for some reason?? FIX");
        return;
      }
      shrineEntities.sequenceSwitch.disableInteraction();

      // SEQUENCE START
      const { cameraDirector } = level;

      player.setMovementEnabled(false);

      await cameraDirector.pushScriptedRequest(
        {
          center: vector3To2(shrineEntities.centerMarker.position),
          size: new Vector2(8, 8),
          shake: 1.5,
          letterboxingPercentage: 1.0
        },
        5000
      );

      await scheduler.asyncTimeout(1500);
      shrineEntities.helix.extend();
      await scheduler.asyncTimeout(1500);

      cameraDirector.pushScriptedRequest(
        {
          size: new Vector2(16, 16)
        },
        1000
      );

      cameraDirector.pushScriptedRequest(
        {
          center: vector3To2(shrineEntities.topMarker.position)
        },
        3500,
        0.8
      );

      await typedEmitterPromise(
        shrineEntities.helix.helixEvents,
        ShrineHelixEvents.VFXPlayed
      );

      cameraDirector.pushScriptedRequest({ shake: 5, distort: 0.6 }, 0);
      cameraDirector.resetScriptedProperties(
        1000,
        undefined,
        "shake",
        "distort"
      );

      await typedEmitterPromise(
        shrineEntities.helix.helixEvents,
        ShrineHelixEvents.FullyExtended
      );

      await scheduler.asyncTimeout(500);

      await cameraDirector.pushScriptedRequest(
        {
          size: new Vector2(20, 20),
          letterboxingPercentage: 0
        },
        4000
      );

      shrineEntities.background.startAnimation(3000);
      shrineEntities.darkness.startAnimation(3000);
      shrineEntities.godRay.startAnimation2(3000);

      await cameraDirector.pushScriptedRequest(
        { center: vector3To2(shrineEntities.centerMarker.position) },
        6000
      );

      await cameraDirector.clearScriptedRequests(2500);

      shrineEntities.godRay.startAnimation(3000);

      await scheduler.asyncTimeout(1500);

      const cameraRequestId = crypto.randomUUID();
      scheduler.add({
        duration: 5000,
        invokeFunction: (t) => {
          if (!player) return;
          cameraDirector.sendLookAtEntityRequest(player, {
            offset: new Vector2(0, t * Math.sin(t * 200) * 0.5)
          });
          cameraDirector.sendRequest({
            id: cameraRequestId,
            priority: CameraRequestPriority.HIGHEST,
            distort: t * 8 * Math.sin(t * 40),
            compositeOpacity: 1 - t
          });
        },
        invokeEventAtComplete: "shakeDone"
      });
      await typedEmitterPromise(scheduler, "shakeDone");

      // TODO(Robert): make this persist the default player-based camera behavior's
      // requests, as right now it totally borks things.
      // TODO(Alvin).
      // cameraDirector.removeAllRequests();
      player.setMovementEnabled(true);

      store.dispatch(completeCutScene(mainCutsceneId));
      level.state.setValue(
        SEQUENCE_DONE_PLAYER_POSITION_KEY,
        player.position.clone()
      );

      store.dispatch(
        gotoLevel({
          levelId: Shrine01HelloWorldName
        })
      );
    };

    // Wire up the cutscene.
    shrineEntities.sequenceSwitch.switchEvents.once(
      "stateUpdated",
      doMainCutscene
    );

    const doAdanaCutscene = async () => {
      const player = level.getEntitiesForType(Player).at(0);
      let beanBot = level.getEntitiesForType(BeanBot).at(0);
      // This is just for testing.
      if (!beanBot) {
        beanBot = new BeanBot({
          position: player?.position.clone() ?? new Vector3()
        });
        level.addEntity(beanBot);
      }
      if (!player || !beanBot) return;

      // Begin the cutscene.
      player.setMovementEnabled(false);

      // Move BeanBot to the desired position to project Adana.
      beanBot.swapControlMethod("physics");
      beanBot.behaviors.pathFollowing.planAndFollowPathToPosition(
        vector3To2(player.position).add(new Vector2(4, 0))
      );
      await typedEmitterPromise(
        beanBot.behaviors.pathFollowing.pathEvents,
        PathFollowingBehaviorEvents.PathComplete
      );
      beanBot.faceLeft();

      const adana = new Adana({
        position: player.position.clone().lerp(beanBot.position, 0.5),
        opacity: 0,
        enableConverse: false
      });
      adana.position.y = player.position.y + 0.25;
      adana.position.z -= 0.25;
      level.addEntity(adana);
      adana.setOpacity(1, 1000);

      scheduler.add({
        id: "awaitAdana",
        duration: 1500,
        invokeEventAtComplete: "adanaReady"
      });
      await typedEmitterPromise(scheduler, "adanaReady");

      // Spawn a small conversation.
      const adanaConvo = new OverlayConversation({
        position: player.position,
        conversation: {
          start: "start",
          steps: {
            start: {
              speaker: "Adana",
              text: () => [
                "Great, you've reached my shrine! There's a small piece of me stored here. Activate the central beacon to enter the spirit realm and retrieve it, along with ancient programming knowledge!"
              ],
              done: true
            }
          }
        }
      });
      level.addEntity(adanaConvo);
      await typedEmitterPromise(adanaConvo.conversationEvents, "complete");

      // Clean up.
      adana.setOpacity(0, 2000);
      beanBot.swapControlMethod("physicsFollowPlayer");
      player.setMovementEnabled(true);
      level.state.setValue(adanaCutsceneId, true);

      // Save game for good measure.
      level.ctx?.saveStore?.saveGame();
    };

    // Wire up Adana interaction.
    // Note that we're using persistant level state here.
    const adanaSequenceCompleted = level.state.getValue(adanaCutsceneId);
    if (!adanaSequenceCompleted) {
      scheduler.add({
        startIn: 1000,
        invokeFunctionAtComplete: doAdanaCutscene
      });
    }
  }
};

function makeBoundariesInvisible(level: LevelAPI) {
  level
    .getEntitiesForType(BaseTerrain)
    .filter((tile) => tile.layerName === "Boundaries")
    .forEach((boundary) => (boundary.object3D.visible = false));
}
