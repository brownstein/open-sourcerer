import cx from "classnames";
import { MouseEvent, useCallback, useEffect, useMemo, useRef } from "react";
import { getEmptyImage } from "react-dnd-html5-backend";

import { ItemData } from "src/api/item";
import {
  DraggableDropResult,
  kDraggableItemType,
  standardUseDrag,
  standardUseDrop
} from "src/components/ui/draggable/dragUtil";
import { ItemGridDragLocation } from "src/components/ui/draggable/dragUtil";
import { ItemRenderer } from "src/components/ui/item/ItemRenderer";
import { useAppDispatch } from "src/redux/hooks";
import {
  EquippedWeaponTypes,
  HotKeyAssignment,
  assignHotKeys
} from "src/redux/inventory/slice";

import "./ItemGrid.less";

export type ItemGridProps = {
  items: ItemData[];
  className?: string;
  enableDrag?: boolean;
  enableDelete?: boolean;
  onClickItem?: (item: ItemData) => void;
  onDoubleClickItem?: (item: ItemData) => void;
  onDragItem?: (result: DraggableDropResult | null) => void;
  onDeleteItem?: (item: ItemData) => void;
  onContextMenu?: (e: MouseEvent, item: ItemData | null) => void;
};

export function ItemGrid(props: ItemGridProps) {
  const {
    items,
    className,
    enableDrag,
    onClickItem,
    onDoubleClickItem,
    onDragItem,
    onContextMenu
  } = props;

  return (
    <div className={cx("item-grid-container", className)}>
      {items.map((s, i) => (
        <ItemGridItem
          key={i}
          item={s}
          onClick={onClickItem}
          onDoubleClick={onDoubleClickItem}
          onDragItem={enableDrag ? onDragItem : undefined}
          onContextMenu={onContextMenu}
        />
      ))}
      <ItemGridItem item={null} />
      {new Array(items.length < 36 ? 35 - items.length : items.length)
        .fill(null)
        .map((v, i) => (
          <ItemGridItem key={i + items.length} item={null} />
        ))}
    </div>
  );
}

export type ItemGridItemProps = {
  item: ItemData | null;
  onClick?: (item: ItemData) => void;
  onDoubleClick?: (item: ItemData) => void;
  onDragItem?: (result: DraggableDropResult | null) => void;
  onContextMenu?: (e: MouseEvent, item: ItemData | null) => void;
};

export function ItemGridItem(props: ItemGridItemProps | undefined) {
  const {
    item,
    onClick,
    onDoubleClick,
    onDragItem: _onDragItem,
    onContextMenu
  } = props ?? {
    item: null
  };

  const ref = useRef<HTMLDivElement | null>(null);

  const dispatch = useAppDispatch();

  // const item = useMemo(
  //   () => (spell ? savedSpellToItemData(spell) : null),
  //   [spell]
  // );

  const dragLocation = useMemo<ItemGridDragLocation>(
    () => ({
      location: "itemGrid"
    }),
    []
  );

  const [{ isOver: _isOver }, drop] = standardUseDrop({
    accept: kDraggableItemType,
    collect: (monitor) => ({
      canDrop: monitor.canDrop(),
      isOver: monitor.isOver()
    }),
    drop: (dropped) => ({
      dragData: dropped,
      draggedTo: dragLocation
    })
  });

  let interactive = true;

  //Pasos por hacer
  //1.- Quitar los indices
  //2.- Hacer que se entre con un filtro

  const [{ isDragging: _isDragging }, drag, preview] = standardUseDrag({
    type: kDraggableItemType,
    canDrag: interactive,
    item: {
      item: item ?? null,
      fromLocation: dragLocation
    },
    collect: (monitor) => ({
      isDragging: monitor.isDragging()
    }),
    end: (_dropData, monitor) => {
      if (monitor.didDrop()) {
        const dropResult = monitor.getDropResult();
        if (dropResult?.draggedTo?.location === "itemGrid") {
          // FIXME.
        } else if (dropResult?.draggedTo?.location === "hotbar") {
          let newAssignment: HotKeyAssignment | null = null;
          switch (item?.type) {
            case "spell":
              newAssignment = {
                type: "spell",
                scriptId: item?.scriptId as string
              };
              break;
            case "Sword":
            case "Bow":
              newAssignment = {
                type: "weapon",
                weaponType: item.type as EquippedWeaponTypes
              };
              break;
            default:
              if (item?.type) {
                newAssignment = {
                  type: "consumable",
                  itemType: item.type,
                  itemVariant: item.variant
                };
              }
              break;
          }
          dispatch(
            assignHotKeys([
              {
                hotKey: dropResult.draggedTo.hotKey,
                assignment: newAssignment
              }
            ])
          );
        }
      }
    }
  });

  const handleClick = useCallback(() => {
    if (item) onClick?.(item);
  }, [onClick, item]);

  const handleDoubleClick = useCallback(() => {
    if (item) onDoubleClick?.(item);
  }, [onDoubleClick, item]);

  useEffect(() => {
    preview(getEmptyImage(), { captureDraggingState: true });
  }, [preview]);

  drag(drop(ref));

  const content = (
    <>
      <div className="item-grid-item-preview">
        {item ? <ItemRenderer item={item} /> : null}
        {item?.count && (
          <div className="item-grid-item-count">{item.count}</div>
        )}
      </div>
      <div className="item-grid-item-name">{item?.type}</div>
    </>
  );

  return (
    <div
      className={cx("item-grid-item", {})}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onContextMenu={onContextMenu && ((e) => onContextMenu(e, item))}
      ref={ref}
    >
      {content}
    </div>
  );
}
