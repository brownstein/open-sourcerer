import { Collider } from "@dimforge/rapier2d-compat";

import { EntityLevelAPI, EntityProps } from "src/api/entity";
import { createTypedEventEmitter } from "src/api/util";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import { selectQuestItemsMap } from "src/redux/inventory/selectors";
import { addItems } from "src/redux/shared/actions";
import { store } from "src/redux/store";

import { Player } from "../player/Player";
import { KeyboardKeyPrompt } from "../ui/KeyboardKeyPrompt";

export enum WoodPileEvents {
  GotWood = "GotWood"
}

export class WoodPile extends CoreEntity {
  static type = "WoodPile";
  public type = "WoodPile";

  public woodPileEvents = createTypedEventEmitter<{
    [WoodPileEvents.GotWood]: void;
  }>();

  private enabled = true;
  private focused = false;
  private sensor?: Collider;
  private nearPlayer?: Player;
  private focusPrompt?: KeyboardKeyPrompt;

  constructor(props: EntityProps) {
    super(props);

    this.setFocused = this.setFocused.bind(this);
    this.onInteract = this.onInteract.bind(this);
  }

  attachToLevel(level: EntityLevelAPI) {
    super.attachToLevel(level);

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

  detachFromLevel(level: EntityLevelAPI) {
    super.detachFromLevel(level);
    if (this.sensor) level.world.removeCollider(this.sensor, false);
    this.sensor = undefined;
  }

  step(ms: number) {
    super.step(ms);
    if (!this.sensor) return;
    let nearPlayer: Player | undefined;
    if (this.enabled) {
      this.level?.world.intersectionPairsWith(this.sensor, (collider2) => {
        const otherEntityId = this.level?.getEntityIdForCollider(
          collider2.handle
        );
        if (!otherEntityId) return;
        const otherEntity = this.level?.getEntity(otherEntityId);
        if (!otherEntity) return;
        if (
          otherEntity.type !== Player.type ||
          !(otherEntity instanceof Player)
        )
          return;
        nearPlayer = otherEntity;
      });
    }
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
    if (selectQuestItemsMap(store.getState())["Log"]) return;
    this.woodPileEvents.emit(WoodPileEvents.GotWood);
    store.dispatch(addItems({ item: { type: "Log" } }));
    this.disable();
  }

  enable() {
    this.enabled = true;
  }
  disable() {
    this.enabled = false;
  }
}
