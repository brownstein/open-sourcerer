import { Color, ColorRepresentation, Object3D, Vector2 } from "three";

import { ControlEvents } from "src/api/controls";
import {
  BaseEntityType,
  EntityLevelAPI,
  EntityLifecycleEventTypes,
  EntityProps
} from "src/api/entity";
import { createTypedEventEmitter } from "src/api/util";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import { vector3To2 } from "src/engine/util/vecTypes";

import { LineRenderingBehavior } from "./vfx/LineRenderingBehavior";

export type DrawHelperProps = EntityProps & {
  color?: ColorRepresentation;
};

export enum DrawEvents {
  LineStarted = "LineStarted",
  LineComplete = "LineComplete"
}

type DrawEventTypes = {
  [DrawEvents.LineStarted]: Vector2;
  [DrawEvents.LineComplete]: Vector2[];
};
export class DrawHelper extends CoreEntity implements BaseEntityType {
  static type = "DrawHelper";
  public type = DrawHelper.type;
  public persist = false;
  public object3D = new Object3D();
  public events = createTypedEventEmitter<
    EntityLifecycleEventTypes & DrawEventTypes
  >();

  private mouseDown = false;
  private mouseDropVertexDistance = 0.25;
  private currentVertices?: Vector2[];

  public behaviors = {
    lineRendering: new LineRenderingBehavior()
  };

  constructor(props: DrawHelperProps) {
    super(props);
    if (props.color !== undefined) {
      this.behaviors.lineRendering.setColor(new Color(props.color));
    }
    this.object3D.add(this.behaviors.lineRendering.mesh);
    this.onMouseDown = this.onMouseDown.bind(this);
    this.onMouseUp = this.onMouseUp.bind(this);
  }

  attachToLevel(level: EntityLevelAPI) {
    super.attachToLevel(level);
    level.controls?.events.on(ControlEvents.LeftMouseDown, this.onMouseDown);
    level.controls?.events.on(ControlEvents.LeftMouseUp, this.onMouseUp);
  }

  detachFromLevel(level: EntityLevelAPI): void {
    super.detachFromLevel(level);
    level.controls?.events.off(ControlEvents.LeftMouseDown, this.onMouseDown);
    level.controls?.events.off(ControlEvents.LeftMouseUp, this.onMouseUp);
  }

  onMouseDown() {
    this.mouseDown = true;
    if (this.level?.controls?.cursorScenePosition) {
      this.position.x = this.level.controls.cursorScenePosition.x;
      this.position.y = this.level.controls.cursorScenePosition.y;
      this.object3D.position.copy(this.position);
    }
  }

  onMouseUp() {
    this.mouseDown = false;
    if (this.currentVertices !== undefined) {
      const offset = vector3To2(this.position);
      this.events.emit(
        DrawEvents.LineComplete,
        this.currentVertices.map((vtx) => vtx.clone().add(offset))
      );
      this.currentVertices = undefined;
      this.behaviors.lineRendering.update([]);
    }
  }

  step(ms: number) {
    super.step(ms);
    if (!this.mouseDown) return;
    const cursorPosition = this.level?.controls?.cursorScenePosition;
    if (!cursorPosition) return;
    const cursorPositionRelative = cursorPosition
      .clone()
      .sub(vector3To2(this.position));
    if (this.currentVertices) {
      const lastVertex = this.currentVertices.at(-1);
      if (!lastVertex) return;
      const dist = cursorPositionRelative.clone().sub(lastVertex).length();
      if (dist >= this.mouseDropVertexDistance) {
        this.currentVertices.push(cursorPositionRelative);
        this.behaviors.lineRendering.update(this.currentVertices);
      }
    } else {
      this.currentVertices = [cursorPositionRelative.clone()];
      this.events.emit(DrawEvents.LineStarted, this.currentVertices[0]);
    }
  }
}
