import { Object3D } from "three";

import { EntityAlignment, EntityProps } from "src/api/entity";
import { kInvPixelScale, kPixelScale } from "src/engine/constants/scaling";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import { getAsset, setAssetDependencies } from "src/engine/entity/decorators";
import * as stTypes from "src/entities/environment/sprites/spell-turret/turret";

export type SpellTurretProps = EntityProps & {};

@setAssetDependencies(() => ["spellTurret"])
export class SpellTurret extends CoreEntity {
  static type = "SpellTurret";
  public type = SpellTurret.type;
  public alignment = EntityAlignment.Environment;
  public object3D = new Object3D();
  public size = {
    width: 2.5,
    height: 2
  };

  private sprite = getAsset("spellTurret").getSprite<
    stTypes.sprite_layers,
    stTypes.sprite_animations
  >();

  private activated = false;
  private aimedUp = false;

  constructor(props: SpellTurretProps) {
    super(props);

    this.sprite.gotoAnimation("shoot_forward");
    this.sprite.center();
    this.sprite.gotoAnimation("activate");
    this.sprite.gotoAnimationFrame(0);
    this.sprite.setAnimationSpeed(0);
    this.sprite.setAnimationLooping(false);
    this.sprite.mesh.scale.set(kInvPixelScale, -kInvPixelScale, kInvPixelScale);
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
  step(ms: number) {
    super.step(ms);
    this.sprite.advance(ms);
  }
  public get canBindToVariable() {
    return true;
  }
  activate() {

  }
  deactivate() {

  }
  shoot() {
    
  }
  aim(up = false) {

  }
}
