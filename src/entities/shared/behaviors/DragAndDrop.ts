import { Vector3 } from "three";

import { BaseEntityType, EntityBehavior, EntityLevelAPI, EntityLifecycleEvents } from "src/api/entity";
import { OverlayAPI, OverlayPosition } from "src/api/overlay";
import { createTypedEventEmitter } from "src/api/util";
import {
  DragAndDropEntityOverlay,
  DragAndDropEntityOverlayProps
} from "src/components/ui/overlays/overlays/DragAndDropEntity";
import { vector2To3 } from "src/engine/util/vecTypes";

export type DragAndDropBehaviorOptions = {
  draggable?: boolean;
  droppable?: boolean;
};

export type DragAndDropBehaviorEventTypes = {
  dragStart: void;
  dragEnd: void;
};
export class DragAndDropBehavior implements EntityBehavior {
  public type = "DragAndDropBehavior";
  public events = createTypedEventEmitter<DragAndDropBehaviorEventTypes>();
  public activationRadius = 2;
  public draggable = true;
  public droppable = true;

  private level?: EntityLevelAPI;
  private entity?: BaseEntityType;
  private overlay?: OverlayAPI<DragAndDropEntityOverlayProps>;

  constructor(opts?: DragAndDropBehaviorOptions) {
    this.step = this.step.bind(this);
    if (opts) {
      this.draggable = opts.draggable ?? this.draggable;
      this.droppable = opts.droppable ?? this.droppable;
    }
  }
  init(entity: BaseEntityType) {
    this.entity = entity;
    this.entity.events.on(EntityLifecycleEvents.Step, this.step);
    return this;
  }
  setDraggable(draggable: boolean) {
    this.draggable = draggable;
    return this;
  }
  setDroppable(droppable: boolean) {
    this.droppable = droppable;
    return this;
  }
  attachToLevel(level: EntityLevelAPI) {
    this.level = level;
  }
  detachFromLevel() {
    if (!this.level) return;
    this.level = undefined;
  }
  step(_ms: number) {
    if (!this.overlay && this.entity) {
      const entity = this.entity;
      let pos: Vector3 | undefined;
      this.overlay =
        this.level?.ctx?.overlayProvider?.addOverlay<DragAndDropEntityOverlayProps>(
          {
            component: DragAndDropEntityOverlay,
            position: OverlayPosition.Viewport,
            overlayProps: {
              entity,
              draggable: this.draggable,
              droppable: this.droppable,
              onPositionUpdated: (delta) => {
                if (!pos) return;
                entity.position.copy(pos.clone().add(vector2To3(delta)));
              },
              onDragStart: () => {
                this.events.emit("dragStart");
                pos = entity.position.clone();
              },
              onDragEnd: () => {
                this.events.emit("dragEnd");
                pos = undefined;
              }
            }
          }
        );
    }
  }
}
