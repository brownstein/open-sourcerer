import { Object3D } from "three";

import { EntityProps } from "src/api/entity";
import { CoreEntity } from "src/engine/entity/CoreEntity";

import { DevRenderBehavior } from "../dev/behaviors/DevRenderBehavior";
import { DragAndDropBehavior } from "../shared/behaviors/DragAndDrop";

export class DropZone extends CoreEntity {
  static type = "DropZone";
  public type = "DropZone";
  public object3D = new Object3D();

  public behaviors = {
    drag: new DragAndDropBehavior({
      draggable: false,
      droppable: true
    }),
    rendering: new DevRenderBehavior()
  };

  constructor(props: EntityProps) {
    super(props);
    this.behaviors.drag.init(this);
    this.behaviors.rendering.init(this);
    this.object3D.position.copy(this.position);
  }

  step(ms: number) {
    super.step(ms);
    this.object3D.position.copy(this.position);
  }
}
