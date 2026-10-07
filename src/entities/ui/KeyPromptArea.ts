import { EntityLevelAPI } from "src/api/entity";
import { CoreEntity } from "src/engine/entity/CoreEntity";

import {
  InteractionProvider,
  PlayerAPI,
  isPlayerAPI
} from "../player/PlayerAPI";
import {
  AreaSensorBehavior,
  AreaSensorBehaviorProps,
  AreaSensorEvents
} from "../shared/behaviors/AreaSensorBehavior";
import { SignalConnectionBehavior } from "../shared/behaviors/SignalConnectionBehavior";
import { KeyboardKeyPrompt, KeyboardKeyPromptProps } from "./KeyboardKeyPrompt";

export type KeyPromptAreaProps = KeyboardKeyPromptProps &
  AreaSensorBehaviorProps & {
    fadeInDelayMs?: number;
    fadeOutDelayMs?: number;
    yOffset?: number;
    xOffset?: number;
    interactOnce?: boolean;
  };

export class KeyPromptArea extends CoreEntity implements InteractionProvider {
  static readonly type = "KeyPromptArea";
  public readonly type = KeyPromptArea.type;

  public behaviors: {
    sensor: AreaSensorBehavior;
    signal: SignalConnectionBehavior;
  };

  private readonly keyPromptEntity: KeyboardKeyPrompt;

  private readonly interactable: boolean;
  private readonly interactOnce: boolean;
  private hasInteracted = false;
  private nearPlayer?: PlayerAPI;

  private readonly fadeInId = "fadeIn";
  private readonly fadeOutId = "fadeOut";

  constructor(props: KeyPromptAreaProps) {
    super(props);

    const fadeInDelayMs = Math.max(0, props.fadeInDelayMs ?? 0);
    const fadeOutDelayMs = Math.max(0, props.fadeOutDelayMs ?? 0);
    const yOffset = props.yOffset ?? 0;
    const xOffset = props.xOffset ?? 0;

    this.interactable = props.key === "e";
    this.interactOnce = props.interactOnce ?? false;

    this.keyPromptEntity = new KeyboardKeyPrompt({
      position: {
        x: props.position.x + xOffset,
        y: props.position.y + yOffset,
        z: props.position.z
      },
      key: props.key,
      layerName: props.layerName
    });

    this.keyPromptEntity.fadeOut(0);

    this.behaviors = {
      sensor: new AreaSensorBehavior(props),
      signal: new SignalConnectionBehavior()
    };

    this.behaviors.sensor.init(this);
    this.behaviors.signal.init(this);

    this.behaviors.sensor.events.on(
      AreaSensorEvents.EntityContact,
      (contactedEntity) => {
        if (!isPlayerAPI(contactedEntity)) return;
        if (this.hasInteracted) return;

        if (this.interactable) {
          this.nearPlayer = contactedEntity;
          contactedEntity.addInteraction(this.id, this);
        }

        this.scheduler.cancel(this.fadeOutId);
        this.scheduler.add({
          id: this.fadeInId,
          duration: fadeInDelayMs,
          invokeFunctionAtComplete: () => {
            this.keyPromptEntity.fadeIn();
          }
        });
      }
    );

    this.behaviors.sensor.events.on(
      AreaSensorEvents.EntityContactEnd,
      (contactedEntity) => {
        if (!isPlayerAPI(contactedEntity)) return;

        if (this.nearPlayer === contactedEntity) {
          contactedEntity.removeInteraction(this.id);
          this.nearPlayer = undefined;
        }

        if (this.hasInteracted) return;

        this.scheduler.cancel(this.fadeInId);
        this.scheduler.add({
          id: this.fadeOutId,
          duration: fadeOutDelayMs,
          invokeFunctionAtComplete: () => {
            this.keyPromptEntity.fadeOut();
          }
        });
      }
    );
  }

  setFocused(): void {}

  onInteract(): void {
    if (this.hasInteracted) return;

    this.behaviors.signal.transmit({ value: true });

    if (!this.interactOnce) return;

    this.hasInteracted = true;
    this.scheduler.cancel(this.fadeInId);
    this.scheduler.cancel(this.fadeOutId);
    this.keyPromptEntity.markPressed();
    this.nearPlayer?.removeInteraction(this.id);
    this.nearPlayer = undefined;
  }

  attachToLevel(level: EntityLevelAPI): void {
    super.attachToLevel(level);

    level.addEntity(this.keyPromptEntity);
  }

  detachFromLevel(level: EntityLevelAPI): void {
    this.nearPlayer?.removeInteraction(this.id);
    this.nearPlayer = undefined;

    super.detachFromLevel(level);
  }
}
