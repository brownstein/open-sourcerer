import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { getEmptyImage } from "react-dnd-html5-backend";
import { Vector2 } from "three";

import { BaseEntityType } from "src/api/entity";
import { OverlayComponentProps, OverlayProviderEvents } from "src/api/overlay";
import { GameControllerContext } from "src/components/context/GameControllerContext";
import {
  DragData,
  kDraggableEntityType,
  standardUseDrag,
  standardUseDrop
} from "src/components/ui/draggable/dragUtil";
import { sizeToVector2 } from "src/engine/util/vecTypes";
import { IVector2, anyToVector3, vector3To2 } from "src/engine/util/vecTypes";

import "./DragAndDropEntity.less";

export type DragAndDropEntityOverlayProps = {
  entity: BaseEntityType;
  draggable?: boolean;
  droppable?: boolean;
  onDragStart?: () => void;
  onPositionUpdated?: (delta: Vector2) => void;
  onDragEnd?: () => void;
  onDrop?: (result: DragData) => void;
};

export type DragAndDropEntityProps =
  OverlayComponentProps<DragAndDropEntityOverlayProps>;

export function DragAndDropEntityOverlay(props: DragAndDropEntityProps) {
  const { api, overlayProps, screenSize } = props;
  const {
    entity,
    draggable,
    droppable,
    onPositionUpdated,
    onDragStart,
    onDragEnd,
    onDrop
  } = overlayProps ?? {};
  const controller = useContext(GameControllerContext);

  const [position, setPosition] = useState<Vector2 | null>();
  const [size, setSize] = useState<Vector2 | null>();
  const [visible, setVisible] = useState<boolean>(true);

  const iState = useRef({
    // Properties to smuggle into callbacks and effects.
    position,
    size,
    screenSize,
    // Callbacks to smuggle into callbacks and effects.
    onPositionUpdated,
    onDragStart,
    onDragEnd,
    onDrop,
    // Imperative state.
    isDragging: false,
    visible
  });
  iState.current.position = position;
  iState.current.size = size;
  iState.current.screenSize = screenSize;
  iState.current.onPositionUpdated = onPositionUpdated;
  iState.current.onDragStart = onDragStart;
  iState.current.onDragEnd = onDragEnd;
  iState.current.onDrop = onDrop;
  iState.current.visible = visible;

  useEffect(() => {
    if (!entity || !controller) return;
    const iStateCurrent = iState.current;
    let lastThrottledUpdatedAt = 0;
    const doUpdate = () => {
      const { screenSize } = iStateCurrent;
      const viewportCamera =
        controller?.level?.cameraDirector?.getViewportCamera();
      if (!viewportCamera) return;
      const rawPos = entity.position.clone();
      const rawPosPlusSize = entity.position.clone();
      const rawSize = entity.size ? sizeToVector2(entity.size) : undefined;
      if (rawSize) {
        rawPosPlusSize.x += rawSize.width * 0.5;
        rawPosPlusSize.y += rawSize.height * 0.5;
      }
      rawPos.project(viewportCamera);
      rawPosPlusSize.project(viewportCamera);
      const pos2 = vector3To2(rawPos);
      const size2 = vector3To2(
        rawPosPlusSize.clone().sub(rawPos).multiplyScalar(2)
      );
      const invisible = pos2.x < -1 || pos2.y < -1 || pos2.x > 1 || pos2.y > 1;
      if (iStateCurrent.visible === invisible) {
        iStateCurrent.visible = !invisible;
        setVisible(!invisible);
      }
      pos2.add(new Vector2(1, 1)).multiply(screenSize).multiplyScalar(0.5);
      pos2.y = screenSize.y - pos2.y;
      size2.multiply(screenSize).multiplyScalar(0.5);
      if (
        iStateCurrent.position &&
        iStateCurrent.size &&
        iStateCurrent.position.equals(pos2) &&
        iStateCurrent.size.equals(size2)
      )
        return;
      const now = Date.now();
      if (lastThrottledUpdatedAt + 500 > now) return;
      lastThrottledUpdatedAt = now;
      setPosition(pos2);
      setSize(size2);
    };
    api.events.on(OverlayProviderEvents.RenderFrame, doUpdate);
    return () => {
      api.events.off(OverlayProviderEvents.RenderFrame, doUpdate);
    };
  }, [api, controller, entity]);

  const ref = useRef<HTMLDivElement | null>(null);

  const positionUpdatedCallback = useCallback(
    (pos: IVector2, startPos: IVector2) => {
      const camera = controller?.level?.cameraDirector?.getViewportCamera();
      if (!camera || !onPositionUpdated) return;
      const pos3 = anyToVector3(pos);
      const startPos3 = anyToVector3(startPos);
      const delta3 = pos3.clone().sub(startPos3);
      delta3.x /= screenSize.x / 2;
      delta3.y /= -screenSize.y / 2;
      delta3.unproject(camera);
      delta3.sub(camera.position);
      delta3.z = 0;
      onPositionUpdated?.(vector3To2(delta3));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onPositionUpdated, screenSize]
  );

  const [{ isOver: _isOver }, drop] = standardUseDrop({
    accept: kDraggableEntityType,
    canDrop: (data) =>
      droppable ? data.fromLocation?.location === "world" : false,
    collect: (monitor) => ({
      isOver: monitor.isOver()
    }),
    drop: (dropped) => {
      iState.current.onDrop?.(dropped);
      return {
        dragData: dropped,
        draggedTo: {
          location: "world"
        }
      };
    }
  });

  const [{ isDragging = false }, drag, preview] = standardUseDrag({
    type: kDraggableEntityType,
    canDrag: draggable,
    item: {
      fromLocation: {
        location: "world"
      },
      positionUpdatedCallback,
      item: null
    },
    collect: (monitor) => ({
      isDragging: monitor.isDragging()
    })
  });

  useEffect(() => {
    if (iState.current.isDragging !== isDragging) {
      if (isDragging) {
        onDragStart?.();
      } else {
        onDragEnd?.();
      }
      iState.current.isDragging = isDragging ?? false;
    }
  }, [isDragging, onDragStart, onDragEnd]);

  useEffect(() => {
    preview(getEmptyImage(), { captureDraggingState: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  drag(drop(ref));

  if (!visible) return null;

  return (
    <div
      ref={ref}
      className="drag-and-drop-entity-overlay"
      style={{
        top: position?.y,
        left: position?.x,
        width: size?.x,
        height: size?.y,
        cursor: draggable ? "grab" : undefined,
        // This is a hack.
        zIndex: isDragging ? -1 : undefined
      }}
    />
  );
}
