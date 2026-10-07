import { Object3D } from "three";

import { EntityProps } from "src/api/entity";
import { ResourceDefinition } from "src/api/loader";
import { ConfigDefType } from "src/api/util";

// Flat objects to be stored in Redux.
export type HudItemData = {
  type: string;
  variant?: string;
  [key: string]: unknown;
};

// Renderable items for use in the Hud.
export type HudItemRenderInstance = {
  readonly object3D: Object3D;
  dispose?(): void;
};

export type HudItemDefinition = {
  type: string;
  variant?: string;
  // Items must be renderable.
  getRenderInstance(props: HudItemData): HudItemRenderInstance;
  getEntityProps?(props: HudItemData): EntityProps;
  configDef?: ConfigDefType;
} & ResourceDefinition;

// Validator to ensure classes adhere to the ItemDefinition spec.
export function assertStaticHudItemDefinitionProps<T extends HudItemDefinition>(
  clazz: T
) {}
