import { Object3D } from "three";
import { ThreeAseprite } from "three-aseprite";

import {
  BaseEntityType,
  EntityBehavior,
  EntityLifecycleEvents
} from "src/api/entity";

export const kBasicSpriteBehaviorType = "BasicSprite";

export type BasicSpriteBehaviorProps = {
  animationSpeed?: number;
};

export class BasicSpriteBehavior implements EntityBehavior {
  public type = kBasicSpriteBehaviorType;
  public object3D = new Object3D();
  public sprite?: ThreeAseprite;
  public animationSpeed: number = 1;
  protected entity?: BaseEntityType;
  constructor(props: BasicSpriteBehaviorProps) {
    this.animationSpeed = props.animationSpeed ?? this.animationSpeed;
  }
  setSprite(sprite: ThreeAseprite) {
    this.sprite = sprite;
    this.object3D.add(sprite.mesh);
  }
  init(entity: BaseEntityType) {
    this.entity = entity;
    this.entity.object3D?.add(this.object3D);
    this.entity.events.on(EntityLifecycleEvents.Step, (ms: number) =>
      this.step(ms)
    );
  }
  step(ms: number) {
    this.sprite?.animate(ms * this.animationSpeed);
  }
  destroy() {
    this.sprite?.dispose();
  }
}
