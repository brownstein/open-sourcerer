import shortid from "shortid";
import { Color, Vector2, Vector3 } from "three";

import { CameraRequest, CameraRequestPriority } from "src/api/camera";
import { EntityLevelEvents, EntityLifecycleEvents } from "src/api/entity";
import { typedEmitterPromise } from "src/api/util";
import { tutorialSingleton } from "src/components/tutorials/TutorialController";
import { setAssetDependencies } from "src/engine/entity/decorators";
import { LevelDefinitionAPI } from "src/engine/level/LevelLoaderAPI";
import { Scheduler } from "src/engine/scheduling/Scheduler";
import { Dummy, DummyFloat } from "src/entities/enemies/robots/Dummy";
import { AreaTrigger } from "src/entities/environment/AreaTrigger";
import { Chest, ChestEvents } from "src/entities/environment/Chest";
import { ProgressiveDrawLine } from "src/entities/environment/virtual/ProgressiveDrawLine";
import { PlayerAPI, isPlayerAPI } from "src/entities/player/PlayerAPI";
import {
  PlayerCoalesce,
  PlayerCoalesceEvents
} from "src/entities/player/PlayerCoalesce";
import { AreaSensorEvents } from "src/entities/shared/behaviors/AreaSensorBehavior";
import { isTerrain } from "src/entities/terrain/BaseTerrain";
import { OverlayTutorial } from "src/entities/ui/OverlayTutorial";
import { gotoLevel } from "src/redux/gameState/slice";
import {
  EquippedWeaponTypes,
  equipWeapon,
} from "src/redux/inventory/slice";
import { store } from "src/redux/store";
import { EnableElements, enableUIElements } from "src/redux/ui/slice";

import { Cryo_0_728 } from "../act-1-cryo/Cryo_0_728";
import Dream_0_327Screenshot from "./Dream_0_327.png";

export const Dream_0_327: LevelDefinitionAPI = {
  id: "Dream_0_327",
  screenshotImage: Dream_0_327Screenshot,
  backgroundColor: new Color(0.05, 0.05, 0.05),
  mapJson: async () =>
    (await import("src/levels/tiled/maps/act-0-dream/Dream_0_327.tmj")).default,
  ambientMusic: "pixel12Music",
  ambientMusicGain: 0.05,
  setup: (level) => {
    // Hide invisible walls.
    for (const entity of level.getEntities().values()) {
      if (isTerrain(entity) && entity.layerName === "Invisible Walls") {
        entity.object3D.visible = false;
      }
    }

    // Get references to interactive objects.
    const playerCoalesce =
      level.getEntityForName<PlayerCoalesce>("PlayerCoalesce");
    const trigger0 = level.getEntityForName<AreaTrigger>("AT_0");
    const trigger1 = level.getEntityForName<AreaTrigger>("AT_1");
    const trigger2 = level.getEntityForName<AreaTrigger>("AT_2");
    const trigger3 = level.getEntityForName<AreaTrigger>("AT_3");
    const trigger3_5 = level.getEntityForName<AreaTrigger>("AT_3.5");
    const trigger4 = level.getEntityForName<AreaTrigger>("AT_4");
    const trigger5 = level.getEntityForName<AreaTrigger>("AT_5");
    const trigger6 = level.getEntityForName<AreaTrigger>("AT_6");
    const trigger7 = level.getEntityForName<AreaTrigger>("AT_7");
    const line1 = level.getEntityForName<ProgressiveDrawLine>("Line1");
    const line2 = level.getEntityForName<ProgressiveDrawLine>("Line2");
    const chest1 = level.getEntityForName<Chest>("Chest1");
    const chest2 = level.getEntityForName<Chest>("Chest2");
    const dummy1 = level.getEntityForName<Dummy>("Dummy1");
    const dummy2 = level.getEntityForName<Dummy>("Dummy2");
    const dummy3 = level.getEntityForName<Dummy>("Dummy3");
    const dummyFlyer = level.getEntityForName<DummyFloat>("Flyer");

    line1?.hideImmediate();
    line2?.hideImmediate();
    if (chest1)
      chest1.behaviors.inventory.items = [
        {
          type: "Sword"
        }
      ];
    const scriptId = shortid();
    if (chest2)
      chest2.behaviors.inventory.items = [
        {
          type: "spell",
          scriptName: "Basic Blast",
          scriptId,
          scriptCode: `
            const Projectile = require("projectile");
            const self = require("self");
            const facingRight = self.extra.facingRight;
            new Projectile({
              velocity: { x: facingRight ? 10 : -10 },
            });
          `,
          scriptMetadata: {
            icon: {
              backgroundColor: 0,
              layers: [
                {
                  iconKey: "fireball",
                  position: {
                    x: 5,
                    y: 0
                  },
                  scale: 0.9,
                  rotation: -140,
                  color: 767215
                }
              ]
            }
          }
        }
      ];
    dummy1?.setOpacity(0);
    dummy2?.setOpacity(0);
    dummy3?.setOpacity(0);
    dummyFlyer?.setOpacity(0);
    dummy1?.disable();
    dummy2?.disable();
    dummy3?.disable();
    dummyFlyer?.disable();

    let player: PlayerAPI | undefined;
    playerCoalesce?.events.on(PlayerCoalesceEvents.PlayerSpawned, (spawned) => {
      player = spawned;
    });

    const zoomOverride: CameraRequest = {
      id: shortid(),
      priority: CameraRequestPriority.SCRIPTED,
      size: new Vector2(6, 6)
    };
    level.cameraDirector.sendRequest(zoomOverride);

    const zoomOutRequest: CameraRequest<"influence" | "size"> = {
      id: shortid(),
      priority: CameraRequestPriority.HIGHEST,
      size: new Vector2(10, 8),
      influence: 0
    };

    const setupTriggerContact = (
      trigger: AreaTrigger | null,
      cb: (contacted: PlayerAPI) => void
    ) => {
      let triggered = false;
      trigger?.behaviors.sensor.events.on(
        AreaSensorEvents.EntityContact,
        (contacted) => {
          if (!isPlayerAPI(contacted) || triggered) return;
          triggered = true;
          cb(contacted);
        }
      );
    };

    const overlay = new OverlayTutorial({
      position: new Vector3()
    });

    setupTriggerContact(trigger0, () => {
      level.addEntity(overlay);
      overlay.setContent(
        <div>
          <h3>Hello Sourcerer.</h3>
          <div>Press [ A ] or [ D ] to move horizontally...</div>
        </div>
      );
    });

    setupTriggerContact(trigger1, (contacted) => {
      level.cameraDirector.sendRequest(zoomOutRequest);
      level.cameraDirector.lerpRequestInfluence(zoomOutRequest, 1, 1000);
      level.cameraDirector.sendLookAtEntityRequest(contacted, {
        lookaheadDistance: 1
      });
      line1?.drawProgressive(5000, true);
      overlay.setContent("Press [ Space ] to jump....");
    });

    setupTriggerContact(trigger2, () => {
      overlay.setContent("Good job. Keep jumping and moving right...");
    });

    setupTriggerContact(trigger3, () => {
      overlay.setContent(
        "It's OK to miss jumps here in the tutorial, but try to do better later."
      );
    });

    setupTriggerContact(trigger3_5, () => {
      line2?.drawProgressive(5000, true);
    });

    setupTriggerContact(trigger4, () => {
      overlay.setContent("Press [ S ] to drop through platforms.");
    });

    setupTriggerContact(trigger5, () => {
      overlay.setContent("Presss [ W ] to climb ladders.");
    });

    setupTriggerContact(trigger6, () => {
      overlay.setContent("Continue forwards to learn about combat.");
    });

    setupTriggerContact(trigger7, () => {
      overlay.setContent("Press [ E ] to interact with objects and doors.");
    });

    chest1?.chestEvents.on(ChestEvents.Open, () => {
      dummy1?.setOpacity(1);
      dummy1?.enable();
      overlay.setContent(
        "Pick up the sword and click to attack the target dummy."
      );
      store.dispatch(
        enableUIElements([EnableElements.HotBar, EnableElements.HotBarBottom])
      );
    });

    chest1?.behaviors.inventory.events.on("takeAll", () => {
      store.dispatch(equipWeapon(EquippedWeaponTypes.Sword));
    });

    chest2?.behaviors.inventory.events.on("takeAll", () => {
      dummy3?.setOpacity(1);
      dummy3?.enable();
      store.dispatch(enableUIElements([EnableElements.Mana]));
      overlay.setContent("Now for a spell. Press [ 2 ] on the numpad cast.");
    });

    const scheduler = new Scheduler();
    level.on(EntityLevelEvents.Step, (ms) => scheduler.step(ms));

    dummy3?.events.on(EntityLifecycleEvents.Die, async () => {
      overlay.setContent(
        "Now let's move on to coding - follow the on-screen tutorial."
      );

      scheduler.add({
        duration: 1500,
        invokeEventAtComplete: "waitDone"
      });
      await typedEmitterPromise(scheduler, "waitDone");

      tutorialSingleton.startTutorial("T001RunHelloWorld");
      await typedEmitterPromise(tutorialSingleton.events, "tutorialCompleted");

      scheduler.add({
        duration: 500,
        invokeEventAtComplete: "waitDone"
      });
      await typedEmitterPromise(scheduler, "waitDone");

      tutorialSingleton.startTutorial("T001CleanupUI");
      await typedEmitterPromise(tutorialSingleton.events, "tutorialCompleted");

      level.removeEntity(overlay.id);
      overlay.destroy();

      scheduler.add({
        duration: 500,
        invokeEventAtComplete: "waitDone"
      });
      await typedEmitterPromise(scheduler, "waitDone");

      const cameraRequestId = shortid();
      scheduler.add({
        duration: 5000,
        invokeFunction: (t) => {
          if (!player) return;
          level.cameraDirector.sendLookAtEntityRequest(player, {
            offset: new Vector2(0, t * Math.sin(t * 200) * 0.5)
          });
          const levelCamera = level.cameraDirector;
          levelCamera.sendRequest({
            id: cameraRequestId,
            priority: CameraRequestPriority.HIGHEST,
            distort: t * 8 * Math.sin(t * 40),
            compositeOpacity: 1 - t
          });
        },
        invokeEventAtComplete: "shakeDone"
      });
      await typedEmitterPromise(scheduler, "shakeDone");

      for (const spellCtx of Object.values(
        level?.ctx?.spells?.getSpellCtxs() ?? {}
      )) {
        spellCtx.terminate();
      }

      // And we're off!
      store.dispatch(
        gotoLevel({
          levelId: Cryo_0_728.id
        })
      );
    });
  }
};

setAssetDependencies(() => ["pixel12Music"])(Dream_0_327);
