import { Object3D, Texture } from "three";
import { ThreeAseprite } from "three-aseprite";

import { EntityAlignment, EntityProps } from "src/api/entity";
import { kInvPixelScale, kPixelScale } from "src/engine/constants/scaling";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import { addResourceLoader, getResource } from "src/engine/entity/decorators";
import { TextureResourceLoader } from "src/engine/loader/Loaders";
import { OutOfBoundsBehaviour } from "src/entities/shared/behaviors/OutOfBoundsBehaviour";

import gryphonWarriorJson from "./sprites/gryphon-warrior.json";
import gryphonWarriorPng from "./sprites/gryphon-warrior.png";

export type GryphonWarriorProps = EntityProps & {};

@addResourceLoader(
  new TextureResourceLoader("gryphonWarriorTexture", gryphonWarriorPng)
)
export class GryphonWarrior extends CoreEntity {
  static type = "GryphonWarrior";
  public type = "GryphonWarrior";
  public object3D = new Object3D();
  public alignment = EntityAlignment.Enemy;
  public size = {
    width: 1,
    height: 1.75
  };
  public behaviors = {
    outOfBounds: new OutOfBoundsBehaviour()
  };
  private sprite = new ThreeAseprite({
    sourceJSON: gryphonWarriorJson,
    texture: getResource<Texture>(GryphonWarrior, "gryphonWarriorTexture"),
    frameName: ({ layerName, frame }) => `(${layerName}) ${frame}`,
    offset: {
      x: 40,
      y: -24
    }
  });
  constructor(props: GryphonWarriorProps) {
    super(props);
    this.sprite.mesh.scale.multiplyScalar(kInvPixelScale);
    this.object3D.add(this.sprite.mesh);
    this.object3D.position
      .copy(this.position)
      .multiplyScalar(kPixelScale)
      .round()
      .multiplyScalar(kInvPixelScale);
    this.sprite.gotoTag("Idle");
    this.behaviors.outOfBounds.init(this);
  }
  step(ms: number) {
    super.step(ms);
    this.sprite.animate(ms);
  }
  destroy() {
    super.destroy();
    this.sprite.dispose();
  }
}
