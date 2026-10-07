import { Object3D } from "three";

import { AssetConsumerType } from "./asset";
import { EntityProps } from "./entity";
import { ResourceDefinition } from "./loader";
import { ConfigDefType } from "./util";

// Flat objects to be stored in Redux.
export type ItemData = {
  type: string;
  variant?: string;
  count?: number;
  [key: string]: unknown;
};

// Renderable items for use in the inventory / hotbar.
export type ItemRenderInstance = {
  readonly object3D: Object3D;
  animate?: (ms: number) => void;
  dispose?(): void;
};

// This can be a const, but it's easiest to implement as a class
// because we want decorator support.
export type ItemDefinition = {
  type: string;
  variant?: string;

  variants?: string[]; //possible variants of current type
  // Items must be renderable.
  getRenderInstance(props: ItemData): ItemRenderInstance;
  // When items are dropped in the world, we need to create
  // entities for them. Let the entity system handle that,
  // but provide props for them.
  getEntityProps?(props: ItemData): EntityProps;
  // Can we drop this item, or are we stuck with it?
  cannotDrop?: boolean;
  // Is this a quest item?
  isQuestItem?: boolean;
  // Is this currency?
  isCurrency?: boolean;
  // Consumption callback.
  consume?(props: ItemData): void;
  // Equip callback.
  equip?(props: ItemData): void;
  // Unequip callback.
  unEquip?(props: ItemData): void;
  // TODO: USE THIS. Or strip.
  configDef?: ConfigDefType;
  // Whether to auto-equip the item.
  autoEquip?: boolean;
} & ResourceDefinition &
  AssetConsumerType;

// Validator to ensure classes adhere to the ItemDefinition spec. Man,
// do I wish there were a way to say that a class definition implemented
// method statically.
export function assertStaticItemDefinitionProps<T extends ItemDefinition>(
  clazz: T
) {}
