import { Button } from "@mui/material";
import cx from "classnames";
import { MouseEvent, useCallback, useMemo } from "react";

import { ModalConfigType } from "src/api/modal";
import { SpellItemData, itemDataToSavedSpell } from "src/api/spells";
import { DraggableItem } from "src/components/ui/draggable/DraggableItem";
import { DraggableDropResult } from "src/components/ui/draggable/dragUtil";
import { Icon } from "src/components/ui/icons/Icon";
import { ItemRenderer } from "src/components/ui/item/ItemRenderer";
import { useAppDispatch } from "src/redux/hooks";
import {
  openCodeEditor,
  pushModal,
  pushModalTyped
} from "src/redux/shared/actions";

import "./SpellList.less";

export type SpellListProps = {
  items: SpellItemData[];
  className?: string;
  enableDrag?: boolean;
  enableEdit?: boolean;
  enableEditCode?: boolean;
  enableDelete?: boolean;
  enableDuplicate?: boolean;
  selectedSpellId?: string;
  onClickSpell?: (item: SpellItemData) => void;
  onDoubleClickSpell?: (item: SpellItemData) => void;
  onDragSpell?: (result: DraggableDropResult | null) => void;
  onDeleteSpell?: (item: SpellItemData) => void;
  onContextMenu?: (e: MouseEvent, item: SpellItemData) => void;
};

export function SpellList(props: SpellListProps) {
  const {
    items,
    className,
    enableDrag,
    enableEdit,
    enableEditCode,
    enableDelete,
    enableDuplicate,
    selectedSpellId,
    onClickSpell,
    onDoubleClickSpell,
    onDragSpell,
    onContextMenu
  } = props;

  return (
    <div className={cx("spell-list-container", className)}>
      <div className="spell-list-list-container">
        <ul className="spell-list-list">
          {items.map((s, i) => (
            <SpellListItem
              key={i}
              item={s}
              selected={selectedSpellId === s.scriptId}
              enableEdit={enableEdit}
              enableEditCode={enableEditCode}
              enableDelete={enableDelete}
              enableDuplicate={enableDuplicate}
              onClick={onClickSpell}
              onDoubleClick={onDoubleClickSpell}
              onDragSpell={enableDrag ? onDragSpell : undefined}
              onContextMenu={onContextMenu}
            />
          ))}
        </ul>
      </div>
    </div>
  );
}

export type SpellListItemProps = {
  item: SpellItemData;
  selected?: boolean;
  enableEdit?: boolean;
  enableEditCode?: boolean;
  enableDelete?: boolean;
  enableDuplicate?: boolean;
  onClick?: (item: SpellItemData) => void;
  onDoubleClick?: (item: SpellItemData) => void;
  onDragSpell?: (result: DraggableDropResult | null) => void;
  onContextMenu?: (e: MouseEvent, item: SpellItemData) => void;
};

export function SpellListItem(props: SpellListItemProps) {
  const {
    item,
    selected,
    enableEdit,
    enableEditCode,
    enableDelete,
    enableDuplicate,
    onClick,
    onDoubleClick,
    onDragSpell,
    onContextMenu
  } = props;

  const dispatch = useAppDispatch();

  const spell = useMemo(() => itemDataToSavedSpell(item), [item]);

  const handleClick = useCallback(() => {
    onClick?.(item);
  }, [onClick, item]);

  const handleDoubleClick = useCallback(() => {
    onDoubleClick?.(item);
  }, [onDoubleClick, item]);

  const handleDelete = useCallback(() => {
    dispatch(
      pushModalTyped({
        modalName: "deleteSpell",
        modalArg: {
          spell
        }
      })
    );
  }, [dispatch, spell]);

  const handleDuplicate = useCallback(() => {
    dispatch(
      pushModal({
        modalName: "saveSpell",
        modalArg: { code: spell.code, duplicatingSpell: spell }
      } satisfies ModalConfigType<"saveSpell">)
    );
  }, [dispatch, spell]);

  const handleEdit = useCallback(() => {
    dispatch(
      pushModal({
        modalName: "saveSpell",
        modalArg: { code: spell.code, existingSpell: spell, editInPlace: true }
      } satisfies ModalConfigType<"saveSpell">)
    );
  }, [dispatch, spell]);

  const handleEditCode = useCallback(() => {
    dispatch(
      openCodeEditor({
        code: spell.code,
        spell
      })
    );
  }, [dispatch, spell]);

  const content = (
    <>
      <div className="spell-list-item-preview">
        <ItemRenderer item={item} />
      </div>
      <div className="spell-list-item-name">{spell.name}</div>
      <div className="spell-list-item-actions">
        {enableEdit && (
          <Button className="spell-list-item-action" onClick={handleEdit}>
            <Icon icon="penFilled" size="fill" />
          </Button>
        )}
        {enableDuplicate && (
          <Button className="spell-list-item-action" onClick={handleDuplicate}>
            <Icon icon="blockInBlock" size="fill" />
          </Button>
        )}
        {enableDelete && (
          <Button className="spell-list-item-action" onClick={handleDelete}>
            <Icon icon="trashFilled" size="fill" />
          </Button>
        )}
        {enableEditCode && (
          <Button
            className="spell-list-item-action edit-code"
            onClick={handleEditCode}
          >
            Edit Code
          </Button>
        )}
      </div>
    </>
  );

  return (
    <li
      className={cx("spell-list-item", { selected, clickable: !!handleClick })}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onContextMenu={(e) => onContextMenu?.(e, item)}
    >
      {onDragSpell ? (
        <DraggableItem
          item={item}
          location={{ location: "spells" }}
          onDropItem={onDragSpell}
        >
          {content}
        </DraggableItem>
      ) : (
        content
      )}
    </li>
  );
}
