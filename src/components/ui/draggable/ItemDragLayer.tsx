import { useEffect } from "react";
import type { XYCoord } from "react-dnd";
import { useDragLayer } from "react-dnd";

import { ItemRenderer } from "src/components/ui/item/ItemRenderer";

import "./ItemDragLayer.less";
import { DragData } from "./dragUtil";

const kPreviewSize = 64;

function getItemStyles(offset: XYCoord | null) {
  if (!offset) {
    return {
      display: "none"
    };
  }

  const { x, y } = offset;
  const transform = `translate(${x - kPreviewSize * 0.5}px, ${
    y - kPreviewSize * 0.5
  }px)`;

  return {
    transform
  };
}

export function ItemDragLayer() {
  const { isDragging, dragData, offset, initialOffset } = useDragLayer<{
    dragData: DragData;
    offset: XYCoord | null;
    initialOffset: XYCoord | null;
    isDragging: boolean;
  }>((monitor) => ({
    dragData: monitor.getItem(),
    offset: monitor.getClientOffset(),
    initialOffset: monitor.getInitialClientOffset(),
    isDragging: monitor.isDragging()
  }));

  // Report the current position of the dragged entity to the optional updated callback.
  useEffect(() => {
    if (!isDragging || !dragData || !offset || !initialOffset) return;
    dragData.positionUpdatedCallback?.(offset, initialOffset);
  }, [offset, initialOffset, isDragging, dragData]);

  if (!isDragging) return null;

  return (
    <div className="item-drag-layer">
      {dragData?.item ? (
        <div style={getItemStyles(offset)}>
          <div className="item-drag-item">
            <ItemRenderer item={dragData.item} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
