import { ProtoSpriteThree } from "protosprite-three";
import { AdditiveBlending, Object3D, ShaderMaterial } from "three";

import {
  BaseEntityType,
  EntityLifecycleEventTypes,
  EntityProps
} from "src/api/entity";
import { createTypedEventEmitter } from "src/api/util";
import { kInvPixelScale, kPixelScale } from "src/engine/constants/scaling";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import { getAsset, setAssetDependencies } from "src/engine/entity/decorators";
import * as smallDoorTypes from "src/entities/environment/sprites/doors/small-door-right/small-door-right";

export type EchoDoorSpawnerProps = EntityProps & {};

export type EchoDoorSpawnerEventTypes = EntityLifecycleEventTypes & {
  spawnedEntity: BaseEntityType;
};

@setAssetDependencies(() => ["smallDoorRightSprite"])
export class EchoDoorSpawner extends CoreEntity {
  static type = "EchoDoorSpawner";
  public type = EchoDoorSpawner.type;
  public object3D = new Object3D();
  public events = createTypedEventEmitter<EchoDoorSpawnerEventTypes>();

  private sprite = getAsset("smallDoorRightSprite").getSprite<
    smallDoorTypes.sprite_layers,
    smallDoorTypes.sprite_animations
  >();
  private lightSprite: ProtoSpriteThree<
    smallDoorTypes.sprite_layers,
    smallDoorTypes.sprite_animations
  >;

  private currentlyOpen = false;
  private currentlyAnimatingOpenState = false;

  constructor(props: EchoDoorSpawnerProps) {
    super(props);

    this.sprite.gotoAnimation("closed");
    this.sprite.center();
    this.sprite.mesh.scale.set(
      -kInvPixelScale,
      -kInvPixelScale,
      kInvPixelScale
    );

    this.lightSprite = this.sprite.clone();
    this.lightSprite.mesh.scale.set(
      -kInvPixelScale,
      -kInvPixelScale,
      kInvPixelScale
    );
    this.lightSprite.mesh.position.z += 0.2;

    this.sprite.hideLayers("fx_lights");
    this.lightSprite.hideLayers("main");
    this.lightSprite.setLayerOpacity(
      0.25,
      ["r_red_light_left", "r_red_light_right"],
      false
    );
    this.lightSprite.setLayerOpacity(0.5, [
      "r_red_cross_left",
      "r_red_cross_right"
    ]);

    let lightMaterial = this.lightSprite.mesh.material as ShaderMaterial;
    lightMaterial = lightMaterial.clone();
    lightMaterial.blending = AdditiveBlending;
    this.lightSprite.mesh.material = lightMaterial;

    this.object3D.add(this.sprite.mesh);
    this.object3D.add(this.lightSprite.mesh);

    this.object3D.position
      .copy(this.position)
      .multiplyScalar(kPixelScale)
      .round()
      .multiplyScalar(kInvPixelScale);

    this.sprite.events.on(
      "animationLooped",
      this.animationReachedEnd.bind(this)
    );

    this.open();
  }
  destroy(): void {
    super.destroy();
    this.sprite.dispose();
    this.lightSprite.dispose();
    const lightSpriteMat = this.lightSprite.mesh.material as ShaderMaterial;
    lightSpriteMat.dispose();
  }
  step(ms: number) {
    super.step(ms);
    this.sprite.advance(ms);
    this.lightSprite.advance(ms);
  }
  open() {
    if (this.currentlyOpen) return;
    this.currentlyOpen = true;
    this.currentlyAnimatingOpenState = true;
    this.sprite.gotoAnimation("open_full");
    this.sprite.gotoAnimationFrame(0);
    this.sprite.setAnimationSpeed(1);
    this.sprite.setAnimationLooping(false);
    this.lightSprite.mesh.visible = true;
    this.lightSprite.gotoAnimation("open_full");
    this.lightSprite.gotoAnimationFrame(0);
    this.lightSprite.setAnimationSpeed(1);
    this.lightSprite.setAnimationLooping(false);
    this.sprite.showLayers("dust");
  }
  close() {
    if (!this.currentlyOpen) return;
    this.currentlyOpen = false;
    this.currentlyAnimatingOpenState = true;
    this.lightSprite.mesh.visible = false;
    this.sprite.gotoAnimation("open_full");
    this.sprite.gotoAnimationFrame(16);
    this.sprite.setAnimationSpeed(-1);
    this.sprite.setAnimationLooping(false);
    this.sprite.hideLayers("dust");
  }
  private animationReachedEnd() {
    if (!this.currentlyAnimatingOpenState) return;
    this.currentlyAnimatingOpenState = false;
    if (this.currentlyOpen) {
      this.sprite.gotoAnimation("open_full_loop");
      this.lightSprite.gotoAnimation("open_full_loop");
      this.sprite.gotoAnimationFrame(0);
      this.lightSprite.gotoAnimationFrame(0);
      this.sprite.setAnimationSpeed(1);
      this.lightSprite.setAnimationSpeed(1);
      this.sprite.setAnimationLooping(true);
      this.lightSprite.setAnimationLooping(true);
    } else {
      this.sprite.gotoAnimation("closed");
    }
  }
}
