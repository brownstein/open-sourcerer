import { Collider } from "@dimforge/rapier2d-compat";
import { Object3D } from "three";

import { EntityLevelAPI, EntityProps } from "src/api/entity";
import { createTypedEventEmitter } from "src/api/util";
import { CoreEntity } from "src/engine/entity/CoreEntity";

import {
  InteractionProvider,
  PlayerAPI,
  isPlayerAPI
} from "../player/PlayerAPI";
import { KeyboardKeyPrompt } from "../ui/KeyboardKeyPrompt";

export type EmbeddedDoorwayProps = EntityProps & {};

export enum EmbeddedDoorEvents {
  Use = "Use"
}

export type EmbeddedDoorEventTypes = {
  [EmbeddedDoorEvents.Use]: void;
};

export class EmbeddedDoorway extends CoreEntity implements InteractionProvider {
  static type = "EmbeddedDoorway";
  public type = "EmbeddedDoorway";
  public object3D = new Object3D();

  public doorEvents = createTypedEventEmitter<EmbeddedDoorEventTypes>();

  private enabled = true;
  private focused = false;
  private sensor?: Collider;
  private inConversationUnsub?: () => void;
  private nearPlayer?: PlayerAPI;
  private focusPrompt?: KeyboardKeyPrompt;

  constructor(props: EmbeddedDoorwayProps) {
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

    // Don't open door while in a conversation.
    this.inConversationUnsub = this.level?.state.subValue(
      "inConversation",
      (inConversation) => {
        this.enabled = !inConversation;
      }
    );
  }
  detachFromLevel(level: EntityLevelAPI): void {
    super.detachFromLevel(level);
    if (this.sensor) level.world.removeCollider(this.sensor, false);
    this.sensor = undefined;
    this.inConversationUnsub?.();
    this.inConversationUnsub = undefined;
  }
  step(ms: number) {
    super.step(ms);
    if (!this.sensor) return;
    let nearPlayer: PlayerAPI | undefined;
    if (this.enabled) {
      this.level?.world.intersectionPairsWith(this.sensor, (collider2) => {
        const otherEntityId = this.level?.getEntityIdForCollider(
          collider2.handle
        );
        if (!otherEntityId) return;
        const otherEntity = this.level?.getEntity(otherEntityId);
        if (!otherEntity || !isPlayerAPI(otherEntity)) return;
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
    this.doorEvents.emit(EmbeddedDoorEvents.Use);
  }
  enable() {
    this.enabled = true;
  }
  disable() {
    this.enabled = false;
  }
}
