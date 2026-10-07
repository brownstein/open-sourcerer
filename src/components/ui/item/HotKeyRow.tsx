import cx from "classnames";
import {
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState
} from "react";
import { Item, Menu, useContextMenu } from "react-contexify";
import "react-contexify/ReactContexify.css";
import { getEmptyImage } from "react-dnd-html5-backend";

import { HotKeyToDisplayName, HotKeys, OrderedHotKeys } from "src/api/hotkeys";
import { ItemData } from "src/api/item";
import { SpellCtx, SpellsAPIEvents, isSpellItemData } from "src/api/spells";
import { GameControllerContext } from "src/components/context/GameControllerContext";
import {
  HotbarDragLocation,
  kDraggableItemType,
  standardUseDrag,
  standardUseDrop
} from "src/components/ui/draggable/dragUtil";
import { ItemRenderer } from "src/components/ui/item/ItemRenderer";
import { useAppDispatch, useAppSelector, useAppStore } from "src/redux/hooks";
import {
  selectEquippedWeapon,
  selectHotKeyItems,
  selectHotKeyItemsForRow,
  selectHotKeyMap,
  selectHotKeysUsedAt
} from "src/redux/inventory/selectors";
import {
  ConsumableHotKeyAssignment,
  EquippedWeaponTypes,
  HotKeyAssignment,
  SpellHotKeyAssignment,
  WeaponHotKeyAssignment,
  assignHotKey,
  assignHotKeys
} from "src/redux/inventory/slice";
import { selectScriptById } from "src/redux/scriptLibrary/selectors";
import { openCodeEditor } from "src/redux/shared/actions";
import { delay } from "src/scripting/core/util";

import "./HotKeyRow.less";

export type HotKeySlotProps = {
  item?: ItemData | null;
  enableClickToUse?: boolean;
  enableDragOut?: boolean;
  hotKey: HotKeys;
  interactive?: boolean;
};

export function ItemDataToHotkeyassignment(
  item: ItemData | null
): HotKeyAssignment | null {
  switch (item?.type) {
    case "spell":
      return {
        type: "spell",
        scriptId: item?.scriptId as string
      } as SpellHotKeyAssignment;
    case "Sword":
    case "Bow":
      return {
        type: "weapon",
        weaponType: item.type as EquippedWeaponTypes
      } as WeaponHotKeyAssignment;
    default:
      if (item?.type) {
        return {
          type: "consumable",
          itemType: item.type,
          itemVariant: item.variant
        } as ConsumableHotKeyAssignment;
      }
  }
  return null;
}

export function HotkeyassignmentToItemData(
  assignment: HotKeyAssignment | null
): ItemData | null {
  switch (assignment?.type) {
    case "spell":
      return {
        type: "spell",
        scriptId: assignment?.scriptId as string
      } as SpellHotKeyAssignment;
    case "weapon":
      return {
        type: assignment.weaponType
      } as ItemData;
    case "consumable":
      return {
        type: assignment.itemType,
        variant: assignment?.itemVariant
      } as ItemData;
  }
  return null;
}

export function HotKeySlot(props: HotKeySlotProps) {
  const { enableClickToUse, enableDragOut, item, hotKey, interactive } = props;
  const controller = useContext(GameControllerContext);
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const inventorySlots = useAppSelector(selectHotKeyMap);
  const equippedWeapon = useAppSelector(selectEquippedWeapon);
  const inventoryItem = inventorySlots[hotKey];
  const ref = useRef<HTMLDivElement | null>(null);

  const contextMenuId = useId();
  const { show } = useContextMenu({
    id: contextMenuId
  });

  const dragLocation = useMemo<HotbarDragLocation>(
    () => ({
      location: "hotbar",
      hotKey
    }),
    [hotKey]
  );

  const [{ isOver }, drop] = standardUseDrop({
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

  const [{ isDragging }, drag, preview] = standardUseDrag({
    type: kDraggableItemType,
    canDrag: interactive !== false,
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
        if (dropResult?.draggedTo?.location === "hotbar") {
          // FIXME.
          let newAssignment = ItemDataToHotkeyassignment(item ?? null);

          dispatch(
            assignHotKeys([
              {
                hotKey,
                fromHotKey: dropResult.draggedTo.hotKey
              },
              {
                hotKey: dropResult.draggedTo.hotKey,
                assignment: newAssignment
              }
            ])
          );
        } else if (dropResult?.draggedTo?.location === "itemGrid") {
          //Nothing
        }
      } else if (enableDragOut !== false) {
        dispatch(
          assignHotKey({
            hotKey,
            assignment: null
          })
        );
      }
    }
  });

  useEffect(() => {
    preview(getEmptyImage(), { captureDraggingState: true });
  }, [preview]);

  drag(drop(ref));

  const onClick = useCallback(() => {
    if (!controller || !enableClickToUse || !inventoryItem) return;
    controller.handleHotKey(hotKey);
  }, [controller, enableClickToUse, hotKey, inventoryItem]);

  const itemActive = useMemo(
    () => item?.type === equippedWeapon,
    [item, equippedWeapon]
  );

  const onEditSpell = useCallback(() => {
    if (!item || !isSpellItemData(item)) return;
    const scriptId = item.scriptId;
    const spell = selectScriptById(store.getState(), scriptId);
    if (!spell) return;
    dispatch(
      openCodeEditor({
        code: spell.code,
        spell
      })
    );
  }, [dispatch, store, item]);

  // ACTIVE DEV.
  const [spellActive, setSpellActive] = useState(false);
  useEffect(() => {
    const spellRuntime = controller?.spellRuntime;
    if (!spellRuntime || !item || !isSpellItemData(item)) {
      setSpellActive(false);
      return () => {};
    }
    const { scriptId } = item;
    let active = false;
    for (const spellCtx of Object.values(spellRuntime.getSpellCtxs() ?? {})) {
      if (spellCtx.savedScriptId === scriptId) {
        active = true;
        break;
      }
    }
    setSpellActive(active);
    const onCtxStart = (ctx: SpellCtx) => {
      if (ctx.savedScriptId === scriptId) setSpellActive(true);
    };
    const onCtxEnd = (ctx: SpellCtx) => {
      if (ctx.savedScriptId === scriptId) setSpellActive(false);
    };
    spellRuntime.events.setMaxListeners(
      spellRuntime.events.getMaxListeners() + 2
    );
    spellRuntime.events.on(SpellsAPIEvents.runSpellStart, onCtxStart);
    spellRuntime.events.on(SpellsAPIEvents.runSpellEnd, onCtxEnd);
    return () => {
      spellRuntime.events.off(SpellsAPIEvents.runSpellStart, onCtxStart);
      spellRuntime.events.off(SpellsAPIEvents.runSpellEnd, onCtxEnd);
      spellRuntime.events.setMaxListeners(
        spellRuntime.events.getMaxListeners() - 2
      );
    };
  }, [item, controller]);

  const hotKeysUsedAt = useAppSelector(selectHotKeysUsedAt);
  const hotKeyUsedAt = hotKeysUsedAt[hotKey];
  const [playingUsageAnimation, setPlayingUsageAnimation] = useState(false);
  useEffect(() => {
    if (hotKeyUsedAt === undefined) return;
    if (Date.now() < hotKeyUsedAt + 500) {
      setPlayingUsageAnimation(true);
      delay(400).then(() => setPlayingUsageAnimation(false));
    }
  }, [hotKeyUsedAt]);

  const currentItemRef = useRef(item?.type);
  const [playingEquippedAnimation, setPlayingEquippedAnimation] =
    useState(false);
  useEffect(() => {
    if (currentItemRef.current === item?.type) return;
    currentItemRef.current = item?.type;
    if (item) {
      setPlayingEquippedAnimation(true);
      delay(300).then(() => setPlayingEquippedAnimation(false));
    }
  }, [item]);
  const animationClassName = playingEquippedAnimation
    ? "hotkey-content-equipped"
    : undefined;

  return (
    <>
      <div
        onContextMenu={(e) => show({ event: e })}
        className={cx("hotkey-item", {
          "item-active": itemActive || spellActive,
          "drop-hovering": isOver,
          "dragging-from": isDragging,
          clickable: !!enableClickToUse && !!item
        })}
        ref={ref}
        onClick={onClick}
      >
        <div className={item ? "hotkey-item-icon" : "hotkey-empty-display"}>
          {item ? (
            <ItemRenderer item={item} className={animationClassName} />
          ) : (
            HotKeyToDisplayName[hotKey]
          )}
          {item?.count && <div className="hotkey-item-count">{item.count}</div>}
          {playingUsageAnimation && (
            <div className="hotkey-item-usage-indicator">
              <div className="hotkey-item-usage-indicator-flash" />
            </div>
          )}
        </div>
      </div>
      <Menu id={contextMenuId}>
        {item?.type === "spell" && (
          <Item id="editInSpellEditor" onClick={onEditSpell}>
            Edit Spell
          </Item>
        )}
      </Menu>
    </>
  );
}

export type HotKeyRowProps = {
  interactive?: boolean;
  enableDragOut?: boolean;
  vertical?: boolean;
  row?: number;
  rowWidth?: number;
};

export function HotKeyRow(props: HotKeyRowProps) {
  const { interactive, enableDragOut, vertical, row, rowWidth: _rowWidth = 5 } = props;

  const itemsByHotkeyDefault = useAppSelector(selectHotKeyItems);
  const itemsByHotkeyForRow = useAppSelector((state) =>
    row !== undefined ? selectHotKeyItemsForRow(state, row) : null
  );
  const itemsByHotkey = itemsByHotkeyForRow ?? itemsByHotkeyDefault;

  return (
    <div className={cx("hotkey-row-container", vertical && "vertical")}>
      {OrderedHotKeys.map((hk) => (
        <div
          className={cx(
            "hotkey-row-item",
            !itemsByHotkey[hk] && "hotkey-row-item-empty"
          )}
          key={hk}
        >
          <HotKeySlot
            item={itemsByHotkey[hk]}
            hotKey={hk}
            interactive={interactive}
            enableClickToUse
            enableDragOut={enableDragOut}
          />
        </div>
      ))}
    </div>
  );
}
