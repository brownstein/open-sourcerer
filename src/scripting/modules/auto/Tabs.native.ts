import { IJsonRowNode, IJsonTabNode, IJsonTabSetNode } from "flexlayout-react";
import * as yup from "yup";

import { buildOpenTabExtAction } from "src/engine/util/tabHelpers";
import { upsertEditor } from "src/redux/scriptEditor/slice";
import { closeTabs, openTab, updateLayoutExt } from "src/redux/shared/actions";
import {
  selectLayout,
  selectLayoutTabsByComponentName
} from "src/redux/ui/selectors";
import { updateComponentState, updateLayout } from "src/redux/ui/slice";
import {
  AnyJsonNode,
  isRowNode,
  isTabNode,
  isTabSetNode
} from "src/redux/ui/util";
import { SpellRuntimeModuleCtxAPI } from "src/scripting/runtime/SpellRuntimeAPI";

import { assertAutoBindableNativeModule } from "../autoAPI";
import {
  componentNameValidator,
  validComponentNameSet
} from "./validators/tabsValidators";

const tabIdValidator = yup.string().required("tabId is required.");

const resizeWeightValidator = yup
  .number()
  .required("weight is required.")
  .min(0, "weight must be between 0 and 1.")
  .max(1, "weight must be between 0 and 1.");

const validPositions = ["left", "right", "top", "bottom"] as const;
type Position = (typeof validPositions)[number];

const positionValidator = yup
  .string()
  .required("position is required.")
  .oneOf(
    [...validPositions],
    ({ value }) =>
      `Invalid position "${value}". Must be one of: ${validPositions.join(", ")}`
  );

const openTabArgsValidator = yup.object({
  componentName: componentNameValidator
});

const closeTabArgsValidator = yup.object({
  nameOrId: yup.string().required("closeTab requires a component name or tab ID.")
});

const populateEditorArgsValidator = yup.object({
  tabId: tabIdValidator,
  contents: yup.string().defined("contents is required.")
});

const maximizeArgsValidator = yup.object({
  tabId: tabIdValidator
});

const resizeArgsValidator = yup.object({
  tabId: tabIdValidator,
  weight: resizeWeightValidator
});

const moveArgsValidator = yup.object({
  tabId: tabIdValidator,
  position: positionValidator
});

/** Find a tab node and its parent tabset by tab ID. */
function findTabAndParentTabSet(
  layout: IJsonRowNode,
  tabId: string
): { tab: IJsonTabNode; tabSet: IJsonTabSetNode } | null {
  const _traverse = (
    node: AnyJsonNode,
    parentTabSet: IJsonTabSetNode | null
  ): { tab: IJsonTabNode; tabSet: IJsonTabSetNode } | null => {
    if (isTabNode(node)) {
      if (node.id === tabId && parentTabSet) {
        return { tab: node, tabSet: parentTabSet };
      }
      return null;
    }
    if (isTabSetNode(node)) {
      for (const child of node.children ?? []) {
        const result = _traverse(child, node);
        if (result) return result;
      }
    }
    if (isRowNode(node)) {
      for (const child of node.children ?? []) {
        const result = _traverse(child, null);
        if (result) return result;
      }
    }
    return null;
  };
  return _traverse(layout, null);
}

/** Toggle maximized on the tabset containing tabId. */
function toggleMaximize(layout: IJsonRowNode, tabId: string): IJsonRowNode {
  const _traverse = (node: IJsonRowNode | IJsonTabSetNode): boolean => {
    if (isTabSetNode(node)) {
      if (node.children?.some((tab) => tab.id === tabId)) {
        node.maximized = !node.maximized;
        return true;
      }
    }
    if (isRowNode(node)) {
      for (const child of node.children ?? []) {
        if (_traverse(child)) return true;
      }
    }
    return false;
  };
  const clone = structuredClone(layout);
  _traverse(clone);
  return clone;
}

/**
 * Set relative weight for the tabset containing tabId.
 * weight is a 0-1 ratio relative to siblings in the same row.
 */
function resizeTabSet(
  layout: IJsonRowNode,
  tabId: string,
  weight: number
): IJsonRowNode {
  const found = findTabAndParentTabSet(layout, tabId);
  if (!found) throw new Error(`No tab found with id "${tabId}".`);
  const targetTabSetId = found.tabSet.id;

  const _traverse = (node: AnyJsonNode): AnyJsonNode => {
    if (isTabNode(node)) return node;
    if (isRowNode(node)) {
      const targetIndex =
        node.children?.findIndex((c) => c.id === targetTabSetId) ?? -1;
      if (targetIndex >= 0) {
        const children = node.children?.map((child, i) => {
          if (i !== targetIndex) return child;
          let siblingsWeight = 0;
          for (let j = 0; j < (node.children?.length ?? 0); j++) {
            if (j === targetIndex) continue;
            siblingsWeight += node.children?.[j].weight ?? 100;
          }
          const clampedWeight = Math.max(0.01, Math.min(0.99, weight));
          const targetWeight =
            (siblingsWeight * clampedWeight) / (1 - clampedWeight);
          return { ...child, weight: targetWeight };
        });
        return {
          ...node,
          children: children as (IJsonRowNode | IJsonTabSetNode)[]
        };
      }
      return {
        ...node,
        children: node.children?.map(_traverse) as (
          | IJsonRowNode
          | IJsonTabSetNode
        )[]
      };
    }
    if (isTabSetNode(node)) {
      return {
        ...node,
        children: node.children?.map(_traverse) as IJsonTabNode[]
      };
    }
    return node;
  };
  return _traverse(layout) as IJsonRowNode;
}

/**
 * Remove a tab from the layout tree, cleaning up empty tabsets/rows.
 * Returns the pruned layout and the removed tab node.
 */
function extractTab(
  layout: IJsonRowNode,
  tabId: string
): { layout: IJsonRowNode; tab: IJsonTabNode } | null {
  let extractedTab: IJsonTabNode | null = null;

  const _traverse = (node: AnyJsonNode): AnyJsonNode | null => {
    if (isTabNode(node)) {
      if (node.id === tabId) {
        extractedTab = node;
        return null;
      }
      return node;
    }
    if (isTabSetNode(node)) {
      const children =
        node.children
          ?.map(_traverse)
          .filter((c): c is IJsonTabNode => c !== null) ?? [];
      if (children.length === 0) return null;
      return {
        ...node,
        children,
        selected:
          (node.selected ?? 0) >= children.length
            ? Math.max(0, children.length - 1)
            : node.selected
      };
    }
    if (isRowNode(node)) {
      const children =
        node.children
          ?.map(_traverse)
          .filter((c): c is IJsonRowNode | IJsonTabSetNode => c !== null) ?? [];
      if (children.length === 0) return null;
      if (children.length === 1 && isRowNode(children[0])) {
        return { ...children[0], weight: node.weight };
      }
      return { ...node, children };
    }
    return node;
  };

  const result = _traverse(layout);
  if (!extractedTab) return null;
  if (!result || !isRowNode(result)) return null;
  return { layout: result, tab: extractedTab };
}

@assertAutoBindableNativeModule
export default class TabsNative {
  private ctx: SpellRuntimeModuleCtxAPI;
  constructor(ctx: SpellRuntimeModuleCtxAPI) {
    this.ctx = ctx;
  }

  private getStore() {
    const store = this.ctx.store;
    if (!store) throw new Error("No store available.");
    return store;
  }

  openTab(opts: { componentName: string }) {
    const store = this.getStore();
    const { componentName } = openTabArgsValidator.validateSync(opts);
    const action = openTab({
      nextToTabId: "viewport",
      componentName,
      editorConfig: componentName === "codeEditor" ? { code: "" } : undefined
    });
    store.dispatch(action);
    return action.payload.tabId;
  }

  closeTab(opts: { nameOrId: string }) {
    const store = this.getStore();
    const { nameOrId } = closeTabArgsValidator.validateSync(opts);
    if (validComponentNameSet.has(nameOrId)) {
      const state = store.getState();
      const tabsByName = selectLayoutTabsByComponentName(state);
      const tabs = tabsByName.get(nameOrId);
      if (!tabs || tabs.length === 0) return;
      const ids = tabs.map((t) => t.id).filter((id): id is string => !!id);
      if (ids.length === 0) return;
      store.dispatch(closeTabs({ ids }));
    } else {
      store.dispatch(closeTabs({ ids: [nameOrId] }));
    }
  }

  populateEditor(opts: { tabId: string; contents: string }) {
    const store = this.getStore();
    const { tabId, contents } = populateEditorArgsValidator.validateSync(opts);
    const state = store.getState();
    const componentConfig = state.ui.layoutComponentState[tabId];
    const editorId = (componentConfig as Record<string, unknown>)?.editorId as
      | string
      | undefined;
    if (!editorId) {
      throw new Error(
        `Tab "${tabId}" is not a code editor or has no editor attached yet.`
      );
    }
    store.dispatch(
      upsertEditor({
        id: editorId,
        code: contents
      })
    );
  }

  maximize(opts: { tabId: string }) {
    const store = this.getStore();
    const { tabId } = maximizeArgsValidator.validateSync(opts);
    const layout = selectLayout(store.getState());
    const newLayout = toggleMaximize(layout, tabId);
    store.dispatch(updateLayout(newLayout));
  }

  resize(opts: { tabId: string; weight: number }) {
    const store = this.getStore();
    const { tabId, weight } = resizeArgsValidator.validateSync(opts);
    const layout = selectLayout(store.getState());
    const newLayout = resizeTabSet(layout, tabId, weight);
    store.dispatch(updateLayout(newLayout));
  }

  move(opts: { tabId: string; position: string }) {
    const store = this.getStore();
    const { tabId, position } = moveArgsValidator.validateSync(opts);
    const layout = selectLayout(store.getState());

    // Extract the tab's config info before removing it.
    const found = findTabAndParentTabSet(layout, tabId);
    if (!found) throw new Error(`No tab found with id "${tabId}".`);
    const componentName = found.tab.component;
    if (!componentName) {
      throw new Error(`Tab "${tabId}" has no component configuration.`);
    }

    // Extract the tab from the tree.
    const extracted = extractTab(layout, tabId);
    if (!extracted) throw new Error(`Failed to extract tab "${tabId}".`);

    // Collect all existing tab IDs so we can identify the new one after.
    const existingTabIds = new Set<string>();
    const _collectIds = (node: AnyJsonNode) => {
      if (isTabNode(node)) {
        if (node.id) existingTabIds.add(node.id);
        return;
      }
      if (isRowNode(node) || isTabSetNode(node)) {
        for (const child of node.children ?? []) _collectIds(child);
      }
    };
    _collectIds(extracted.layout);

    // Use buildOpenTabExtAction to place a new tab at the given position
    // relative to the viewport.
    const baseAction = updateLayoutExt({ layout: extracted.layout });
    const action = buildOpenTabExtAction({
      extendAction: baseAction,
      currentNodeId: "viewport",
      componentName,
      relativePosition: position as Position
    });

    // Find the new tab ID from the action's layout before dispatching.
    let newTabId: string | undefined;
    const _findNewTab = (node: AnyJsonNode) => {
      if (isTabNode(node)) {
        if (node.id && !existingTabIds.has(node.id)) {
          newTabId = node.id;
        }
        return;
      }
      if (isRowNode(node) || isTabSetNode(node)) {
        for (const child of node.children ?? []) _findNewTab(child);
      }
    };
    _findNewTab(action.payload.layout);

    store.dispatch(action);

    // Carry over original component config (e.g. editorId) to new config slot.
    if (newTabId !== undefined && tabId !== newTabId) {
      const currentState = store.getState();
      const originalConfig = currentState.ui.layoutComponentState[tabId];
      if (originalConfig) {
        const newConfig = {
          ...currentState.ui.layoutComponentState[newTabId],
          ...originalConfig
        };
        store.dispatch(updateComponentState([newTabId, newConfig]));
      }
    }

    return newTabId;
  }
}
