import { ProtoSpriteThree } from "protosprite-three";
import { Color, Object3D, Vector2 } from "three";

import { EntityLevelAPI, EntityLevelEvents, EntityProps } from "src/api/entity";
import { createTypedEventEmitter } from "src/api/util";
import { kInvPixelScale, kPixelScale } from "src/engine/constants/scaling";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import {
  getAsset,
  setConsumerDependencies
} from "src/engine/entity/decorators";
import { getPlayer } from "src/engine/util/levelUtil";
import { selectCharacterCustomization } from "src/redux/status/selectors";
import { store } from "src/redux/store";

import { CoalesceEffect } from "../shared/graphics/coalesce/CoaleseEffect";
import { Player } from "./Player";
import {
  PlayerCoalesceEventTypes,
  PlayerCoalesceEvents
} from "./PlayerCoalesce";
import {
  PlayerAnimation,
  PlayerLayer,
  customizePlayerSprite,
  playerLayerTypes
} from "./PlayerInternals";

@setConsumerDependencies(() => [Player])
export class PlayerShrineCoalesce extends CoreEntity {
  static type = "PlayerShrineCoalesce";
  public type = PlayerShrineCoalesce.type;
  public persist = false;

  public events = createTypedEventEmitter<PlayerCoalesceEventTypes>();

  public object3D = new Object3D();
  private sprite: ProtoSpriteThree<PlayerLayer, PlayerAnimation>;

  private effectDuration = 1000;
  private coalesceEffect: CoalesceEffect;

  private attachedLevel?: EntityLevelAPI;

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
      .gotoAnimation("idle")
      .fadeAllLayers(new Color(11 / 256, 12 / 256, 15 / 256), 1, false)
      .outlineAllLayers(1, new Color(0x44ccff), 1, true);

    this.coalesceEffect = new CoalesceEffect({
      target: this.sprite.mesh,
      rows: 50,
      cols: 34,
      duration: this.effectDuration,
      spread: 2
    });
    this.object3D.add(this.coalesceEffect.object3D);

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
          if (!level) return;

          // Raycast downward to find the actual floor surface so the Player's
          // physics body is placed flush with the ground.  Without this, the
          // Tiled-authored position may overlap or hover above terrain, causing
          // Rapier to correct the body on the first physics step (visible as a
          // positional glitch).
          const spawnPosition = this.position.clone();
          const playerHalfHeight = 52 * kInvPixelScale * 0.5;
          const ray = new level.rapier.Ray(
            { x: this.position.x, y: this.position.y },
            { x: 0, y: -1 }
          );
          const hit = level.world.castRay(
            ray,
            5,
            true,
            undefined,
            undefined,
            undefined,
            undefined,
            (collider) => !collider.isSensor()
          );
          if (hit !== null) {
            const floorY = this.position.y - hit.timeOfImpact;
            spawnPosition.y = floorY + playerHalfHeight;
          }

          const player = new Player({
            ...this.initialProps,
            position: spawnPosition
          });
          player.behaviors.physicsControl.setGrounded();
          level.removeEntity(this.id);
          level.addEntity(player);
          level.cameraDirector.sendLookAtEntityRequest(
            player,
            {
              lookaheadDistance: 0
            },
            0
          );

          level.state.setValue("fadeInComplete", true);
          this.events.emit(PlayerCoalesceEvents.PlayerSpawned, player);
          this.destroy();
        }
      });
    });
  }

  attachToLevel(level: EntityLevelAPI): void {
    super.attachToLevel(level);
    this.attachedLevel = level;
    level.once(EntityLevelEvents.PreloadComplete, this.onPreloadComplete);
    level.once(EntityLevelEvents.Step, this.onFirstStep);
  }

  detachFromLevel(level: EntityLevelAPI): void {
    level.off(EntityLevelEvents.PreloadComplete, this.onPreloadComplete);
    level.off(EntityLevelEvents.Step, this.onFirstStep);
    this.attachedLevel = undefined;
    super.detachFromLevel(level);
  }

  private readonly onPreloadComplete = (): void => {
    const level = this.attachedLevel;
    if (!level) return;
    level.cameraDirector.sendLookAtEntityRequest(
      this,
      {
        lookaheadDistance: 0,
        size: new Vector2(12, 12)
      },
      0
    );
  };

  private readonly onFirstStep = (): void => {
    const level = this.attachedLevel;
    if (!level) return;
    if (getPlayer(level)) {
      level.cameraDirector.removeLookAtEntityRequest(this);
      level.removeEntity(this.id);
      return;
    }
  };

  step(ms: number) {
    super.step(ms);
    this.coalesceEffect.step(ms);
  }

  destroy(): void {
    super.destroy();
    this.sprite.dispose();
    this.coalesceEffect.destroy();
  }
}
