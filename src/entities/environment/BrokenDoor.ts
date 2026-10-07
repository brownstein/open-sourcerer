import { ProtoSpriteSheetThree, ProtoSpriteThree } from "protosprite-three";
import { Object3D } from "three";

import { EntityProps } from "src/api/entity";
import { createTypedEventEmitter } from "src/api/util";
import { kInvPixelScale, kPixelScale } from "src/engine/constants/scaling";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import { addResourceLoader, getResource } from "src/engine/entity/decorators";
import { ProtoSpriteLoader } from "src/engine/loader/Loaders";

import bigDoorFrontPrs from "./sprites/doors/big-door-front/big-door-front.prs";
import * as brokenDoorTypes from "./sprites/doors/broken-door-types";
import smallDoorRightPrs from "./sprites/doors/small-door-right/small-door-right.prs";

type BrokenDoorVariant = "bigFront" | "smallRight";
export type BrokenDoorProps = EntityProps & {
  variant?: BrokenDoorVariant;
};

@addResourceLoader(new ProtoSpriteLoader("bigDoorFrontSheet", bigDoorFrontPrs))
@addResourceLoader(
  new ProtoSpriteLoader("smallDoorRightSheet", smallDoorRightPrs)
)
export class BrokenDoor extends CoreEntity {
  static type = "BrokenDoor";
  public type = BrokenDoor.type;
  public object3D = new Object3D();
  public doorEvents = createTypedEventEmitter<{
    openingSequenceDone: void;
  }>();

  private sprite: ProtoSpriteThree<
    brokenDoorTypes.sprite_layers,
    brokenDoorTypes.sprite_animations
  >;

  constructor(props: BrokenDoorProps) {
    super(props);

    const variant = props.variant ?? "bigFront";
    switch (variant) {
      case "bigFront":
        this.sprite = getResource<ProtoSpriteSheetThree>(
          BrokenDoor,
          "bigDoorFrontSheet"
        ).getSprite<
          brokenDoorTypes.sprite_layers,
          brokenDoorTypes.sprite_animations
        >();

        break;
      case "smallRight":
        this.sprite = getResource<ProtoSpriteSheetThree>(
          BrokenDoor,
          "smallDoorRightSheet"
        ).getSprite<
          brokenDoorTypes.sprite_layers,
          brokenDoorTypes.sprite_animations
        >();

        break;
    }

    this.sprite.gotoAnimation("open_broken");
    this.sprite.setAnimationSpeed(0);

    this.sprite.center();
    this.sprite.mesh.scale.setY(-1).multiplyScalar(kInvPixelScale);
    this.object3D.add(this.sprite.mesh);
    this.object3D.position
      .copy(this.position)
      .multiplyScalar(kPixelScale)
      .round()
      .multiplyScalar(kInvPixelScale);
  }
  step(ms: number) {
    super.step(ms);
    this.sprite.advance(ms);
  }
  destroy() {
    super.destroy();
    this.sprite.dispose();
  }
  runOpeningSequence() {
    this.sprite.setAnimationSpeed(1);
    this.sprite.events.on("animationLooped", () => {
      this.sprite.gotoAnimationFrame(0);
      this.sprite.setAnimationSpeed(0);
      this.doorEvents.emit("openingSequenceDone");
    });
  }
}
