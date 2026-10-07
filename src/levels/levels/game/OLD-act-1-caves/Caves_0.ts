import { Color, Vector2, Vector3 } from "three";
import { clamp } from "three/src/math/MathUtils.js";

import {
  CameraDirectorAPI,
  CameraRequest,
  CameraRequestPriority
} from "src/api/camera";
import { ControlEvents } from "src/api/controls";
import { Conversation } from "src/api/conversation";
import { EntityLevelEvents, LevelAPI } from "src/api/entity";
import { typedEmitterPromise } from "src/api/util";
import { LevelDefinitionAPI } from "src/engine/level/LevelLoaderAPI";
import { Scheduler } from "src/engine/scheduling/Scheduler";
import { getPlayer } from "src/engine/util/levelUtil";
import { vector3To2 } from "src/engine/util/vecTypes";
import { Gnull } from "src/entities/enemies/critters/Gnull";
import { AreaTrigger } from "src/entities/environment/AreaTrigger";
import { BrokenDoor } from "src/entities/environment/BrokenDoor";
import { CavesEndGate } from "src/entities/environment/CavesEndGate";
import { Marker } from "src/entities/environment/Marker";
import { MotionPath } from "src/entities/environment/MotionPath";
import { ParallaxImage } from "src/entities/environment/ParallaxImage";
import { Switch } from "src/entities/environment/Switch";
import {
  FallingTerrain,
  FallingTerrainEvents
} from "src/entities/environment/hazards/FallingTerrain";
import { BeanBot } from "src/entities/npcs/bean-bot/BeanBot";
import { PlayerAPI, isPlayerAPI } from "src/entities/player/PlayerAPI";
import { AreaSensorEvents } from "src/entities/shared/behaviors/AreaSensorBehavior";
import { MotionPathFollowingEvents } from "src/entities/shared/behaviors/MotionPath";
import { PathFollowingBehaviorEvents } from "src/entities/shared/behaviors/NavPathFollowingBehavior";
import { BaseTerrain } from "src/entities/terrain/BaseTerrain";
import { DestructableTerrain } from "src/entities/terrain/DestructableTerrain";
import { OverlayConversation } from "src/entities/ui/OverlayConversation";
import { selectActiveAllies } from "src/redux/gameState/selectors";
import { setActiveAllies } from "src/redux/gameState/slice";
import { addItems } from "src/redux/shared/actions";
import { store } from "src/redux/store";
import { EnableElements, enableUIElements } from "src/redux/ui/slice";
import { Background, TransitionalBackground } from "src/util/Background";

import buildingBottomSupports from "../../../tiled/backgrounds/caves/building-bottom-supports.png";
import buildingExterior from "../../../tiled/backgrounds/caves/building-exterior.png";
import buildingSupports from "../../../tiled/backgrounds/caves/building-supports.png";
import caveBg0 from "../../../tiled/backgrounds/caves/cave-bg-0.png";
import caveBg1 from "../../../tiled/backgrounds/caves/cave-bg-1.png";
import caveBg2 from "../../../tiled/backgrounds/caves/cave-bg-2.png";
import caveBg3a from "../../../tiled/backgrounds/caves/cave-bg-3a.png";
import crystalcaveBg0 from "../../../tiled/backgrounds/caves/crystalcave-bg-0.png";
import crystalcaveBg1 from "../../../tiled/backgrounds/caves/crystalcave-bg-1.png";
import crystalcaveBg2 from "../../../tiled/backgrounds/caves/crystalcave-bg-2.png";
import crystalcaveBg3 from "../../../tiled/backgrounds/caves/crystalcave-bg-3.png";
import giantBottle from "../../../tiled/backgrounds/caves/giant-bottle.png";
import rightDoorBg from "../../../tiled/backgrounds/caves/right-door-bg.png";
import rightDoorStonesBg from "../../../tiled/backgrounds/caves/right-door-stones-bg.png";
import startingBg from "../../../tiled/backgrounds/caves/starting-bg.png";

let masterConversation: OverlayConversation;

const DEV_MODE = true;

export const OLD_Caves_0: LevelDefinitionAPI = {
  id: "OLD_Caves_0",
  mapJson: async () =>
    (await import("../../../tiled/maps/OLD-act-1-caves/caves-0.tmj")).default,
  backgroundColor: new Color("#A7E0E2"),
  ambientMusic: "caveMusic",
  images: {
    "starting-bg": startingBg,
    "cave-bg-0": caveBg0,
    "cave-bg-1": caveBg1,
    "cave-bg-2": caveBg2,
    "cave-bg-3a": caveBg3a,
    "crystalcave-bg-0": crystalcaveBg0,
    "crystalcave-bg-1": crystalcaveBg1,
    "crystalcave-bg-2": crystalcaveBg2,
    "crystalcave-bg-3": crystalcaveBg3,
    "building-exterior": buildingExterior,
    "building-bottom-supports": buildingBottomSupports,
    "building-supports": buildingSupports,
    "giant-bottle": giantBottle,
    "right-door-bg": rightDoorBg,
    "right-door-stones-bg": rightDoorStonesBg
  },
  setup: (level) => {
    masterConversation = new OverlayConversation({ position: new Vector3() });
    level.addEntity(masterConversation);

    if (DEV_MODE) {
      store.dispatch(
        enableUIElements([
          EnableElements.CodeEditor,
          EnableElements.HUD,
          EnableElements.Health,
          EnableElements.Mana,
          EnableElements.HotBar,
          EnableElements.HotBarBottom,
          EnableElements.Layout
        ])
      );

      store.dispatch(
        addItems({
          item: { type: "Sword" },
          hotkey: true
        })
      );
    }

    ensureBeanBotIsAvailable(level);
    makeBoundariesInvisible(level);
    setupAdanaDialogTriggers(level);
    setupBackgroundTransitions(level);
    setupLoopingMinecarts(level);
    setupBrokenDoorSequence(level);
    setupEndingGate(level);
    setupEndingGateSequence(level);
  }
};

function ensureBeanBotIsAvailable(level: LevelAPI) {
  const activeAllies = selectActiveAllies(store.getState());
  const isBeanBotAnAlly = activeAllies.includes(BeanBot.type);

  if (isBeanBotAnAlly) return;

  store.dispatch(setActiveAllies([...activeAllies, BeanBot.type]));

  if (!DEV_MODE) return;

  const beanBot = level.getEntitiesForType(BeanBot).at(0);
  if (beanBot) return;

  const player = getPlayer(level)!;
  const newBeanBot = new BeanBot({ position: player.position.clone() });
  newBeanBot.swapControlMethod("physicsFollowPlayer");
  level.addEntity(newBeanBot);

  newBeanBot.setOpacity(0, 0);
  newBeanBot.setOpacity(1, 500);
}

function makeBoundariesInvisible(level: LevelAPI) {
  level
    .getEntitiesForType(BaseTerrain)
    .filter((tile) => tile.layerName === "Boundaries")
    .forEach((boundary) => (boundary.object3D.visible = false));
}

async function showConversationAndLockPlayerMovement(
  conversation: Conversation,
  player: PlayerAPI,
  cameraDirector: CameraDirectorAPI
): Promise<void> {
  player.setMovementEnabled(false);

  await cameraDirector.waitForSettledCamera();

  await masterConversation.showConversation(conversation);

  player.setMovementEnabled(true);

  return;
}

function setupAdanaDialogTriggers(level: LevelAPI) {
  type ConversationTrigger = "01" | "02" | "03" | "04" | "05" | "06" | "07";

  const player = getPlayer(level)!;
  const camera = level.cameraDirector;

  const dialogs: Record<
    ConversationTrigger,
    {
      trigger: AreaTrigger;
      dialogContent: Conversation<"Adana", string>;
    }
  > = {
    "01": {
      trigger: level.getEntityForName<AreaTrigger>("Adana Text 01")!,
      dialogContent: {
        start: "thisPlaceIsDecayed",
        steps: {
          thisPlaceIsDecayed: {
            speaker: "Adana",
            text: () =>
              "This infrastructure appears to be in an advanced state of decay, likely failing to meet safety tolerances for centuries.",
            next: "watchOutPlayer"
          },
          watchOutPlayer: {
            speaker: "Adana",
            text: () =>
              "Exercise caution, [Player Name]; the biological consequences of a fall from this altitude would be... final.",
            done: true
          }
        }
      }
    },
    "02": {
      trigger: level.getEntityForName<AreaTrigger>("Adana Text 02")!,
      dialogContent: {
        start: "observe",
        steps: {
          observe: {
            speaker: "Adana",
            onStart: () => {
              const firstEncounteredGnull =
                level.getEntityForName<Gnull>("First Gnull")!;
              const firstGnullPosition = vector3To2(
                firstEncounteredGnull.position
              );

              camera.pushScriptedRequest(
                {
                  center: firstGnullPosition
                },
                2500
              );
            },
            text: () => [
              "Observe the specimen ahead.",
              "That is a Canis erectus—commonly known as a Gnull."
            ],
            next: "heBeFast"
          },
          heBeFast: {
            speaker: "Adana",
            text: () =>
              "While its cognitive capacity is remarkably low, its metabolic rate grants it incredible subterranean speed.",
            next: "stayAlert"
          },
          stayAlert: {
            speaker: "Adana",
            onStart: () => {
              camera.clearScriptedRequests(2500);
            },
            text: () =>
              "Stay alert; the toxins coating its claws and dentition are highly potent.",
            done: true
          }
        }
      }
    },
    "03": {
      trigger: level.getEntityForName<AreaTrigger>("Adana Text 03")!,
      dialogContent: {
        start: "thereIsACavity",
        steps: {
          thereIsACavity: {
            speaker: "Adana",
            text: () => [
              "I’ve identified a structural cavity previously obscured from our line of sight.",
              "Climb the ladder and initiate an audit of the chamber’s contents.",
              "We require more data."
            ],
            done: true
          }
        }
      }
    },
    "04": {
      trigger: level.getEntityForName<AreaTrigger>("Adana Text 04")!,
      dialogContent: {
        start: "attention",
        steps: {
          attention: {
            speaker: "Adana",
            onStart: () => {
              const cameraPanMarker =
                level.getEntityForName<Marker>("Dialog Marker 04")!;
              const markerPosition = vector3To2(cameraPanMarker.position);

              camera.pushScriptedRequest(
                {
                  center: markerPosition
                },
                2500
              );
            },
            text: () => "Direct your attention to those coordinates!",
            next: "thereBeEnemies"
          },
          thereBeEnemies: {
            speaker: "Adana",
            text: () =>
              "I’ve identified a cluster of three Canis erectus specimens—matching the biological signatures of the Gnull we engaged previously.",
            done: true
          }
        },
        onComplete: () => {
          camera.clearScriptedRequests(2500);
        }
      }
    },
    "05": {
      trigger: level.getEntityForName<AreaTrigger>("Adana Text 05")!,
      dialogContent: {
        start: "thereBeDrills",
        steps: {
          thereBeDrills: {
            speaker: "Adana",
            onStart: () => {
              const cameraPanMarker =
                level.getEntityForName<Marker>("Dialog Marker 05")!;
              const markerPosition = vector3To2(cameraPanMarker.position);

              camera.pushScriptedRequest(
                {
                  center: markerPosition
                },
                2500
              );
            },
            text: () => "Multiple Drill drones detected.",
            next: "drillDescription"
          },
          drillDescription: {
            speaker: "Adana",
            onStart: () => {
              const cameraPanMarker =
                level.getEntityForName<Marker>("Dialog Marker 05-1")!;
              const markerPosition = vector3To2(cameraPanMarker.position);

              camera.pushScriptedRequest(
                {
                  center: markerPosition
                },
                10000
              );
            },
            text: () => [
              "Note that these units function as the offensive organs for a central Spider-bot controller.",
              "Provided the 'Spider' does not establish a visual link, these drones will remain passive."
            ],
            next: "thisIsOptional"
          },
          thisIsOptional: {
            speaker: "Adana",
            onStart: () => {
              camera.clearScriptedRequests(2500);
            },
            text: () => [
              "Consider this a non-mandatory engagement.",
              "Choose your path accordingly."
            ],
            done: true
          }
        }
      }
    },
    "06": {
      trigger: level.getEntityForName<AreaTrigger>("Adana Text 06")!,
      dialogContent: {
        start: "somethingIsWrong",
        steps: {
          somethingIsWrong: {
            speaker: "Adana",
            text: () => [
              "Status: Localized geological data unavailable.",
              "Environmental variables are currently unpredictable.",
              "Advancing further is a high-risk maneuver."
            ],
            done: true
          }
        }
      }
    },
    "07": {
      trigger: level.getEntityForName<AreaTrigger>("Adana Text 07")!,
      dialogContent: {
        start: "inconsistentReadings",
        steps: {
          inconsistentReadings: {
            speaker: "Adana",
            text: () => [
              "The life-signature readings in this chamber are... inconsistent.",
              "I'm unable to establish a definitive biological classification.",
              "Watch your step; the data is inconclusive."
            ],
            done: true
          }
        }
      }
    }
  };

  for (const dialog of Object.values(dialogs)) {
    dialog.trigger.behaviors.sensor.events.on(
      AreaSensorEvents.EntityContact,
      function showDialog(contactedEntity) {
        if (!isPlayerAPI(contactedEntity)) return;

        showConversationAndLockPlayerMovement(
          dialog.dialogContent,
          player,
          level.cameraDirector
        );

        dialog.trigger.behaviors.sensor.events.off(
          AreaSensorEvents.EntityContact,
          showDialog
        );
      }
    );
  }
}

function setupBackgroundTransitions(level: LevelAPI) {
  const caveBgTransitionTrigger = level.getEntityForName<AreaTrigger>(
    "Cave Background Transition"
  )!;
  const crystalcaveBgTransitionTrigger = level.getEntityForName<AreaTrigger>(
    "Crystalcave Background Transition"
  )!;
  const miningBuildingOutsideTriggers = level
    .getEntitiesForType(AreaTrigger)
    .filter((trigger) => trigger.name?.startsWith("Mining Building Outside"));
  const miningBuildingInsideTriggers = level
    .getEntitiesForType(AreaTrigger)
    .filter((trigger) => trigger.name?.startsWith("Mining Building Inside"));

  const caveBgImages = level
    .getEntitiesForType(ParallaxImage)
    .filter((image) => image.layerDef.name.startsWith("cave-bg"));
  const crystalcaveBgImages = level
    .getEntitiesForType(ParallaxImage)
    .filter((image) => image.layerDef.name.startsWith("crystalcave-bg"));
  const miningBuildingExteriorImages = level
    .getEntitiesForType(ParallaxImage)
    .filter((image) => image.layerDef.name.startsWith("building"));

  const caveBackground = new TransitionalBackground(
    new Background(caveBgImages),
    [caveBgTransitionTrigger],
    [crystalcaveBgTransitionTrigger]
  );

  const crystalcaveBackground = new TransitionalBackground(
    new Background(crystalcaveBgImages, 0),
    [crystalcaveBgTransitionTrigger],
    [caveBgTransitionTrigger]
  );

  const miningBuildingExteriorBackground = new TransitionalBackground(
    new Background(miningBuildingExteriorImages),
    miningBuildingOutsideTriggers,
    miningBuildingInsideTriggers,
    250
  );

  level.on(EntityLevelEvents.Step, (deltaMs) => {
    caveBackground.step(deltaMs);
    crystalcaveBackground.step(deltaMs);
    miningBuildingExteriorBackground.step(deltaMs);
  });
}

function setupLoopingMinecarts(level: LevelAPI) {
  const teleportFromTrigger0 = level.getEntityForName<AreaTrigger>(
    "Player Teleport From 0"
  )!;
  const teleportToMarker0 = level.getEntityForName<Marker>(
    "Player Teleport To 0"
  )!;
  const teleportFromTrigger1 = level.getEntityForName<AreaTrigger>(
    "Player Teleport From 1"
  )!;
  const teleportToMarker1 = level.getEntityForName<Marker>(
    "Player Teleport To 1"
  )!;

  const teleportTo0Position = vector3To2(teleportToMarker0.position);
  const teleportTo1Position = vector3To2(teleportToMarker1.position);

  teleportFromTrigger0.behaviors.sensor.events.on(
    AreaSensorEvents.EntityContact,
    (entity) =>
      entity.teleport?.(
        new Vector3(
          teleportTo0Position.x,
          teleportTo0Position.y,
          entity.position.z
        )
      )
  );

  teleportFromTrigger1.behaviors.sensor.events.on(
    AreaSensorEvents.EntityContact,
    (entity) =>
      entity.teleport?.(
        new Vector3(
          teleportTo1Position.x,
          teleportTo1Position.y,
          entity.position.z
        )
      )
  );
}

async function setupBrokenDoorSequence(level: LevelAPI) {
  const {
    brokenDoorSwitch,
    brokenDoor,
    fallingStalactites,
    destructableTerrain
  } = getBrokenDoorSequenceEntities(level);
  const scheduler = new Scheduler();
  level.on(EntityLevelEvents.Step, (deltaMs) => scheduler.step(deltaMs));

  // switch has been interacted with and switched on
  await typedEmitterPromise(brokenDoorSwitch.switchEvents, "stateUpdated");
  brokenDoorSwitch.disableInteraction();

  const player = getPlayer(level)!;
  player.setMovementEnabled(false);

  // switch on animation has completed
  await typedEmitterPromise(
    brokenDoorSwitch.switchEvents,
    "stateUpdateCompleted"
  );

  brokenDoor.runOpeningSequence();

  // broken door animation has been completed
  await typedEmitterPromise(brokenDoor.doorEvents, "openingSequenceDone");
  brokenDoorSwitch.setActive(false);

  const camera = level.cameraDirector;
  await performBrokenDoorInitialCameraSequence(camera);

  // NOTE: timing of the falling stalactites is handled by their vertical position in Tiled...
  //      doing programattic timing seems tedious, hopefully this is robust enough
  fallingStalactites.playerTargetingStalactities.forEach((stalactite) =>
    stalactite.fall()
  );

  await performPlayerDodgingSequence(
    level,
    player,
    fallingStalactites.playerTargetingStalactities
  );

  await scheduler.asyncTimeout(1000);

  // delay the falling stalactites to occur after camera panning starts
  scheduler.add({
    duration: 1000,
    invokeFunctionAtComplete: () => {
      fallingStalactites.normalStalactites.forEach((stalactite) =>
        stalactite.fall()
      );
      fallingStalactites.terrainTargetingStalactite.fall();

      fallingStalactites.terrainTargetingStalactite.events.once(
        FallingTerrainEvents.ImpactedTerrain,
        () => {
          destructableTerrain.forEach((terrain) => terrain.crumble());
        }
      );
    }
  });

  const panToDestructibleTerrainPosition = new Vector2(
    fallingStalactites.terrainTargetingStalactite.position.x,
    player.position.y
  );

  await camera.pushScriptedRequest(
    {
      center: panToDestructibleTerrainPosition
    },
    3000
  );

  await scheduler.asyncTimeout(2000);

  await performBrokenDoorResetCameraSequence(camera);

  await scheduler.asyncTimeout(1000);

  const beanBot = level.getEntitiesForType(BeanBot).at(0)!;

  masterConversation.setConversation<
    "Adana",
    "scanning" | "followBeanBot" | "ellipses"
  >({
    start: "scanning",
    steps: {
      scanning: {
        speaker: "Adana",
        text: () =>
          "Primary route obstructed. Stand by—I am identifying an alternative route through the debris now.",
        next: "ellipses"
      },
      ellipses: {
        speaker: "Adana",
        text: () => "...",
        next: "followBeanBot"
      },
      followBeanBot: {
        speaker: "Adana",
        onStart: () => {
          const beanBotPath = level.getEntityForName<MotionPath>(
            "BeanBot Broken Door Path"
          )!;

          beanBot.swapControlMethod("path");
          beanBot.behaviors.motionPathFollowing.snapOntoPathProvider(
            beanBotPath
          );
        },
        text: () => [
          "Structural integrity failing.",
          "Follow Bean Bot to the exit. Move!"
        ],
        done: true
      }
    },
    onComplete: () => {
      player.setMovementEnabled(true);
    }
  });

  await waitForBeanBotAndPlayerToBeNearbyHole(level, beanBot, player);

  const beanBotFinalPath = level.getEntityForName<MotionPath>(
    "BeanBot Broken Door Path Down"
  )!;

  beanBot.swapControlMethod("path"); // NOTE: has to be re-set apparently...
  beanBot.behaviors.motionPathFollowing.snapOntoPathProvider(beanBotFinalPath);

  await typedEmitterPromise(
    beanBot.behaviors.motionPathFollowing.events,
    MotionPathFollowingEvents.PathEndpointReached
  );

  beanBot.swapControlMethod("physicsFollowPlayer");
}

async function performBrokenDoorInitialCameraSequence(
  camera: CameraDirectorAPI
): Promise<void> {
  camera.pushScriptedRequest(
    {
      size: new Vector2(13, 15)
    },
    2000
  );

  await camera.pushScriptedRequest(
    {
      shake: 5
    },
    1000
  );

  return;
}

async function performBrokenDoorResetCameraSequence(
  camera: CameraDirectorAPI
): Promise<void> {
  const panPromise = camera.resetScriptedProperties(2500, undefined, "center");
  const shakePromise = camera.resetScriptedProperties(3500, undefined, "shake");

  await Promise.allSettled([panPromise, shakePromise]);

  await camera.clearScriptedRequests(1000);

  return;
}

// NOTE: temporary helper function until navigation is fixed
async function movePlayerToXCoord(
  level: LevelAPI,
  player: PlayerAPI,
  newXCoord: number
): Promise<void> {
  const originalXCoord = player.position.x;
  const deltaX = newXCoord - originalXCoord;

  return new Promise((resolve) => {
    if (deltaX === 0) resolve();

    const desiredHSpeedRatio = deltaX / Math.abs(deltaX);
    player.behaviors.data.controlEvents.emit(
      ControlEvents.MoveHorizontally,
      desiredHSpeedRatio
    );

    level.on(EntityLevelEvents.Step, function checkIfMovementDone() {
      const currentXCoord = player.position.x;

      if (
        (desiredHSpeedRatio < 0 && currentXCoord < newXCoord) ||
        (desiredHSpeedRatio > 0 && currentXCoord > newXCoord)
      ) {
        resolve();
        player.behaviors.data.controlEvents.emit(
          ControlEvents.MoveHorizontally,
          0
        );
        level.off(EntityLevelEvents.Step, checkIfMovementDone);
      }
    });
  });
}

async function performPlayerDodgingSequence(
  level: LevelAPI,
  player: PlayerAPI,
  playerTargetingStalactities: FallingTerrain[]
): Promise<void> {
  const FIRST_DODGE_DELAY_TIME = 500;
  const SECOND_DODGE_DELAY_TIME = 200;

  const secondStalactite = playerTargetingStalactities[1];

  const originalPlayerXCoord = player.position.x;
  const dodgingPlayerXCoord = secondStalactite.position.x;

  const scheduler = new Scheduler();
  level.on(EntityLevelEvents.Step, (deltaMs) => scheduler.step(deltaMs));

  await scheduler.asyncTimeout(FIRST_DODGE_DELAY_TIME);

  await movePlayerToXCoord(level, player, dodgingPlayerXCoord);

  await scheduler.asyncTimeout(SECOND_DODGE_DELAY_TIME);

  await movePlayerToXCoord(level, player, originalPlayerXCoord);

  return;
}

async function waitForBeanBotAndPlayerToBeNearbyHole(
  level: LevelAPI,
  beanBot: BeanBot,
  player: PlayerAPI
): Promise<void> {
  const beanBotPathPromise = typedEmitterPromise(
    beanBot.behaviors.motionPathFollowing.events,
    MotionPathFollowingEvents.PathEndpointReached
  );

  const playerIsNearbyToHolePromise = new Promise<void>((resolve) => {
    const holeMarker = level.getEntityForName<Marker>(
      "Broken Door Hole Position"
    );

    // DO NOT use non-null type assertions - always check.
    if (!holeMarker) return resolve();

    const resolveIfPlayerNearbyHole = () => {
      const playerDistance = holeMarker.position.distanceTo(player.position);
      const isNearby = playerDistance <= 5;

      if (!isNearby) return;

      level.off(EntityLevelEvents.Step, resolveIfPlayerNearbyHole);
      resolve();
    };

    level.on(EntityLevelEvents.Step, resolveIfPlayerNearbyHole);
  });

  await Promise.all([beanBotPathPromise, playerIsNearbyToHolePromise]);

  return;
}

function getBrokenDoorSequenceEntities(level: LevelAPI): {
  brokenDoorSwitch: Switch;
  brokenDoor: BrokenDoor;
  fallingStalactites: {
    allStalactites: FallingTerrain[];
    normalStalactites: FallingTerrain[];
    playerTargetingStalactities: FallingTerrain[];
    terrainTargetingStalactite: FallingTerrain;
  };
  destructableTerrain: DestructableTerrain[];
} {
  const brokenDoorSwitch =
    level.getEntityForName<Switch>("Broken Door Switch")!;
  const brokenDoor = level.getEntityForName<BrokenDoor>("Broken Door")!;
  const destructableTerrain = level
    .getEntitiesForType(DestructableTerrain)
    .filter(
      (terrain) => terrain.layerName === "Broken Door Destructable Earth"
    );

  const allStalactites = level
    .getEntitiesForType(FallingTerrain)
    .filter((terrain) => terrain.name?.includes("Falling Stalactite"));

  const normalStalactites = allStalactites.filter((stalactite) =>
    stalactite.name?.startsWith("Falling Stalactite")
  );
  const playerTargetingStalactities = allStalactites.filter((stalactite) =>
    stalactite.name?.startsWith("Player")
  );
  const terrainTargetingStalactite = allStalactites.find((stalactite) =>
    stalactite.name?.startsWith("Destructable Terrain")
  )!;

  return {
    brokenDoorSwitch,
    brokenDoor,
    fallingStalactites: {
      allStalactites,
      normalStalactites,
      playerTargetingStalactities,
      terrainTargetingStalactite
    },
    destructableTerrain
  };
}

async function setupEndingGate(level: LevelAPI): Promise<void> {
  const endingGate = level.getEntityForName<CavesEndGate>("Ending Gate")!;
  const player = getPlayer(level)!;

  const beanBot = await new Promise<BeanBot>((resolve) => {
    const resolveIfBeanBotIsAvailable = () => {
      const possibleBeanBot = level.getEntitiesForType(BeanBot).at(0);

      if (!possibleBeanBot) return;

      level.off(EntityLevelEvents.Step, resolveIfBeanBotIsAvailable);
      resolve(possibleBeanBot);
    };

    level.on(EntityLevelEvents.Step, resolveIfBeanBotIsAvailable);
  });

  endingGate.syncWithPlayerDepthValue(player);
  endingGate.setBeanBotDepthValue(beanBot);
}

async function setupEndingGateSequence(level: LevelAPI) {
  const scheduler = new Scheduler();
  level.on(EntityLevelEvents.Step, (deltaMs) => scheduler.step(deltaMs));

  backupBeanBotTeleportForEndingGateSequence(level);

  handleBridgeWalkZoomingSequence(level);

  const startTrigger = level.getEntityForName<AreaTrigger>(
    "Ending Gate Sequence Start"
  )!;

  await waitForPlayerToCrossEndGateSequenceTrigger(startTrigger);

  const { player, camera, beanBot, endingGate, beanBotMarker } =
    getEndingGateSequenceEntities(level);

  player.setMovementEnabled(false);

  beanBot.swapControlMethod("physics");
  beanBot.behaviors.pathFollowing.planAndFollowPathToPosition(
    vector3To2(beanBotMarker.position)
  );

  const beanBotReachMarkerPromise = typedEmitterPromise(
    beanBot.behaviors.pathFollowing.pathEvents,
    PathFollowingBehaviorEvents.PathComplete
  );

  const currentSize = camera.getCurrentProperties().size;

  await camera.pushScriptedRequest(
    {
      size: currentSize.clone().sub({ x: 2, y: 2 })
    },
    1500
  );

  await scheduler.asyncTimeout(1000);

  await masterConversation.showConversation<
    "Adana",
    "congratulations" | "ellipses" | "weHaveToGo"
  >({
    start: "congratulations",
    steps: {
      congratulations: {
        speaker: "Adana",
        text: () =>
          "Mission parameters met. The exit is beyond this threshold—",
        next: "ellipses"
      },
      ellipses: {
        speaker: "Adana",
        onStart: () => {
          camera.pushScriptedRequest(
            {
              shake: 10
            },
            5000
          );
        },
        text: () => "...",
        next: "weHaveToGo"
      },
      weHaveToGo: {
        speaker: "Adana",
        text: () => [
          "The cavern is collapsing! Efficiency is mandatory.",
          "Bean-Bot, force the gate open!"
        ],
        done: true
      }
    }
  });

  // if bean bot still has not reached the marker, keep waiting
  await beanBotReachMarkerPromise;

  beanBot.swapControlMethod("path");
  beanBot.behaviors.motionPathFollowing.snapOntoNearestPathProvider();

  await typedEmitterPromise(
    beanBot.behaviors.motionPathFollowing.events,
    MotionPathFollowingEvents.PathEndpointReached
  );
  beanBot.swapControlMethod("none");

  await scheduler.asyncTimeout(1000);

  endingGate.open();

  await scheduler.asyncTimeout(2000);

  await masterConversation.showConversation<"Adana", "getOut">({
    start: "getOut",
    steps: {
      getOut: {
        speaker: "Adana",
        text: () => "Gate override successful. Evacuate now!",
        done: true
      }
    }
  });

  await camera.pushScriptedRequest(
    {
      shake: 20
    },
    500
  );

  player.behaviors.data.controlEvents.emit(ControlEvents.MoveHorizontally, 1);
}

function backupBeanBotTeleportForEndingGateSequence(level: LevelAPI): void {
  const outsideMiningBuildingTrigger = level.getEntityForName<AreaTrigger>(
    "Mining Building Outside Transition 1"
  )!;

  outsideMiningBuildingTrigger.behaviors.sensor.events.on(
    AreaSensorEvents.EntityContact,
    async function performBackupBeanBotTeleport(contactedEntity) {
      if (!isPlayerAPI(contactedEntity)) return;

      outsideMiningBuildingTrigger.behaviors.sensor.events.off(
        AreaSensorEvents.EntityContact,
        performBackupBeanBotTeleport
      );

      const beanBot = level.getEntitiesForType(BeanBot).at(0)!;
      const player = contactedEntity;

      const beanBotDistance = player.position.distanceTo(beanBot.position);
      const beanBotIsTooFar = beanBotDistance >= 10;

      if (!beanBotIsTooFar) return;

      beanBot.swapControlMethod("none");

      const backupTeleportMarker = level.getEntityForName<Marker>(
        "BeanBot Backup Teleport Position"
      )!;
      beanBot.teleport(
        new Vector3(
          backupTeleportMarker.position.x,
          backupTeleportMarker.position.y,
          beanBot.position.z
        )
      );

      const backupPath = level.getEntityForName<MotionPath>(
        "BeanBot Backup Path"
      )!;

      beanBot.swapControlMethod("path");
      beanBot.behaviors.motionPathFollowing.snapOntoPathProvider(backupPath);

      await typedEmitterPromise(
        beanBot.behaviors.motionPathFollowing.events,
        MotionPathFollowingEvents.PathEndpointReached
      );

      beanBot.swapControlMethod("physicsFollowPlayer");
    }
  );
}

function handleBridgeWalkZoomingSequence(level: LevelAPI): void {
  const player = getPlayer(level);
  if (!player) return;

  const bridgeZoomSequence: CameraRequest<"size" | "offset" | "influence"> = {
    id: crypto.randomUUID(),
    priority: CameraRequestPriority.ADJUSTMENT,
    subPriority: 500,
    size: new Vector2(17, 23),
    offset: new Vector2(5, 0),
    influence: 0
  };

  level.cameraDirector.sendRequest(bridgeZoomSequence);

  // these are set when contacting the zooming triggers below
  let startingPlayerXCoord = 0;
  let startingRequestInfluence = 0;
  let shouldPerformCameraAnimation = false;

  const performCameraAnimation = () => {
    if (!shouldPerformCameraAnimation) return;

    const currentPlayerXCoord = player.position.x;
    const playerDeltaX = currentPlayerXCoord - startingPlayerXCoord;

    // If distance between the two triggers are changed this should be adjusted... Pretty messy but whatever...
    const deltaScalingFactor = 0.09;

    const deltaInfluence = playerDeltaX * deltaScalingFactor;

    const newInfluence = clamp(startingRequestInfluence + deltaInfluence, 0, 1);
    bridgeZoomSequence.influence = newInfluence;

    level.cameraDirector.sendRequest(bridgeZoomSequence);
  };

  const startCameraAnimation = () => {
    startingPlayerXCoord = player.position.x;
    startingRequestInfluence = bridgeZoomSequence.influence;
    shouldPerformCameraAnimation = true;
  };

  const stopCameraAnimation = () => {
    shouldPerformCameraAnimation = false;
  };

  level.on(EntityLevelEvents.Step, performCameraAnimation);

  const sequenceZoomStartTrigger = level.getEntityForName<AreaTrigger>(
    "Ending Gate Zoom Start"
  )!;
  const sequenceZoomEndTrigger = level.getEntityForName<AreaTrigger>(
    "Ending Gate Zoom End"
  )!;

  const zoomStartTriggerXCoord = sequenceZoomStartTrigger.position.x;
  const zoomEndTriggerXCoord = sequenceZoomEndTrigger.position.x;

  // comera animation function runs every frame player is between zoom triggers
  sequenceZoomStartTrigger.behaviors.sensor.events.on(
    AreaSensorEvents.EntityContactEnd,
    (contactedEntity) => {
      if (!isPlayerAPI(contactedEntity)) return;

      const playerX = contactedEntity.position.x;
      const hasExitedToTheRight = playerX > zoomStartTriggerXCoord;
      if (!hasExitedToTheRight) return;

      startCameraAnimation();
    }
  );
  sequenceZoomEndTrigger.behaviors.sensor.events.on(
    AreaSensorEvents.EntityContactEnd,
    (contactedEntity) => {
      if (!isPlayerAPI(contactedEntity)) return;

      const playerX = contactedEntity.position.x;
      const hasExitedToTheLeft = playerX < zoomEndTriggerXCoord;
      if (!hasExitedToTheLeft) return;

      startCameraAnimation();
    }
  );

  // camera animation function stops running when player exits the range between the zooming triggers
  sequenceZoomStartTrigger.behaviors.sensor.events.on(
    AreaSensorEvents.EntityContact,
    (contactedEntity) => {
      if (!isPlayerAPI(contactedEntity)) return;

      stopCameraAnimation();
    }
  );
  sequenceZoomEndTrigger.behaviors.sensor.events.on(
    AreaSensorEvents.EntityContact,
    (contactedEntity) => {
      if (!isPlayerAPI(contactedEntity)) return;

      stopCameraAnimation();
    }
  );
}

function getEndingGateSequenceEntities(level: LevelAPI): {
  player: PlayerAPI;
  camera: CameraDirectorAPI;
  beanBot: BeanBot;
  endingGate: CavesEndGate;
  beanBotMarker: Marker;
} {
  const player = getPlayer(level)!;
  const camera = level.cameraDirector;
  const beanBot = level.getEntitiesForType(BeanBot).at(0)!;
  const endingGate = level.getEntityForName<CavesEndGate>("Ending Gate")!;
  const beanBotMarker = level.getEntityForName<Marker>(
    "Ending Gate Sequence BeanBot Marker"
  )!;

  return {
    player,
    camera,
    beanBot,
    endingGate,
    beanBotMarker
  };
}

async function waitForPlayerToCrossEndGateSequenceTrigger(
  trigger: AreaTrigger
): Promise<void> {
  await new Promise<void>((resolve) => {
    trigger.behaviors.sensor.events.on(
      AreaSensorEvents.EntityContact,
      (contactedEntity) => {
        if (!isPlayerAPI(contactedEntity)) return;

        resolve();
      }
    );
  });

  return;
}
