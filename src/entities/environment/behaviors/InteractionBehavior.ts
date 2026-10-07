import { Collider } from "@dimforge/rapier2d-compat";
import { Vector3 } from "three";

import {
  BaseEntityType,
  EntityBehavior,
  EntityLevelAPI,
  EntityLifecycleEvents
} from "src/api/entity";
import { createTypedEventEmitter } from "src/api/util";
import {
  InteractionProvider,
  PlayerAPI,
  isPlayerAPI
} from "src/entities/player/PlayerAPI";
import { KeyboardKeyPrompt } from "src/entities/ui/KeyboardKeyPrompt";

export enum InteractionProviderEvents {
  SetFocused = "SetFocused",
  Interact = "Interact",
  IntersectingPlayer = "IntersectingPlayer"
}

export type InterationProviderEventTypes = {
  [InteractionProviderEvents.SetFocused]: boolean;
  [InteractionProviderEvents.Interact]: PlayerAPI;
  [InteractionProviderEvents.IntersectingPlayer]: PlayerAPI;
};

// Standardized player interactivity with objects.
export class InteractionBehavior
  implements EntityBehavior, InteractionProvider
{
  public readonly type = "InteractionBehavior";
  public events = createTypedEventEmitter<InterationProviderEventTypes>();
  public enabled = true;
  public hasBeenInteractedWith = false;
  public promptYOffset?: number;

  private entity?: BaseEntityType;
  private focused = false;
  private level?: EntityLevelAPI;
  private sensor?: Collider;
  private nearPlayer?: PlayerAPI;
  private focusPrompt?: KeyboardKeyPrompt;
  private wasInteractedWithMarker = false;

  init(entity: BaseEntityType) {
    this.entity = entity;
    this.entity.events.on(EntityLifecycleEvents.Step, this.step.bind(this));
    return this;
  }
  attachToLevel(level: EntityLevelAPI) {
    if (!this.entity) return;
    this.level = level;
    const { ColliderDesc } = level.rapier;
    const colliderDesc = ColliderDesc.cuboid(
      this.entity.size.width * 0.5,
      this.entity.size.height * 0.5
    )
      .setTranslation(this.entity.position.x, this.entity.position.y)
      .setSensor(true);
    this.sensor = level.world.createCollider(colliderDesc);
    level.registerSensor(this.entity.id, this.sensor.handle);
  }
  detachFromLevel() {
    if (this.focusPrompt) this.level?.removeEntity(this.focusPrompt.id);
    if (this.sensor) this.level?.world.removeCollider(this.sensor, true);
    this.sensor = undefined;
    this.level = undefined;
  }
  step() {
    if (!this.entity || !this.sensor || !this.level) return;

    this.hasBeenInteractedWith = this.wasInteractedWithMarker;
    this.wasInteractedWithMarker = false;

    this.sensor.setTranslation({
      x: this.entity.position.x,
      y: this.entity.position.y
    });
    let nearPlayer: PlayerAPI | undefined;
    if (this.enabled) {
      this.level.world.intersectionPairsWith(this.sensor, (collider2) => {
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
        this.nearPlayer.addInteraction(this.entity.id, this);
      } else {
        this.setFocused(false);
        this.nearPlayer?.removeInteraction(this.entity.id);
        this.nearPlayer = undefined;
      }
    }
    if (nearPlayer) {
      this.events.emit(
        InteractionProviderEvents.IntersectingPlayer,
        nearPlayer
      );
    }
  }
  get position() {
    if (!this.entity) return new Vector3();
    return this.entity.position;
  }
  setFocused(focused: boolean) {
    if (!this.entity) return;
    if (focused !== this.focused) {
      this.focused = focused;
      this.events.emit(InteractionProviderEvents.SetFocused, focused);
      if (focused) {
        const promptPos = this.entity.position.clone();
        promptPos.y +=
          this.promptYOffset ?? this.entity.size.height * 0.5 + 0.75;
        const prompt = new KeyboardKeyPrompt({ position: promptPos, key: "e" });
        this.level?.addEntity(prompt);
        this.focusPrompt = prompt;
      } else {
        if (this.focusPrompt) this.level?.removeEntity(this.focusPrompt.id);
        this.focusPrompt?.destroy();
        this.focusPrompt = undefined;
      }
    }
  }
  onInteract() {
    if (!this.nearPlayer) return;
    this.events.emit(InteractionProviderEvents.Interact, this.nearPlayer);
    this.wasInteractedWithMarker = true;
  }
  enable() {
    this.enabled = true;
    return this;
  }
  disable() {
    this.enabled = false;
    return this;
  }
}
