import { Collider } from "@dimforge/rapier2d-compat";
import { Object3D } from "three";

import { EntityLevelAPI, EntityLevelEvents, EntityProps } from "src/api/entity";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import { setConsumerDependencies } from "src/engine/entity/decorators";
import { getNextLevelIdForDoorTransition } from "src/levels/levels/levelAdjacencies";
import { selectLevelTransitionData } from "src/redux/gameState/selectors";
import { gotoLevel } from "src/redux/gameState/slice";
import { store } from "src/redux/store";

import { Player } from "../player/Player";
import {
  InteractionProvider,
  PlayerAPI,
  isPlayerAPI
} from "../player/PlayerAPI";
import { KeyboardKeyPrompt } from "../ui/KeyboardKeyPrompt";

export type DoorwayProps = EntityProps & {
  doorId?: string;
  toLevel?: string;
};

@setConsumerDependencies(() => [Player])
export class Doorway extends CoreEntity implements InteractionProvider {
  static type = "Doorway";
  public type = "Doorway";
  public object3D = new Object3D();
  public doorId?: string;
  public toLevel?: string;

  private focused = false;
  private sensor?: Collider;
  private nearPlayer?: PlayerAPI;
  private focusPrompt?: KeyboardKeyPrompt;
  private attachedLevel?: EntityLevelAPI;

  constructor(props: DoorwayProps) {
    super(props);
    this.doorId = props.doorId;
    this.toLevel = props.toLevel;

    this.setFocused = this.setFocused.bind(this);
    this.onInteract = this.onInteract.bind(this);
  }

  attachToLevel(level: EntityLevelAPI) {
    super.attachToLevel(level);
    this.attachedLevel = level;
    level.on(EntityLevelEvents.PreloadComplete, this.onPreloadComplete);

    // Add sensor to detect player.
    // TODO: standardize this logic in a behavior.
    const { ColliderDesc } = level.rapier;
    const colliderDesc = ColliderDesc.cuboid(
      this.size.width * 0.5,
      this.size.height * 0.5
    )
      .setTranslation(this.position.x, this.position.y)
      .setSensor(true);
    this.sensor = level.world.createCollider(colliderDesc);
    level.registerSensor(this.id, this.sensor.handle);
  }
  detachFromLevel(level: EntityLevelAPI): void {
    super.detachFromLevel(level);
    level.off(EntityLevelEvents.PreloadComplete, this.onPreloadComplete);
    this.attachedLevel = undefined;
    if (this.sensor) level.world.removeCollider(this.sensor, false);
    this.sensor = undefined;
  }
  private readonly onPreloadComplete = (): void => {
    const level = this.attachedLevel;
    if (!level) return;
    const transitionDetails = selectLevelTransitionData(store.getState());
    if (!transitionDetails.levelTransitionDoorName) return;
    // On preload, warp the player to this position if they came through this doorway.
    let player = [...level.getEntities().values()].find(isPlayerAPI);
    if (!player) {
      player = new Player({
        position: this.position.clone()
      });
      level.addEntity(player);
    }
    const tpPosition = this.position.clone();
    tpPosition.y -= this.size.height / 2;
    tpPosition.y += player.size.height / 2;
    player.teleport?.(tpPosition);
  };
  step(ms: number) {
    super.step(ms);
    if (!this.sensor) return;
    let nearPlayer: Player | undefined;
    this.level?.world.intersectionPairsWith(this.sensor, (collider2) => {
      const otherEntityId = this.level?.getEntityIdForCollider(
        collider2.handle
      );
      if (!otherEntityId) return;
      const otherEntity = this.level?.getEntity(otherEntityId);
      if (!otherEntity) return;
      if (otherEntity.type !== Player.type || !(otherEntity instanceof Player))
        return;
      nearPlayer = otherEntity;
    });
    if (nearPlayer !== this.nearPlayer) {
      if (nearPlayer) {
        this.nearPlayer = nearPlayer;
        this.nearPlayer.addInteraction(this.id, this);
      } else {
        this.setFocused(false);
        this.nearPlayer?.removeInteraction(this.id);
        this.nearPlayer = undefined;
      }
    }
  }
  setFocused(focused: boolean) {
    if (focused !== this.focused) {
      if (focused) {
        const promptPos = this.position.clone();
        promptPos.y += 1.5;
        const prompt = new KeyboardKeyPrompt({ position: promptPos, key: "e" });
        this.level?.addEntity(prompt);
        this.focusPrompt = prompt;
      } else {
        if (this.focusPrompt) this.level?.removeEntity(this.focusPrompt.id);
        this.focusPrompt = undefined;
      }
    }
    this.focused = focused;
  }
  onInteract() {
    if (!this.nearPlayer) return;
    if (this.toLevel) {
      store.dispatch(
        gotoLevel({
          levelId: this.toLevel,
          doorName: this.doorId ?? "default"
        })
      );
    } else if (this.doorId) {
      const levelId = this.level?.id;
      if (!levelId) return;
      const [nextLevelId] =
        getNextLevelIdForDoorTransition(levelId, this.doorId) ?? [];
      if (!nextLevelId) return;
      store.dispatch(
        gotoLevel({
          levelId: nextLevelId,
          doorName: this.doorId ?? "defualt"
        })
      );
    }
  }
}
