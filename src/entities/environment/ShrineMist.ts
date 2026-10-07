import {
  IUniform,
  Mesh,
  Object3D,
  PlaneGeometry,
  ShaderMaterial,
  Vector2
} from "three";

import { EntityProps } from "src/api/entity";
import { kInvPixelScale, kPixelScale } from "src/engine/constants/scaling";
import { CoreEntity } from "src/engine/entity/CoreEntity";

export class ShrineMist extends CoreEntity {
  static type = "ShrineMist";
  public type = ShrineMist.type;

  public object3D = new Object3D();
};