import { ProtoSpriteSheetThree } from "protosprite-three";
import { Color, Object3D } from "three";

import {
  BaseEntityType,
  EntityLifecycleEventTypes,
  EntityProps
} from "src/api/entity";
import { createTypedEventEmitter } from "src/api/util";
import { kInvPixelScale, kPixelScale } from "src/engine/constants/scaling";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import { addResourceLoader, getResource } from "src/engine/entity/decorators";
import { ProtoSpriteLoader } from "src/engine/loader/Loaders";

import {
  InteractionBehavior,
  InteractionProviderEvents
} from "../behaviors/InteractionBehavior";
import shrineTerminalPrs from "./sprites/control_panel.prs";

export enum ShrineTerminalEvents {
  Activate = "Activate"
}

export type ShrineTerminalEventTypes = EntityLifecycleEventTypes & {
  [ShrineTerminalEvents.Activate]: void;
};

export type ShrineTerminalProps = EntityProps & {};

@addResourceLoader(
  new ProtoSpriteLoader("ShrineTerminalSheet", shrineTerminalPrs)
)
export class ShrineTerminal extends CoreEntity implements BaseEntityType {
  static type = "ShrineTerminal";
  public type = ShrineTerminal.type;

  public events = createTypedEventEmitter<ShrineTerminalEventTypes>();

  public object3D = new Object3D();

  public behaviors = {
    interaction: new InteractionBehavior()
  };

  private sprite = getResource<ProtoSpriteSheetThree>(
    ShrineTerminal,
    "ShrineTerminalSheet"
  ).getSprite();

  constructor(props: ShrineTerminalProps) {
    super(props);

    this.object3D.position
      .copy(this.position)
      .multiplyScalar(kPixelScale)
      .round()
      .multiplyScalar(kInvPixelScale);
    this.object3D.add(this.sprite.mesh);

    this.sprite.center();
    this.sprite.mesh.scale.multiplyScalar(kInvPixelScale);
    this.sprite.mesh.scale.y *= -1;
    this.sprite.mesh.position.z -= 0.5;

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
      () => {
        this.events.emit(ShrineTerminalEvents.Activate);
      }
    );
  }
  step(ms: number) {
    super.step(ms);
    this.sprite.advance(ms);
  }
  destroy() {
    super.destroy();
    this.sprite.dispose();
  }
}
