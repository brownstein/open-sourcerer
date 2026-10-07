import cx from "classnames";
import { MouseEvent, useCallback, useMemo } from "react";

import { SavedSpell, savedSpellToItemData } from "src/api/spells";
import { DraggableItem } from "src/components/ui/draggable/DraggableItem";
import { DraggableDropResult } from "src/components/ui/draggable/dragUtil";
import { ItemRenderer } from "src/components/ui/item/ItemRenderer";

import "./SpellGrid.less";

export type SpellGridProps = {
  spells: SavedSpell[];
  className?: string;
  enableDrag?: boolean;
  enableDelete?: boolean;
  selectedSpellId?: string;
  onClickSpell?: (spell: SavedSpell) => void;
  onDoubleClickSpell?: (spell: SavedSpell) => void;
  onDragSpell?: (result: DraggableDropResult | null) => void;
  onDeleteSpell?: (spell: SavedSpell) => void;
  onContextMenu?: (e: MouseEvent, spell: SavedSpell) => void;
};

export function SpellGrid(props: SpellGridProps) {
  const {
    spells,
    className,
    enableDrag,
    selectedSpellId,
    onClickSpell,
    onDoubleClickSpell,
    onDragSpell,
    onContextMenu
  } = props;

  return (
    <div className={cx("spell-grid-container", className)}>
      {spells.map((s) => (
        <SpellGridItem
          key={s.id}
          spell={s}
          selected={selectedSpellId === s.id}
          onClick={onClickSpell}
          onDoubleClick={onDoubleClickSpell}
          onDragSpell={enableDrag ? onDragSpell : undefined}
          onContextMenu={onContextMenu}
        />
      ))}
    </div>
  );
}

export type SpellGridItemProps = {
  spell: SavedSpell;
  selected?: boolean;
  onClick?: (spell: SavedSpell) => void;
  onDoubleClick?: (spell: SavedSpell) => void;
  onDragSpell?: (result: DraggableDropResult | null) => void;
  onContextMenu?: (e: MouseEvent, spell: SavedSpell) => void;
};

export function SpellGridItem(props: SpellGridItemProps) {
  const {
    spell,
    selected,
    onClick,
    onDoubleClick,
    onDragSpell,
    onContextMenu
  } = props;
  const item = useMemo(() => savedSpellToItemData(spell), [spell]);

  const handleClick = useCallback(() => {
    onClick?.(spell);
  }, [onClick, spell]);

  const handleDoubleClick = useCallback(() => {
    onDoubleClick?.(spell);
  }, [onDoubleClick, spell]);

  const content = (
    <>
      <div className="spell-grid-item-preview">
        <ItemRenderer item={item} />
      </div>
      <div className="spell-grid-item-name">{spell.name}</div>
    </>
  );

  return (
    <div
      className={cx("spell-grid-item", { selected, clickable: !!handleClick })}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onContextMenu={onContextMenu && ((e) => onContextMenu(e, spell))}
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
    </div>
  );
}
