import { Color, Object3D, Vector2 } from "three";

import { EntityAlignment, EntityProps } from "src/api/entity";
import { SignalConnectionEvents } from "src/api/signal";
import { kInvPixelScale, kPixelScale } from "src/engine/constants/scaling";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import { getAsset, setAssetDependencies } from "src/engine/entity/decorators";
import { vector3To2 } from "src/engine/util/vecTypes";
import * as dsTypes from "src/entities/environment/sprites/docking-station/docking-station-types";
import { SignalConnectionBehavior } from "src/entities/shared/behaviors/SignalConnectionBehavior";

import { BeanBot, BeanBotEvents, isBeanBot } from "../npcs/bean-bot/BeanBot";
import {
  AreaSensorBehavior,
  AreaSensorEvents
} from "../shared/behaviors/AreaSensorBehavior";

export type BeanBotDockProps = EntityProps & {
  channel?: string;
  beanBotRadius?: number;
  shouldStartEnabled?: boolean;
};

@setAssetDependencies(() => ["dockingStation"])
export class BeanBotDock extends CoreEntity {
  static readonly type = "BeanBotDock";
  public readonly type = BeanBotDock.type;
  public readonly alignment = EntityAlignment.Environment;

  public object3D = new Object3D();
  public sprite = getAsset("dockingStation").getSprite<
    dsTypes.sprite_layers,
    dsTypes.sprite_animations
  >();

  public behaviors = {
    sensor: new AreaSensorBehavior(),
    signal: new SignalConnectionBehavior()
  };

  private readonly channel?: string;

  private isEnabled: boolean;

  private dockedBeanBot?: BeanBot;

  private readonly testingDisabledTint = new Color(0.5, 0.5, 0.5);
  private readonly testingDisabledOpacity = 0.25;

  constructor(props: BeanBotDockProps) {
    super(props);

    this.isEnabled = props.shouldStartEnabled ?? true;
    if (this.isEnabled) this.enable();
    else this.disable();

    this.size = {
      width: props.beanBotRadius ?? 5,
      height: props.beanBotRadius ?? 5
    };

    this.channel = props.channel;

    this.object3D.position
      .copy(this.position)
      .multiplyScalar(kPixelScale)
      .round()
      .multiplyScalar(kInvPixelScale);

    this.sprite.gotoAnimation("grounded");
    this.sprite.mesh.scale.multiplyScalar(kInvPixelScale);
    this.sprite.mesh.scale.y *= -1;
    this.sprite.center();

    this.object3D.add(this.sprite.mesh);

    this.behaviors.sensor.init(this);

    this.behaviors.signal.init(this);
    this.behaviors.signal.events.on(
      SignalConnectionEvents.SignalReceived,
      ({ signal }) => {
        if (signal.value) {
          this.enable();
          if (this.dockedBeanBot) this.dockedBeanBot.undock();
        } else this.disable();
      }
    );

    this.behaviors.sensor.events.on(
      AreaSensorEvents.EntityContact,
      (contactedEntity) => {
        if (!this.isEnabled || !isBeanBot(contactedEntity)) return;

        const centerOffset = new Vector2();
        centerOffset.copy(this.sprite.getLayerBounds("tracking").min);
        centerOffset.multiplyScalar(kInvPixelScale);
        centerOffset.y *= -1;
        contactedEntity.swapControlMethod(
          "dock",
          vector3To2(this.position).add(centerOffset)
        );

        contactedEntity.beanBotEvents.once(BeanBotEvents.Docked, () => {
          if (this.channel) this.level?.state.setValue(this.channel, true);
          this.behaviors.signal.transmit({ value: true });

          this.dockedBeanBot = contactedEntity;
        });

        contactedEntity.beanBotEvents.once(BeanBotEvents.UnDocked, () => {
          if (this.channel) this.level?.state.setValue(this.channel, false);
          this.behaviors.signal.transmit({ value: false });

          this.dockedBeanBot = undefined;
        });
      }
    );
  }

  enable(): void {
    this.isEnabled = true;

    this.sprite.setOpacity(1, true);
    this.sprite.clearLayerAdjustments();
  }

  disable(): void {
    this.isEnabled = false;

    this.sprite.setOpacity(this.testingDisabledOpacity, true);
    this.sprite.fadeAllLayers(this.testingDisabledTint, 1, true);
  }
}
