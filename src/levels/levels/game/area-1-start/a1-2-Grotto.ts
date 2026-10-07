// TODO: migrate to new camera
// @ts-nocheck
import { Vector2 } from "three";

import { ControlEventEmitter } from "src/api/controls";
import { EntityLevelEvents } from "src/api/entity";
import { T00EquipThePotion } from "src/components/tutorials/tutorialsv1/t00EquipThePotion";
import { LevelDefinitionAPI } from "src/engine/level/LevelLoaderAPI";
import { DeferredEmitter } from "src/engine/util/deferredEmitter";
import { Player } from "src/entities/player/Player";
import { CharacterGroundPhysicsControlBehaviorEvents } from "src/entities/shared/behaviors/CharacterGroundPhysicsController";
import { PopoverConversation } from "src/entities/ui/PopoverConversation";
import { addItems } from "src/redux/shared/actions";
import { selectHealth } from "src/redux/status/selectors";
import { directSetHealthAndMana } from "src/redux/status/slice";
import { store } from "src/redux/store";
import {
  EnableElements,
  enableUIElements,
  startTutorial
} from "src/redux/ui/slice";

export const Area1_2_Grotto: LevelDefinitionAPI = {
  id: "Area1_2_Grotto",
  mapJson: async () => (await import("../../../tiled/maps/area1-intro/a2-grotto.tmj")).default,
  setup: (level) => {
    if (level.state.getValue("initialized")) return;
    level.state.setValue("initialized", true);

    let player: Player | undefined;
    const fallMarker = level.getEntityForName("FallPosition");
    for (const entity of level.getEntities().values()) {
      if (entity.type === Player.type) {
        player = entity as Player;
        continue;
      }
    }
    if (!player || !fallMarker) return;

    const attachControlsOverride = () => {
      if (level.controls) {
        const controlEvents = level.controls.events;
        player.setMovementEnabled(false);
        player.behaviors.physicsControl.events.once(
          CharacterGroundPhysicsControlBehaviorEvents.Land,
          () => {
            player.setMovementEnabled(true);
          }
        );
      }
    };
    if (level.controls) {
      attachControlsOverride();
    } else {
      level.once(EntityLevelEvents.AttachControls, attachControlsOverride);
    }

    const fallDone = new DeferredEmitter();
    const dialogDone = new DeferredEmitter();
    const healed = new DeferredEmitter();
    let sequenceDone = false;
    const sequenceRunner = () => {
      if (sequenceDone) {
        level.off(EntityLevelEvents.Step, sequenceRunner);
        return;
      }
      // Manually update the player's body position.
      const bodyPosition = player.behaviors.physics.body?.translation();
      if (bodyPosition) {
        player.object3D.position.x = bodyPosition.x;
        player.object3D.position.y = bodyPosition.y - 0.5;
      }
      // Manually update the player's rotation.
      const deltaY = player.position.y - fallMarker.position.y;
      player.object3D.rotation.z = (deltaY * 0.25 + 0.5) * Math.PI;
      // Trigger fall completion.
      if (deltaY < 0.5 && !fallDone.getDone()) fallDone.emit("done");
    };
    level.on(EntityLevelEvents.Step, sequenceRunner);

    const sequenceHandler = async () => {
      player.behaviors.physics.controlObject3D = false;
      player.behaviors.camera.zoomToSize(new Vector2(5, 5), 0);
      sequenceRunner();
      let controlEvents: ControlEventEmitter | undefined;
      const controlsAttached = new DeferredEmitter();
      const attemptAttachControls = () => {
        if (controlEvents) return;
        controlEvents = level.controls?.events;
        if (controlEvents) controlsAttached.emit("done");
      };
      attemptAttachControls();
      if (!controlEvents)
        level.on(EntityLevelEvents.AttachControls, attemptAttachControls);
      await controlsAttached.getPromise();
      await fallDone.getPromise();
      player.behaviors.status.applyHitWithDuration(
        {
          damage: 0,
          hittingEntity: player
        },
        2000
      );
      store.dispatch(directSetHealthAndMana([5, 0]));
      store.dispatch(enableUIElements([EnableElements.Health]));
      if (controlEvents) player.setMovementEnabled(false);
      const dialog = new PopoverConversation({
        position: player.position.clone(),
        participants: [player],
        lines: [
          {
            participantId: player.id,
            line: "Owwwwwwwwww..."
          },
          {
            participantId: player.id,
            line: "Better use that healing potion I brought."
          }
        ]
      });
      level.addEntity(dialog);
      dialog.conversationEvents.on("complete", () => dialogDone.emit("done"));
      await dialogDone.getPromise();
      store.dispatch(
        addItems({
          item: { type: "Potion", variant: "Health" },
          hotkey: true
        })
      );
      store.dispatch(startTutorial(T00EquipThePotion.id));
      const healSubscriptor = () => {
        if (selectHealth(store.getState()) > 10) healed.emit("done");
      };
      const healUnsubscribe = store.subscribe(healSubscriptor);
      await healed.getPromise();
      healUnsubscribe();
      player.behaviors.physics.controlObject3D = true;
      player.behaviors.camera.zoomToDefault(2000);
      if (controlEvents) player.setMovementEnabled(true);
      level.ctx?.saveStore?.saveGame();
      sequenceDone = true;
    };
    sequenceHandler();
  }
};
