import { Button } from "@mui/material";
import cx from "classnames";
import { search } from "fast-fuzzy";
import {
  ChangeEventHandler,
  MouseEvent,
  useCallback,
  useId,
  useMemo,
  useState
} from "react";
import { Item, Menu, useContextMenu } from "react-contexify";

import { ModalConfigType } from "src/api/modal";
import {
  SavedSpell,
  isSpellItemData,
  savedSpellToItemData
} from "src/api/spells";
import { DraggableDropResult } from "src/components/ui/draggable/dragUtil";
import { useAppDispatch, useAppSelector } from "src/redux/hooks";
import { assignHotKey } from "src/redux/inventory/slice";
import { selectAllScripts } from "src/redux/scriptLibrary/selectors";
import {
  openCodeEditor,
  pushModal,
  pushModalTyped
} from "src/redux/shared/actions";

import { Icon } from "../ui/icons/Icon";
import "./SpellBrowser.less";
import { SpellGrid } from "./SpellGrid";
import { SpellList } from "./SpellList";

export type SpellBrowserProps = {
  enableDrag?: boolean;
  selectedSpellId?: string;
  onClickSpell?: (spell: SavedSpell) => void;
  onDoubleClickSpell?: (spell: SavedSpell) => void;
};

export function SpellBrowser(props: SpellBrowserProps) {
  const { enableDrag, selectedSpellId, onClickSpell, onDoubleClickSpell } =
    props;

  const dispatch = useAppDispatch();
  const allSpells = useAppSelector(selectAllScripts);

  const [searchTerm, setSearchTerm] = useState<string>("");
  const [isGrid, setIsGrid] = useState(true);

  const contextMenuId = useId();
  const [contextMenuSelection, setContextMenuSelection] =
    useState<SavedSpell | null>(null);
  const { show: showContextMenu } = useContextMenu({
    id: contextMenuId
  });

  const onSpellContextMenu = useCallback(
    (e: MouseEvent, spell: SavedSpell) => {
      setContextMenuSelection(spell);
      showContextMenu({ event: e });
    },
    [showContextMenu]
  );

  const onCtxMenuDuplicate = useCallback(() => {
    if (!contextMenuSelection) return;
    dispatch(
      pushModal({
        modalName: "saveSpell",
        modalArg: {
          code: contextMenuSelection.code,
          duplicatingSpell: contextMenuSelection
        }
      } satisfies ModalConfigType<"saveSpell">)
    );
  }, [dispatch, contextMenuSelection]);

  const onCtxMenuDelete = useCallback(() => {
    if (!contextMenuSelection) return;
    dispatch(
      pushModalTyped({
        modalName: "deleteSpell",
        modalArg: {
          spell: contextMenuSelection
        }
      })
    );
  }, [dispatch, contextMenuSelection]);

  const onCtxMenuChange = useCallback(() => {
    if (!contextMenuSelection) return;
    dispatch(
      pushModalTyped({
        modalName: "saveSpell",
        modalArg: {
          code: contextMenuSelection.code,
          existingSpell: contextMenuSelection,
          editInPlace: true
        }
      })
    );
  }, [dispatch, contextMenuSelection]);

  const onCtxMenuEdit = useCallback(() => {
    if (!contextMenuSelection) return;
    dispatch(
      openCodeEditor({
        code: contextMenuSelection.code,
        spell: contextMenuSelection
      })
    );
  }, [dispatch, contextMenuSelection]);

  const _onChangeSearchTerm = useCallback<ChangeEventHandler<HTMLInputElement>>(
    (e) => {
      setSearchTerm(e.target.value);
    },
    []
  );

  const onDragSpell = useCallback(
    (result: DraggableDropResult | null) => {
      if (result?.draggedTo?.location !== "hotbar") return;
      let scriptId: string | null = null;
      if (result.dragData.item && isSpellItemData(result.dragData.item)) {
        scriptId = result.dragData.item.scriptId;
      }
      dispatch(
        assignHotKey({
          hotKey: result.draggedTo.hotKey,
          assignment: scriptId
            ? {
                type: "spell",
                scriptId
              }
            : null
        })
      );
    },
    [dispatch]
  );

  const onEditSpell = useCallback(
    (spell: SavedSpell) => {
      dispatch(
        pushModalTyped({
          modalName: "saveSpell",
          modalArg: {
            code: spell.code,
            existingSpell: spell,
            editInPlace: true
          }
        })
      );
    },
    [dispatch]
  );

  const sortedAndFilteredSpells = useMemo(() => {
    let filteredSpells = allSpells;
    if (searchTerm !== "")
      filteredSpells = search(searchTerm, allSpells, {
        keySelector: (spell) => spell.name
      });
    const sortedSpells = [...filteredSpells];
    sortedSpells.sort((a, b) => a.name.localeCompare(b.name));
    return sortedSpells;
  }, [allSpells, searchTerm]);

  return (
    <div className="spell-browser">
      {isGrid ? (
        <SpellGrid
          spells={sortedAndFilteredSpells}
          enableDrag={enableDrag}
          selectedSpellId={selectedSpellId}
          onDragSpell={onDragSpell}
          onClickSpell={onClickSpell}
          onDoubleClickSpell={onDoubleClickSpell ?? onEditSpell}
          onContextMenu={onSpellContextMenu}
        />
      ) : (
        <SpellList
          items={sortedAndFilteredSpells.map(savedSpellToItemData)}
          enableDrag={enableDrag}
          enableEdit
          enableEditCode
          enableDelete
          enableDuplicate
          selectedSpellId={selectedSpellId}
          onDragSpell={onDragSpell}
          //onClickSpell={onClickSpell}
          //onDoubleClickSpell={onDoubleClickSpell ?? onEditSpell}
          //onContextMenu={onSpellContextMenu}
        />
      )}
      <div className="spell-browser-controls">
        <div>
          <Button>Filters</Button>
        </div>
        <div className="spell-browser-browse-mode">
          <Button
            className={cx(!isGrid && "selected")}
            onClick={() => setIsGrid(false)}
          >
            <Icon size="fill" icon="listViewFilled" />
          </Button>
          <Button
            className={cx(isGrid && "selected")}
            onClick={() => setIsGrid(true)}
          >
            <Icon size="fill" icon="gridFilled" />
          </Button>
        </div>
      </div>
      <Menu id={contextMenuId}>
        <Item id="duplicateSpell" onClick={onCtxMenuDuplicate}>
          Duplicate Spell
        </Item>
        <Item id="deleteSpell" onClick={onCtxMenuDelete}>
          Delete Spell
        </Item>
        <Item id="changeSpell" onClick={onCtxMenuChange}>
          Change
        </Item>
        <Item id="openSpellInEditor" onClick={onCtxMenuEdit}>
          Edit in Code Editor
        </Item>
      </Menu>
    </div>
  );
}
