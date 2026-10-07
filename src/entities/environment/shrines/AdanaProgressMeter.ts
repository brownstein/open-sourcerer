import { ProtoSpriteThree } from "protosprite-three";
import { Color, Object3D, Vector2 } from "three";

import { EntityProps } from "src/api/entity";
import { kInvPixelScale, kPixelScale } from "src/engine/constants/scaling";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import { getAsset, setAssetDependencies } from "src/engine/entity/decorators";
import * as adanaTypes from "src/entities/npcs/adana/sprites/adana_v6_bird";
import { PartialDisplayEffect } from "src/entities/shared/graphics/coalesce/PartialDisplayEffect";

@setAssetDependencies(() => ["adanaBirdSprite"])
export class AdanaProgressMeter extends CoreEntity {
  static type = "AdanaProgressMeter";
  public type = AdanaProgressMeter.type;

  public object3D = new Object3D();

  private sprite = getAsset("adanaBirdSprite").getSprite<
    adanaTypes.sprite_layers,
    adanaTypes.sprite_animations
  >();
  private effectSprite = this.sprite.clone();
  private effect = new PartialDisplayEffect({
    target: this.effectSprite.mesh,
    cols: 64,
    rows: 32,
    spread: new Vector2(0.5, 0.1),
    fractionSpread: 0.05
  });
  private scale = 2;

  constructor(props: EntityProps) {
    super(props);
    this.object3D.position
      .copy(this.position)
      .multiplyScalar(kPixelScale)
      .round()
      .multiplyScalar(kInvPixelScale);

    this.sprite.gotoAnimation("Fly");
    this.sprite.center();
    this.sprite.mesh.scale.multiplyScalar(kInvPixelScale * this.scale);
    this.sprite.mesh.scale.y *= -1;
    this.sprite.mesh.position.z -= 0.02;
    this.sprite.setOpacity(0, false);
    this.sprite.outlineAllLayers(1, new Color(0.2, 0.8, 1), 1);
    this.object3D.add(this.sprite.mesh);

    this.effectSprite.gotoAnimation("Fly");
    this.effectSprite.center();
    this.effectSprite.fadeAllLayers(new Color(1, 1, 1), 0.5);
    this.effectSprite.multiplyAllLayers(new Color(0, 0.25, 0.5), 0.5);
    this.effectSprite.mesh.scale.multiplyScalar(kInvPixelScale * this.scale);
    this.effectSprite.mesh.scale.y *= -1;

    this.object3D.add(this.effect.object3D);
  }
  destroy(): void {
    super.destroy();
    this.sprite.dispose();
    this.effectSprite.dispose();
    this.effect.destroy();
  }
  step(ms: number) {
    super.step(ms);
    this.effect.step(ms);
  }
  setProgress(progress: number) {
    this.effect.setFraction(progress);
  }
}
