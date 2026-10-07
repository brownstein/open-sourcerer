import { Object3D } from "three";
import { ThreeAseprite } from "three-aseprite";

import { EntityProps } from "src/api/entity";
import { enemyCollisionGroup } from "src/engine/constants/collisionGroups";
import { kInvPixelScale } from "src/engine/constants/scaling";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import { addResourceLoader, getResource } from "src/engine/entity/decorators";
import { TextureResourceLoader } from "src/engine/loader/Loaders";
import { StatusBehavior } from "src/entities/shared/behaviors/StatusBehavior";

import { CharacterPhysicsBehavior } from "../shared/behaviors/CharacterPhysics";
import jsLogoPng from "./sprites/js-128-sheet.png";
import jsLogoJson from "./sprites/js-128.json";

@addResourceLoader(new TextureResourceLoader("JSLogoTexture", jsLogoPng))
export class JSLogo extends CoreEntity {
  static type = "JSLogo";
  public type = "JSLogo";
  public object3D = new Object3D();
  public behaviors = {
    physics: new CharacterPhysicsBehavior().setGroup(enemyCollisionGroup),
    status: new StatusBehavior()
  };
  public sprite: ThreeAseprite;
  constructor(props: EntityProps) {
    super(props);
    this.size = {
      width: 1.5,
      height: 1.5
    };
    this.behaviors.physics.init(this);
    this.behaviors.status.init(this);

    this.object3D.position.copy(this.position);

    this.sprite = new ThreeAseprite({
      sourceJSON: jsLogoJson,
      texture: getResource(JSLogo, "JSLogoTexture")
    });
    this.sprite.mesh.scale.multiplyScalar((kInvPixelScale * 3) / 8);
    this.object3D.add(this.sprite.mesh);
    this.behaviors.status.attachSprite(this.sprite);
  }

  destroy() {
    super.destroy();
    this.sprite.dispose();
  }
}
