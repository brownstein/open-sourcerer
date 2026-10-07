import { Button, ThemeProvider, createTheme } from "@mui/material";
import shortid from "shortid";
import { Vector2, Vector3 } from "three";

import { CameraRequest, CameraRequestPriority } from "src/api/camera";
import { EntityLevelEvents, EntityLifecycleEvents } from "src/api/entity";
import { HotKeys } from "src/api/hotkeys";
import { SavedSpellAspect } from "src/api/spells";
import { typedEmitterPromise } from "src/api/util";
import { Icon } from "src/components/ui/icons/Icon";
import { LevelDefinitionAPI } from "src/engine/level/LevelLoaderAPI";
import { Scheduler } from "src/engine/scheduling/Scheduler";
import { DeferredEmitter } from "src/engine/util/deferredEmitter";
import { getPlayer } from "src/engine/util/levelUtil";
import { DummyFloat, DummySword } from "src/entities/enemies/robots/Dummy";
import { AreaTrigger } from "src/entities/environment/AreaTrigger";
import { AdanaInitialDialog } from "src/entities/environment/virtual/AdanaInitialDialog";
import { MakeItem } from "src/entities/environment/virtual/MakeItem";
import { ProgressiveDrawLine } from "src/entities/environment/virtual/ProgressiveDrawLine";
import { PlayerAPI, isPlayerAPI } from "src/entities/player/PlayerAPI";
import { AreaSensorEvents } from "src/entities/shared/behaviors/AreaSensorBehavior";
import { isTerrain } from "src/entities/terrain/BaseTerrain";
import { gotoLevel } from "src/redux/gameState/slice";
import {
  EquippedWeaponTypes,
  assignHotKey,
  equipWeapon,
  flushInventory
} from "src/redux/inventory/slice";
import { selectAllScriptEditors } from "src/redux/scriptEditor/selectors";
import { closeEditor, upsertEditor } from "src/redux/scriptEditor/slice";
import { deleteScript, saveScript } from "src/redux/scriptLibrary/slice";
import { closeTabs, openCodeEditor } from "src/redux/shared/actions";
import { selectPlayerName } from "src/redux/status/selectors";
import { store } from "src/redux/store";
import { selectComponentConfigsByComponentName } from "src/redux/ui/selectors";
import {
  EnableElements,
  disableUIElements,
  enableUIElements
} from "src/redux/ui/slice";
import { builtInSpells } from "src/scripting/builtinScripts";
import { delay } from "src/scripting/core/util";
import { storeConditionPromise } from "src/util/storeCondition";

import { Cryo_0_409 } from "../act-1-cryo/Cryo_0_409";

export const Dream_0: LevelDefinitionAPI = {
  id: "Dream_0",
  mapJson: async () => (await import("src/levels/tiled/maps/act-0-dream/dream-0.tmj")).default,
  setup: (level) => {
    for (const entity of level.getEntities().values()) {
      if (isTerrain(entity) && entity.layerName === "Invisible Walls") {
        entity.object3D.visible = false;
      }
    }

    const adanaDialog = new AdanaInitialDialog({
      position: new Vector3()
    });
    level.addEntity(adanaDialog);

    const scheduler = new Scheduler();
    level.on(EntityLevelEvents.Step, (ms) => scheduler.step(ms));

    let player: PlayerAPI | undefined;

    level.getEntityForName<ProgressiveDrawLine>("L1")?.hideImmediate();
    level.getEntityForName<ProgressiveDrawLine>("L2")?.hideImmediate();

    level.state.subValue("fadeInComplete", (complete) => {
      if (!complete) return;
      player = getPlayer(level) ?? undefined;
      if (player) {
        level.cameraDirector.sendLookAtEntityRequest(player, {
          offset: new Vector2(0, 0.5)
        });
      }
      adanaDialog.setContent([
        [
          "Hello, Sourcerer.",
          "Let's see if your consciousness is working right;",
          "Try moving with the [ A ] and [ D ] keys..."
        ]
      ]);
      adanaDialog.appear();
    });

    const playerZoomOverride: CameraRequest = {
      id: crypto.randomUUID(),
      priority: CameraRequestPriority.SCRIPTED,
      size: new Vector2(6, 6)
    };
    level.cameraDirector.sendRequest(playerZoomOverride);

    const zoomOutRequest: CameraRequest<"influence" | "size"> = {
      id: crypto.randomUUID(),
      priority: CameraRequestPriority.HIGHEST,
      size: new Vector2(10, 8),
      influence: 0
    };

    let trigger2Done = false;
    level
      .getEntityForName<AreaTrigger>("Trigger 02")
      ?.behaviors.sensor.events.on(
        AreaSensorEvents.EntityContact,
        (contacted) => {
          if (!isPlayerAPI(contacted) || trigger2Done) return;
          trigger2Done = true;

          level.cameraDirector.sendRequest(zoomOutRequest);
          level.cameraDirector.lerpRequestInfluence(zoomOutRequest, 1, 1000);

          if (player) {
            level.cameraDirector.sendLookAtEntityRequest(player, {
              lookaheadDistance: 1
            });
          }

          adanaDialog.setContent([["Press [ Space ] to jump."]]);
          level
            .getEntityForName<ProgressiveDrawLine>("L1")
            ?.drawProgressive(3000);
        }
      );

    let trigger3Done = false;
    level
      .getEntityForName<AreaTrigger>("Trigger 03")
      ?.behaviors.sensor.events.on(
        AreaSensorEvents.EntityContact,
        (contacted) => {
          if (!isPlayerAPI(contacted) || trigger3Done) return;
          trigger3Done = true;

          level.cameraDirector.removeRequests(playerZoomOverride);
          level.cameraDirector.lerpRequestInfluence(zoomOutRequest, 0, 500, 1);

          adanaDialog.setContent([
            ["Press [ Space ] and [ A ] or [ D ] to jump forwards."]
          ]);
          level
            .getEntityForName<ProgressiveDrawLine>("L2")
            ?.drawProgressive(5000);
        }
      );

    let trigger4Done = false;
    level
      .getEntityForName<AreaTrigger>("Trigger 04")
      ?.behaviors.sensor.events.on(
        AreaSensorEvents.EntityContact,
        (contacted) => {
          if (!isPlayerAPI(contacted) || trigger4Done) return;
          trigger4Done = true;
          player = contacted;
          adanaDialog.setContent([
            ["Press [ S ] to drop down through a platform."]
          ]);
        }
      );

    let trigger5Done = false;
    level
      .getEntityForName<AreaTrigger>("Trigger 05")
      ?.behaviors.sensor.events.on(
        AreaSensorEvents.EntityContact,
        (contacted) => {
          if (!isPlayerAPI(contacted) || trigger5Done) return;
          trigger5Done = true;
          player = contacted;
          adanaDialog.setContent([
            [
              "Press [ A ] to move backwards,",
              "then,",
              "press [ S ] to drop down through the next platform."
            ]
          ]);
        }
      );

    const dummy1 = level.getEntityForName<DummySword>("Dummy 01");
    const dummy2 = level.getEntityForName<DummyFloat>("Dummy 02");
    const dummy3 = level.getEntityForName<DummyFloat>("Dummy 03");
    dummy1?.setOpacity(0).disable();
    dummy2?.setOpacity(0).disable();
    dummy3?.setOpacity(0).disable();

    let trigger6Done = false;
    level
      .getEntityForName<AreaTrigger>("Trigger 06")
      ?.behaviors.sensor.events.on(
        AreaSensorEvents.EntityContact,
        async (contacted) => {
          if (!isPlayerAPI(contacted) || trigger6Done) return;
          trigger6Done = true;
          player = contacted;

          const makeSword = level.getEntityForName<MakeItem>("Sword");
          if (!makeSword) return;
          adanaDialog.setContent([
            [
              "You see that sword?",
              "Pick it up and practice hitting the test dummies that appear."
            ]
          ]);
          makeSword.fadeIn();
          await makeSword.deferredPickupEmitter.getPromise();
          store.dispatch(equipWeapon(EquippedWeaponTypes.Sword));
          adanaDialog.setContent([
            ["Click [ LMB ] to swing your sword and attack the test dummy."]
          ]);

          if (!dummy1) return;

          scheduler.add({
            duration: 1000,
            invokeEventAtComplete: "dummy1FadeInDone",
            invokeFunction: (t) => {
              dummy1.setOpacity(t);
            },
            invokeFunctionAtComplete: () => {
              dummy1.enable();
              dummy1.setOpacity(1);
            }
          });

          await typedEmitterPromise(scheduler, "dummy1FadeInDone");
          await typedEmitterPromise(dummy1.events, EntityLifecycleEvents.Die);

          const makeSpell = level.getEntityForName<MakeItem>("Spell Book");
          if (!makeSpell) return;
          adanaDialog.setContent([
            [
              "On to spells.",
              "Pick up the book and click [ LMB ] on the enemy."
            ]
          ]);
          makeSpell.fadeIn();
          await makeSpell.deferredPickupEmitter.getPromise();
          store.dispatch(equipWeapon(null));
          store.dispatch(enableUIElements([EnableElements.Mana]));
          const scriptId = shortid();
          store.dispatch(
            saveScript({
              code: builtInSpells.FireballAim.code,
              name: "Fireball Loop",
              id: scriptId,
              metadata: {
                color: 0xfff000,
                aspect: SavedSpellAspect.Fire
              }
            })
          );
          store.dispatch(
            assignHotKey({
              hotKey: HotKeys.HotKey2,
              assignment: {
                type: "spell",
                scriptId
              }
            })
          );
          level.ctx?.spells?.run(
            builtInSpells.FireballAim.code,
            player.id,
            null,
            scriptId
          );

          if (!dummy3) return;
          scheduler.add({
            duration: 1000,
            invokeEventAtComplete: "dummy3FadeInDone",
            invokeFunction: (t) => {
              dummy3.setOpacity(t);
            },
            invokeFunctionAtComplete: () => {
              dummy3.enable();
              dummy3.setOpacity(1);
            }
          });
          await typedEmitterPromise(scheduler, "dummy3FadeInDone");
          dummy3.startHovering();
          await typedEmitterPromise(dummy3.events, EntityLifecycleEvents.Die);

          for (const spellCtx of Object.values(
            level?.ctx?.spells?.getSpellCtxs() ?? {}
          )) {
            spellCtx.terminate();
          }

          const darkTheme = createTheme({
            palette: {
              mode: "dark",
              primary: {
                main: "#f6c447",
                contrastText: "#583f28"
              }
            }
          });

          const clickEmitter = new DeferredEmitter();
          adanaDialog.setContent([
            [
              `Well done ${selectPlayerName(store.getState())}.`,
              "Now, let's review the process of modifying your spells.",
              <div className="large-button-container">
                <ThemeProvider theme={darkTheme}>
                  <Button
                    className="spell-edit-button"
                    onClick={() => clickEmitter.emit("done")}
                  >
                    <Icon icon="skillFire" className="fire-icon" />
                    <span>Edit Your First Spell</span>
                    <Icon icon="skillFire" className="fire-icon" />
                  </Button>
                </ThemeProvider>
              </div>
            ]
          ]);

          await clickEmitter.getPromise();
          adanaDialog.disappear();

          store.dispatch(openCodeEditor({}));
          await storeConditionPromise(
            (s) => !!selectComponentConfigsByComponentName(s)["codeEditor"]
          );
          const state = store.getState();
          const codeEditorConfig = selectAllScriptEditors(state)?.at(0);
          if (!codeEditorConfig) return;

          scheduler.add({
            duration: 2000,
            invokeEventAtComplete: "codeEditorScrambled",
            invokeFunction: (t) => {
              const ids: string[] = [];
              for (let i = 0; i < t * 120; i++) {
                ids.push(shortid());
                if (!(i % 4)) ids.push("\n");
              }
              store.dispatch(
                upsertEditor({
                  ...codeEditorConfig,
                  code: ids.join(" ")
                })
              );
            }
          });
          await typedEmitterPromise(scheduler, "codeEditorScrambled");

          adanaDialog.setContent([
            [
              "No, that's not right...",
              "You should alrady have access to...",
              "Hold on..."
            ]
          ]);
          adanaDialog.appear();

          await delay(3000);
          store.dispatch(
            closeTabs({ componentName: "codeEditor", smooth: true })
          );
          store.dispatch(closeEditor(codeEditorConfig.id));
          store.dispatch(
            disableUIElements([EnableElements.Mana, EnableElements.CodeEditor])
          );

          await delay(2000);
          adanaDialog.disappear();

          const cameraRequestId = crypto.randomUUID();
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

          store.dispatch(flushInventory());
          store.dispatch(deleteScript(scriptId));
          for (const spellCtx of Object.values(
            level?.ctx?.spells?.getSpellCtxs() ?? {}
          )) {
            spellCtx.terminate();
          }

          // And we're off!
          store.dispatch(
            gotoLevel({
              levelId: Cryo_0_409.id
            })
          );
        }
      );
  }
};
