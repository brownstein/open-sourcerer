import {
  FormControl,
  InputAdornment,
  MenuItem,
  Select,
  TextField,
  ToggleButton,
  ToggleButtonGroup
} from "@mui/material";
import { useCallback, useContext, useId, useMemo, useState } from "react";
import { Item, Menu, useContextMenu } from "react-contexify";

import { ItemData } from "src/api/item";
import { ModalConfigType } from "src/api/modal";
import {
  SavedSpell,
  SpellItemData,
  isSpellItemData,
  itemDataToSavedSpell
} from "src/api/spells";
import { GameControllerContext } from "src/components/context/GameControllerContext";
import { DraggableDropResult } from "src/components/ui/draggable/dragUtil";
import { Icon, IconName } from "src/components/ui/icons/Icon";
import { ItemDataToHotkeyassignment } from "src/components/ui/item/HotKeyRow";
import { useAppDispatch, useAppSelector } from "src/redux/hooks";
import {
  Orders,
  orderFunctions,
  selectedItemTypes
} from "src/redux/inventory/selectors";
import { assignHotKey } from "src/redux/inventory/slice";
import { ItemTypes } from "src/redux/inventory/slice";
import {
  openCodeEditor,
  pushModal,
  pushModalTyped
} from "src/redux/shared/actions";

import "./ItemBrowser.less";
import { ItemGrid } from "./ItemGrid";
import { SpellList } from "./SpellList";

export type ItemBrowserProps = {
  enableDrag?: boolean;
  selectedSpellId?: string;
};

export const itemTypesIcons: Record<ItemTypes, IconName> = {
  [ItemTypes.weapon]: "bagcloth",
  [ItemTypes.consumable]: "potion",
  [ItemTypes.spell]: "bookFilled",
  [ItemTypes.quest]: "key"
};

export function ItemBrowser(props: ItemBrowserProps) {
  const controller = useContext(GameControllerContext);
  const { enableDrag, selectedSpellId } = props;

  const [itemType, setItemType] = useState<ItemTypes>(ItemTypes.weapon);
  const [orderBy, setOrderBy] = useState<Orders>(Orders.alphabetical);

  const [_isSearchOpen, _setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const dispatch = useAppDispatch();

  const _handleClick = (
    event: React.MouseEvent<HTMLElement>,
    newItemType: ItemTypes | null
  ) => {
    if (newItemType !== null) {
      // Prevents deselecting
      setItemType(newItemType);
    }
  };

  const unprocessedItems = useAppSelector(selectedItemTypes[itemType]);

  const items = useMemo(() => {
    let processedItems = unprocessedItems;
    switch (itemType) {
      case "spell":
        processedItems = (unprocessedItems as SpellItemData[]).filter((i) =>
          i.scriptName
            ? i.scriptName.toLowerCase().includes(searchQuery.toLowerCase())
            : false
        );
        break;
      default:
        processedItems = unprocessedItems.filter((i) =>
          i.type.toLowerCase().includes(searchQuery.toLowerCase())
        );
        break;
    }

    return processedItems.sort(orderFunctions[orderBy]);
  }, [orderBy, unprocessedItems, searchQuery, itemType]);

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

  const onDoubleClick = useCallback(
    (item: ItemData) => {
      let assignment = ItemDataToHotkeyassignment(item);
      if (!controller || !assignment) return;
      controller.handleHotKeyAssignment(assignment);
    },
    [controller]
  );

  const contextMenuId = useId();
  const [contextMenuSelection, setContextMenuSelection] =
    useState<SavedSpell | null>(null);

  const { show: showContextMenu } = useContextMenu({
    id: contextMenuId
  });

  const onSpellContextMenu = useCallback(
    (e: React.MouseEvent, item: SpellItemData) => {
      setContextMenuSelection(itemDataToSavedSpell(item));
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

  return (
    <div className="item-browser">
      <div className="item-browser-tabs">
        <ToggleButtonGroup
          value={itemType}
          exclusive
          onChange={(e, newItemType) =>
            newItemType ? setItemType(newItemType) : undefined
          }
          aria-label="lalotsi"
          className="item-browser-tabs-buttons"
        >
          {Object.values(ItemTypes).map((type) => (
            <ToggleButton key={type} value={type}>
              <Icon icon={itemTypesIcons[type]} size="font" />
            </ToggleButton>
          ))}
        </ToggleButtonGroup>

        <FormControl className="item-browser-tabs-dropdown">
          <Select
            className="order-select"
            labelId="orderLabel"
            value={orderBy}
            onChange={(event) => setOrderBy(event.target.value)}
            sx={{
              "& .MuiSvgIcon-root": {
                color: "white"
              }
            }}
          >
            {Object.values(Orders).map((o, i) => (
              <MenuItem key={i} value={o}>
                {o}
              </MenuItem>
            ))}
          </Select>
          <TextField
            className="search-box"
            type="text"
            placeholder="Search items..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            slotProps={{
              input: {
                endAdornment: (
                  <InputAdornment position="start" disablePointerEvents>
                    <Icon icon="searchFilled" size="font" />
                  </InputAdornment>
                )
              }
            }}
          />
        </FormControl>
      </div>

      {/* Filter your items based on searchQuery before passing to lists */}
      {itemType === "spell" ? (
        <SpellList
          items={items as SpellItemData[]}
          enableDrag={enableDrag}
          enableEdit
          enableEditCode
          enableDelete
          enableDuplicate
          selectedSpellId={selectedSpellId}
          onDragSpell={onDragSpell}
          onDoubleClickSpell={onDoubleClick}
          onContextMenu={onSpellContextMenu}
        />
      ) : (
        <ItemGrid
          className="item-browser-item-grid"
          enableDrag={enableDrag}
          onDoubleClickItem={onDoubleClick}
          items={items}
        />
      )}

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
