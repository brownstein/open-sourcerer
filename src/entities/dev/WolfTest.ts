import { ProtoSpriteSheetThree, ProtoSpriteThree } from "protosprite-three";
import { Color, Object3D } from "three";

import { BaseEntityType, EntityProps } from "src/api/entity";
import { kInvPixelScale, kPixelScale } from "src/engine/constants/scaling";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import { addResourceLoader, getResource } from "src/engine/entity/decorators";
import { ProtoSpriteLoader } from "src/engine/loader/Loaders";

import wolf from "./sprites/wolf.prs";
import * as wolfTypes from "./sprites/wolf_types";

export type WolfTestProps = EntityProps & {
  furColor1?: string;
  furColor2?: string;
  shirtColor?: string;
  pantsColor?: string;
  beltColor?: string;
  shoeColor?: string;
};

@addResourceLoader(new ProtoSpriteLoader("wolfSheet", wolf))
export class WolfTest extends CoreEntity implements BaseEntityType {
  static type = "WolfTest";
  public type = "WolfTest";

  public object3D = new Object3D();

  private sprite: ProtoSpriteThree<
    wolfTypes.sprite_layers,
    wolfTypes.sprite_animations
  >;
  constructor(props: WolfTestProps) {
    super(props);
    const sheet = getResource<ProtoSpriteSheetThree>(WolfTest, "wolfSheet");
    this.sprite = sheet.getSprite() as typeof this.sprite;
    this.sprite.center();
    this.sprite.mesh.scale.multiplyScalar(kInvPixelScale);
    this.sprite.mesh.scale.y *= -1;

    const white = new Color(0xffffff);
    const black = new Color(0x2222);
    const furColor1 = new Color(props.furColor1);
    const furColor2 = new Color(props.furColor2);
    const shirtColor = new Color(props.shirtColor);
    const pantsColor = new Color(props.pantsColor);
    const beltColor = new Color(props.beltColor);
    const shoeColor = new Color(props.shoeColor);

    this.sprite.multiplyLayers(furColor1, 1, "fur_light");
    this.sprite.multiplyLayers(
      furColor1.clone().lerp(furColor2, 0.8),
      1,
      "fur_medium"
    );
    this.sprite.multiplyLayers(furColor2, 1, "fur_dark");
    this.sprite.multiplyLayers(shirtColor, 1, "shirt");
    this.sprite.multiplyLayers(pantsColor, 1, "pants");
    this.sprite.multiplyLayers(beltColor, 1, ["belt", "gloves"]);
    this.sprite.multiplyLayers(shoeColor, 1, "shoes");
    this.sprite.multiplyLayers(
      shoeColor.clone().lerp(white, 0.5),
      1,
      "shoes_laces"
    );
    this.sprite.multiplyLayers(black, 1, "nose");

    this.sprite.setOpacity(props.opacity ?? 1);
    this.sprite.update();

    this.object3D.add(this.sprite.mesh);
    this.object3D.position
      .copy(this.position)
      .multiplyScalar(kPixelScale)
      .round()
      .multiplyScalar(kInvPixelScale);
  }
  destroy(): void {
    super.destroy();
    this.sprite.dispose();
  }
}
