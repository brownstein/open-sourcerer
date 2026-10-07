import { Object3D } from "three";

import { EntityLevelAPI, EntityLevelEvents } from "src/api/entity";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import { setConsumerDependencies } from "src/engine/entity/decorators";
import { Player } from "src/entities/player/Player";
import { selectCutScenesCompleted } from "src/redux/progression/selectors";
import { completeCutScene } from "src/redux/progression/slice";
import { setCutsceneLocked } from "src/redux/status/slice";
import { store } from "src/redux/store";

import { isPlayerAPI } from "../player/PlayerAPI";

export const GOT_OUT_OF_BED = "GOT_OUT_OF_BED";

@setConsumerDependencies(() => [Player])
export class OpeningSceneBed extends CoreEntity {
  static type = "OpeningSceneBed";
  public type = "OpeningSceneBed";
  public object3D = new Object3D();

  attachToLevel(level: EntityLevelAPI) {
    super.attachToLevel(level);
    level.on(EntityLevelEvents.PreloadComplete, this.onPreloadComplete);
  }

  detachFromLevel(level: EntityLevelAPI) {
    level.off(EntityLevelEvents.PreloadComplete, this.onPreloadComplete);
    super.detachFromLevel(level);
  }

  readonly onPreloadComplete = (): void => {
    const level = this.level;
    if (!level) return;

    const cutScenesCompleted = selectCutScenesCompleted(store.getState());
    if (cutScenesCompleted[GOT_OUT_OF_BED]) return;

    // On preload, warp the player to this position and initiate the wake-up sequence.
    let player = [...level.getEntities().values()].find(isPlayerAPI);
    if (!player) {
      player = new Player({
        position: this.position.clone()
      });
      level.addEntity(player);
    }

    const targetPlayerPos = player.position.clone();
    const targetPlayerRot = 0;

    const tpPosition = this.position.clone();

    store.dispatch(setCutsceneLocked(true));
    player.behaviors.physics.controlObject3D = false;

    player.object3D.position.copy(tpPosition);
    player.object3D.rotation.z = Math.PI * 0.5;

    const initialPos = player.object3D.position.clone();
    const initialRot = player.object3D.rotation.z;

    this.scheduler.add({
      id: "WakeUpSequence",
      duration: 1000,
      invokeFunction: (t) => {
        player.object3D.position.copy(initialPos).lerp(targetPlayerPos, t);
        player.object3D.position.y += Math.sin(t * Math.PI);
        player.object3D.rotation.z = initialRot * (1 - t) + targetPlayerRot * t;
      },
      invokeFunctionAtComplete: () => {
        store.dispatch(setCutsceneLocked(false));
        player.behaviors.physics.controlObject3D = true;
        store.dispatch(completeCutScene(GOT_OUT_OF_BED));
      }
    });
  };
}
