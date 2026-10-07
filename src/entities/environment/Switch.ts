import { ProtoSpriteSheetThree, ProtoSpriteThree } from "protosprite-three";
import { Color, Object3D } from "three";

import { EntityProps } from "src/api/entity";
import { createTypedEventEmitter } from "src/api/util";
import { kInvPixelScale, kPixelScale } from "src/engine/constants/scaling";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import { addResourceLoader, getResource } from "src/engine/entity/decorators";
import { ProtoSpriteLoader } from "src/engine/loader/Loaders";

import {
  InteractionBehavior,
  InteractionProviderEvents
} from "./behaviors/InteractionBehavior";
import frontSwitchPrs from "./sprites/switches/front-switch/front-switch.prs";
import sideSwitchPrs from "./sprites/switches/side-switch/side-switch.prs";
import sideDiagonalSwitchPrs from "./sprites/switches/side-diagonal-switch/side-diagonal-switch.prs";
import * as switchTypes from "./sprites/switches/switch-types";

type SwitchVariant = "front" | "side" | "sideDiagonal";
export type SwitchProps = EntityProps & {
  variant?: SwitchVariant;
};

@addResourceLoader(new ProtoSpriteLoader("frontSwitch", frontSwitchPrs))
@addResourceLoader(new ProtoSpriteLoader("sideSwitch", sideSwitchPrs))
@addResourceLoader(new ProtoSpriteLoader("sideDiagonalSwitch", sideDiagonalSwitchPrs))
export class Switch extends CoreEntity {
  static type = "Switch";
  public type = Switch.type;
  public switchEvents = createTypedEventEmitter<{
    stateUpdated: boolean;
    stateUpdateCompleted: boolean;
  }>();

  public object3D = new Object3D();
  public behaviors = {
    interaction: new InteractionBehavior()
  };

  private sprite: ProtoSpriteThree<switchTypes.sprite_layers, switchTypes.sprite_animations>;
  private active = false;

  constructor(props: SwitchProps) {
    super(props);

    const variant: SwitchVariant = props.variant ?? "front";
    switch (variant) {
      case "front": {
        this.sprite = getResource<ProtoSpriteSheetThree>(
          Switch,
          "frontSwitch"
        ).getSprite<switchTypes.sprite_layers, switchTypes.sprite_animations>();

        break;
      }
      case "side": {
        this.sprite = getResource<ProtoSpriteSheetThree>(
          Switch,
          "sideSwitch"
        ).getSprite<switchTypes.sprite_layers, switchTypes.sprite_animations>();

        break;
      }
      case "sideDiagonal": {
        this.sprite = getResource<ProtoSpriteSheetThree>(
          Switch,
          "sideDiagonalSwitch"
        ).getSprite<switchTypes.sprite_layers, switchTypes.sprite_animations>();

        break;
      }
    }

    this.sprite.gotoAnimation("ofo");
    this.sprite.center();
    this.sprite.mesh.scale.setY(-1).multiplyScalar(kInvPixelScale);
    this.object3D.add(this.sprite.mesh);
    this.object3D.position
      .copy(this.position)
      .multiplyScalar(kPixelScale)
      .round()
      .multiplyScalar(kInvPixelScale);

    this.toggle = this.toggle.bind(this);

    this.behaviors.interaction.init(this);
    this.behaviors.interaction.events.on(
      InteractionProviderEvents.SetFocused,
      (focused) => {
        if (focused) {
          this.sprite.outlineAllLayers(1, new Color(0x44aaff), 1);
        } else {
          this.sprite.outlineAllLayers(0, new Color(0xffffff), 0);
        }
      }
    );
    this.behaviors.interaction.events.on(
      InteractionProviderEvents.Interact,
      this.toggle
    );
    this.sprite.events.on("animationLooped", () => {
      let isAnimated = false;
      switch (this.sprite.data.animationState.currentAnimation?.name) {
        case "on_an":
        case "off_an":
          isAnimated = true;
          break;
        default:
          break;
      }
      if (!isAnimated) return;
      this.switchEvents.emit("stateUpdateCompleted", this.active);
      if (this.active) {
        this.sprite.gotoAnimation("ono");
      } else {
        this.sprite.gotoAnimation("ofo");
      }
    });
  }
  step(ms: number) {
    super.step(ms);
    this.sprite.advance(ms);
  }
  destroy() {
    super.destroy();
    this.sprite.dispose();
  }
  toggle() {
    this.setActive(!this.active);
  }
  disableInteraction() {
    this.behaviors.interaction.disable();
  }
  setActive(active: boolean = true) {
    this.active = active;
    this.switchEvents.emit("stateUpdated", this.active);
    if (this.active) {
      if (this.sprite.data.animationState.currentAnimation?.name === "ono")
        return;
      this.sprite.gotoAnimation("on_an");
    } else {
      if (this.sprite.data.animationState.currentAnimation?.name === "ofo")
        return;
      this.sprite.gotoAnimation("off_an");
    }
  }
}
