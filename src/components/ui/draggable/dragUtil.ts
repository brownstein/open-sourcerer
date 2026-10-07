import { useDrag, useDrop } from "react-dnd";

import { HotKeys } from "src/api/hotkeys";
import { ItemData } from "src/api/item";
import { IVector2 } from "src/engine/util/vecTypes";

export const kDraggableItemType = "item";
export const kDraggableEntityType = "entity";

export type HotbarDragLocation = {
  location: "hotbar";
  hotKey: HotKeys;
};

export type SpellInventoryDragLocation = {
  location: "spells";
};

export type ItemInventoryDragLocation = {
  location: "items";
};

export type WorldDragLocation = {
  location: "world";
};

export type ItemGridDragLocation = {
  location: "itemGrid";
};

export type DraggableItemLocation =
  | HotbarDragLocation
  | SpellInventoryDragLocation
  | ItemInventoryDragLocation
  | WorldDragLocation
  | ItemGridDragLocation;

export type DragData = {
  item?: ItemData | null;
  fromLocation?: DraggableItemLocation;
  positionUpdatedCallback?: (pos: IVector2, initialPos: IVector2) => void;
};

export type DraggableDropResult = {
  dragData: DragData;
  draggedTo?: DraggableItemLocation;
};

export type DragCollectedProps = {
  isDragging?: boolean;
  canDrop?: boolean;
  isOver?: boolean;
};

export type OnDropItemCallback = (result: DraggableDropResult | null) => void;
export type OnDropOutCallback = (result: DragData) => void;

export const standardUseDrag = useDrag<
  DragData,
  DraggableDropResult,
  DragCollectedProps
>;

export const standardUseDrop = useDrop<
  DragData,
  DraggableDropResult,
  DragCollectedProps
>;
