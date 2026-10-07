import { ProtoSpriteThree } from "protosprite-three";
import { Color, Object3D } from "three";

import { CameraRequestPriority } from "src/api/camera";
import {
  EntityLevelAPI,
  EntityLifecycleEventTypes,
  EntityProps
} from "src/api/entity";
import { createTypedEventEmitter } from "src/api/util";
import { kInvPixelScale, kPixelScale } from "src/engine/constants/scaling";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import {
  getAsset,
  setConsumerDependencies
} from "src/engine/entity/decorators";
import { selectCharacterCustomization } from "src/redux/status/selectors";
import { store } from "src/redux/store";

import { CoalesceEffect } from "../shared/graphics/coalesce/CoaleseEffect";
import { Player } from "./Player";
import {
  PlayerAnimation,
  PlayerLayer,
  customizePlayerSprite,
  playerLayerTypes
} from "./PlayerInternals";

export enum PlayerCoalesceEvents {
  PlayerSpawned = "PlayerSpawned"
}

export type PlayerCoalesceEventTypes = EntityLifecycleEventTypes & {
  [PlayerCoalesceEvents.PlayerSpawned]: Player;
};

@setConsumerDependencies(() => [Player])
export class PlayerCoalesce extends CoreEntity {
  static type = "PlayerCoalesce";
  public type = PlayerCoalesce.type;

  public events = createTypedEventEmitter<PlayerCoalesceEventTypes>();

  public object3D = new Object3D();
  private sprite: ProtoSpriteThree<PlayerLayer, PlayerAnimation>;
  private lowerSprite: ProtoSpriteThree<PlayerLayer, PlayerAnimation>;

  private coalesceEffect: CoalesceEffect;

  constructor(props: EntityProps) {
    super(props);

    const playerCustomization = selectCharacterCustomization(store.getState());
    const sprites = customizePlayerSprite(
      {
        wolfMale: getAsset("wolfMaleSprite"),
        wolfFemale: getAsset("wolfFemaleSprite")
      },
      playerCustomization
    );
    this.sprite = sprites.upperSprite;
    this.lowerSprite = sprites.lowerSprite;
    this.sprite.showLayers(
      ...(Object.keys(playerLayerTypes) as Iterable<PlayerLayer>)
    );
    this.sprite.setLayerOpacity(0, ["engine"]);

    this.object3D.position
      .copy(this.position)
      .multiplyScalar(kPixelScale)
      .round()
      .multiplyScalar(kInvPixelScale);

    this.sprite
      .gotoAnimation("reach_peak")
      .gotoAnimationFrame(2)
      .fadeAllLayers(new Color(11 / 256, 12 / 256, 15 / 256), 1, false)
      .outlineAllLayers(1, new Color(0x44ccff), 1, true);

    this.coalesceEffect = new CoalesceEffect({
      target: this.sprite.mesh,
      rows: 50,
      cols: 34,
      duration: 5000,
      spread: 2
    });
    this.object3D.add(this.coalesceEffect.object3D);

    this.scheduler.add({
      duration: 5000,
      invokeFunction: (t) => {
        this.object3D.rotation.z = (1 - t) ** 2 * Math.PI * 2;
        this.object3D.scale.set(2 - t, 2 - t, 1);
      }
    });

    this.coalesceEffect.deferredEvents.on("done", () => {
      this.object3D.clear();
      this.object3D.add(this.sprite.mesh);
      this.scheduler.add({
        duration: 500,
        invokeFunction: (t) => {
          const fadeAmount = (1 - t) * 0.5;
          const color = new Color(0x111111);
          color.lerp(new Color(0x44ccff), 2 * (0.5 - Math.abs(0.5 - t)));
          this.sprite.fadeAllLayers(color, fadeAmount * 2, false);
          this.sprite.outlineAllLayers(1, new Color(0x44ccff), fadeAmount * 2);
        },
        invokeFunctionAtComplete: async () => {
          const level = this.level;
          const player = new Player({ ...this.initialProps, falling: true });
          if (!player) return;
          level?.removeEntity(this.id);
          level?.addEntity(player);
          level?.cameraDirector.sendLookAtEntityRequest(
            player,
            {
              lookaheadDistance: 0
            },
            0
          );

          player.getScheduler().add({
            duration: 1000,
            invokeFunctionAtComplete: () => {
              level?.state.setValue("fadeInComplete", true);
              this.events.emit(PlayerCoalesceEvents.PlayerSpawned, player);
            }
          });
          this.destroy();
        }
      });
    });
  }

  async attachToLevel(level: EntityLevelAPI): Promise<void> {
    super.attachToLevel(level);

    level.cameraDirector.sendLookAtEntityRequest(
      this,
      {
        lookaheadDistance: 0
      },
      0
    );

    const { size } = level.cameraDirector.getCurrentProperties();

    level.cameraDirector.sendRequest({
      id: this.id,
      priority: CameraRequestPriority.SCRIPTED,
      subPriority: 999,
      size: size.multiplyScalar(0.25),
      influence: 1
    });

    await level.cameraDirector.lerpRequestInfluence(this.id, 0, 5000, 0);
    level.cameraDirector.removeRequests(this.id);
  }

  step(ms: number) {
    super.step(ms);
    this.coalesceEffect.step(ms);
  }

  destroy(): void {
    super.destroy();
    this.sprite.dispose();
    this.lowerSprite.dispose();
    this.coalesceEffect.destroy();
  }
}
