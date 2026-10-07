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
import { isPlayerAPI } from "src/entities/player/PlayerAPI";
import { AreaSensorEvents } from "src/entities/shared/behaviors/AreaSensorBehavior";
import { BaseTerrain } from "src/entities/terrain/BaseTerrain";
import bigShrine0BackPlatforms from "src/levels/tiled/backgrounds/big-shrine/big-shrine-0-back-platforms.png";
import bigShrine0FrontPlatforms from "src/levels/tiled/backgrounds/big-shrine/big-shrine-0-front-platforms.png";
import { selectLevelTransitionData } from "src/redux/gameState/selectors";
import { gotoLevel } from "src/redux/gameState/slice";
import { selectCutScenesCompleted } from "src/redux/progression/selectors";
import { completeCutScene } from "src/redux/progression/slice";
import { store } from "src/redux/store";

import BigShrine_0AScreenshot from "./BigShrine_0A.png";
import { SparkNavShrine } from "./act-2-zone-2-serverfarm/Spark-Nav-Shrine";

const SEQUENCE_DONE_PLAYER_POSITION_KEY = "SEQUENCE_DONE_PLAYER_POSITION_KEY";

export const BigShrine_0: LevelDefinitionAPI = {
  id: "BigShrine_0A",
  screenshotImage: BigShrine_0AScreenshot,
  mapJson: async () =>
    (await import("src/levels/tiled/maps/shrines/big-shrine-0.tmj")).default,
  images: {
    "big-shrine-0-back-platforms": bigShrine0BackPlatforms,
    "big-shrine-0-front-platforms": bigShrine0FrontPlatforms
  },
  setup: async (level: LevelAPI) => {
    makeBoundariesInvisible(level);

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

    /*
     * SET UP THE ENTIRE SEQUENCE
     */

    const player = getPlayer(level);
    if (!player) {
      console.error("The player can not be found for some reason?? FIX");
      return;
    }

    shrineEntities.sequenceSwitch.object3D.visible = false;

    const sequenceAlreadyCompleted = selectCutScenesCompleted(store.getState())[
      BigShrine_0.id
    ];
    if (sequenceAlreadyCompleted) {
      shrineEntities.sequenceSwitch.disableInteraction();
      shrineEntities.helix.instantExtend();

      shrineEntities.background.instantComplete();
      shrineEntities.darkness.instantComplete();
      shrineEntities.godRay.startAnimation2(3000);

      const cameFromSparkNavShrine =
        selectLevelTransitionData(store.getState()).previousLevelId ===
        SparkNavShrine.id;
      if (!cameFromSparkNavShrine) return;

      const playerPositionForSequence = level.state.getValue<
        Vector3 | undefined
      >(SEQUENCE_DONE_PLAYER_POSITION_KEY);
      if (!playerPositionForSequence) {
        player.teleport?.(shrineEntities.centerMarker.position);
        return;
      }

      player.teleport?.(playerPositionForSequence);

      return;
    }

    await typedEmitterPromise(
      shrineEntities.sequenceSwitch.switchEvents,
      "stateUpdated"
    );
    shrineEntities.sequenceSwitch.disableInteraction();

    // SEQUENCE START
    const cameraDirector = level.cameraDirector;
    const scheduler = new Scheduler();
    level.on(EntityLevelEvents.Step, (deltaMs) => scheduler.step(deltaMs));

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
    cameraDirector.resetScriptedProperties(1000, undefined, "shake", "distort");

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

    cameraDirector.removeAllRequests();
    player.setMovementEnabled(true);

    store.dispatch(completeCutScene(BigShrine_0.id));
    level.state.setValue(
      SEQUENCE_DONE_PLAYER_POSITION_KEY,
      player.position.clone()
    );

    store.dispatch(
      gotoLevel({
        levelId: SparkNavShrine.id
      })
    );
  }
};

function makeBoundariesInvisible(level: LevelAPI) {
  level
    .getEntitiesForType(BaseTerrain)
    .filter((tile) => tile.layerName === "Boundaries")
    .forEach((boundary) => (boundary.object3D.visible = false));
}
