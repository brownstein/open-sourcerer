import { Vector3 } from "three";

import {
  BaseEntityType,
  EntityBehavior,
  EntityLevelEvents,
  LevelAPI
} from "src/api/entity";

export type InteractionProvider = {
  position: Vector3;
  setFocused: (focused: boolean) => void;
  onInteract: () => void;
};

type CompatibleEntity = BaseEntityType<{}>;

export class InteractionConsumerBehavior
  implements EntityBehavior<CompatibleEntity>
{
  public type = "InteractionConsumer";

  private entityPosition?: Vector3;
  private interactionProviders = new Map<string, InteractionProvider>();
  private focusedInteraction?: string;

  init(entity: CompatibleEntity): InteractionConsumerBehavior {
    this.entityPosition = entity.position;
    return this;
  }

  attachToLevel(level: LevelAPI): void {
    level.on(EntityLevelEvents.Step, this.step);
  }

  detachFromLevel(level: LevelAPI): void {
    level.off(EntityLevelEvents.Step, this.step);
  }

  addInteraction(id: string, provider: InteractionProvider): void {
    this.interactionProviders.set(id, provider);
  }

  removeInteraction(id: string): void {
    this.interactionProviders.delete(id);
  }

  getCurrentInteractionProvider(): InteractionProvider | null {
    if (!this.focusedInteraction) return null;
    return this.interactionProviders.get(this.focusedInteraction) ?? null;
  }

  doInteraction(): void {
    if (!this.focusedInteraction) return;
    const provider = this.interactionProviders.get(this.focusedInteraction);
    if (!provider) return;
    provider.onInteract();
  }

  readonly step = (): void => {
    if (!this.entityPosition) return;

    let closestInteractionId: string | undefined = undefined;
    for (const [id, interaction] of this.interactionProviders) {
      if (!closestInteractionId) {
        closestInteractionId = id;
      } else {
        const currentClosest =
          this.interactionProviders.get(closestInteractionId);
        const currentDist = currentClosest?.position
          .clone()
          .sub(this.entityPosition)
          .lengthSq();
        if (currentDist === undefined) continue;
        const intDist = interaction.position
          .clone()
          .sub(this.entityPosition)
          .lengthSq();
        if (intDist < currentDist) closestInteractionId = id;
      }
    }

    if (
      this.focusedInteraction &&
      this.focusedInteraction !== closestInteractionId
    ) {
      const defocusInteractionProvider = this.interactionProviders.get(
        this.focusedInteraction
      );
      if (defocusInteractionProvider) {
        defocusInteractionProvider.setFocused(false);
      }
    }
    if (
      closestInteractionId !== undefined &&
      this.focusedInteraction !== closestInteractionId
    ) {
      const focusInteractionProvider =
        this.interactionProviders.get(closestInteractionId);
      if (focusInteractionProvider) {
        focusInteractionProvider.setFocused(true);
      }
    }
    this.focusedInteraction = closestInteractionId;
  };
}
