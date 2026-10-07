import cx from "classnames";
import { useEffect, useMemo, useRef, useState } from "react";
import { getEmptyImage } from "react-dnd-html5-backend";
import { ArrowContainer, Popover } from "react-tiny-popover";

import { ItemData } from "src/api/item";
import { Icon, IconName } from "src/components/ui/icons/Icon";
import { useAppDispatch, useAppSelector } from "src/redux/hooks";
import {
  selectCurrencies,
  selectHealthPotions,
  selectManaPotions,
  selectQuestItemsMap
} from "src/redux/inventory/selectors";
import {
  EquippedWeaponTypes,
  HotKeyAssignment,
  assignHotKeys
} from "src/redux/inventory/slice";

import { kDraggableItemType, standardUseDrag } from "../ui/draggable/dragUtil";
import { ItemRenderer } from "../ui/item/ItemRenderer";
import "./CharacterItems.less";

export type ItemsProps = {};

export function CharacterItems() {
  const questItems = useAppSelector(selectQuestItemsMap);
  const _healthPotions = useAppSelector(selectHealthPotions);
  const _manaPotions = useAppSelector(selectManaPotions);
  const _coins = useAppSelector(selectCurrencies);

  const _questItemsArr = useMemo(
    () =>
      [...Object.values(questItems)].filter(
        (v) => !["Sword", "Bow"].includes(v.itemType)
      ),
    [questItems]
  );

  return (
    <>
      <div className="items-section-main">
        <div className="column">
          <ItemDisplay item={null} count={0} icon="miscItem" />
          <ItemDisplay item={null} count={0} icon="miscItem" />
        </div>

        <div className="items-section-center">
          <div className="player-silhouette-container">
            <div className="player-silhouette"></div>
          </div>
        </div>

        <div className="column">
          <ItemDisplay item={null} count={0} icon="miscItem" />
          <ItemDisplay item={null} count={0} icon="miscItem" />
        </div>
      </div>
    </>
  );
}

type ItemDisplayProps = {
  item: ItemData | null;
  count: number;
  showCount?: boolean;
  icon: IconName;
};

function ItemDisplay(props: ItemDisplayProps) {
  const { item, count, showCount, icon } = props;
  const dispatch = useAppDispatch();
  const dragRef = useRef<HTMLDivElement | null>(null);

  const [{ isDragging: _isDragging }, drag, preview] = standardUseDrag({
    type: kDraggableItemType,
    canDrag: count > 0,
    item: {
      item: item ?? null,
      fromLocation: {
        location: "items"
      }
    },
    collect: (monitor) => ({
      isDragging: monitor.isDragging()
    }),
    end: (_dropData, monitor) => {
      if (monitor.didDrop()) {
        const dropResult = monitor.getDropResult();
        if (dropResult?.draggedTo?.location === "hotbar") {
          let newAssignment: HotKeyAssignment | null = null;
          switch (item?.type) {
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

  useEffect(() => {
    preview(getEmptyImage(), { captureDraggingState: true });
  }, [preview]);

  drag(dragRef);

  const [popoverOpen, setPopoverOpen] = useState(false);
  const popoverContent = (
    <div className="item-name-popover">
      {item?.variant ? `${item.variant} ` : null}
      {item?.type}
    </div>
  );

  return (
    <div
      className={cx(
        "item-display",
        item && "has-item",
        count === 0 && "depleted"
      )}
      ref={dragRef}
      onMouseEnter={() => setPopoverOpen(true)}
      onMouseLeave={() => setPopoverOpen(false)}
    >
      <Popover
        isOpen={popoverOpen && !!item}
        positions={["left", "right"]}
        reposition={false}
        content={({ position, childRect, popoverRect }) => (
          <ArrowContainer
            position={position}
            childRect={childRect}
            popoverRect={popoverRect}
            arrowColor="#000000"
            arrowSize={8}
          >
            {popoverContent}
          </ArrowContainer>
        )}
      >
        <div className="item-popover-anchor" />
      </Popover>
      <ItemRenderer item={item} />
      <Icon icon={icon} size="fill" />
      {showCount && <div className="item-count">{count ?? 0}</div>}
    </div>
  );
}
