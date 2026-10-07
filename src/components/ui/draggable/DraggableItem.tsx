import cx from "classnames";
import { ReactElement, useEffect, useRef } from "react";
import { getEmptyImage } from "react-dnd-html5-backend";

import { ItemData } from "src/api/item";
import {
  DraggableItemLocation,
  OnDropItemCallback,
  OnDropOutCallback,
  kDraggableItemType,
  standardUseDrag
} from "src/components/ui/draggable/dragUtil";

import "./DraggableItem.less";

export type DraggableItemProps = {
  item: ItemData;
  location: DraggableItemLocation;
  onDropItem?: OnDropItemCallback;
  onDropOut?: OnDropOutCallback;
  children?: ReactElement;
};

export function DraggableItem(props: DraggableItemProps) {
  const { children, item, location, onDropItem, onDropOut } = props;
  const ref = useRef<HTMLDivElement>(null);
  const [{ isDragging }, drag, preview] = standardUseDrag({
    type: kDraggableItemType,
    item: {
      item,
      fromLocation: location
    },
    collect: (monitor) => ({
      isDragging: monitor.isDragging()
    }),
    end: (_dropResult, monitor) => {
      if (monitor.didDrop()) {
        const result = monitor.getDropResult();
        if (result) onDropItem?.(result);
      } else {
        onDropOut?.({
          item,
          fromLocation: location
        });
      }
    }
  });

  useEffect(() => {
    preview(getEmptyImage(), { captureDraggingState: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  drag(ref);

  return (
    <div
      ref={ref}
      className={cx("draggable-item-container", {
        "is-dragging": isDragging
      })}
    >
      {children}
    </div>
  );
}
