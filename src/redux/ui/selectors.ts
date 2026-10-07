import { createSelector } from "@reduxjs/toolkit";
import { IJsonRowNode, IJsonTabNode, IJsonTabSetNode } from "flexlayout-react";

import { ModalInstanceType } from "src/api/modal";
import {
  ComponentConfigType,
  KnownComponentTypesWithConfig
} from "src/components/ui/config/types";

import { RootState } from "../store";
import { EnableElements } from "./slice";
import { AnyJsonNode, isRowNode, isTabNode, isTabSetNode } from "./util";

export const selectLayout = (state: RootState) => state.ui.layout;

export const selectUIElementEnabled = (
  state: RootState,
  elementName: EnableElements
) => !!state.ui.enableElements[elementName];

export const selectLayoutEnabled = (state: RootState) =>
  selectUIElementEnabled(state, EnableElements.Layout);

export function selectComponentConfigs(state: RootState) {
  return state.ui.layoutComponentState;
}

export const selectComponentConfigsByComponentName = createSelector(
  [
    (state: RootState) => state.ui.layout,
    (state: RootState) => state.ui.layoutComponentState
  ],
  (
    layout,
    componentStates
  ): Record<string, [string, ComponentConfigType][]> => {
    const configsByComponentName: Record<
      string,
      [string, ComponentConfigType][]
    > = {};
    const _traverse = function (
      node: IJsonRowNode | IJsonTabNode | IJsonTabSetNode
    ) {
      if (isTabNode(node)) {
        const tabId = node.id ?? "";
        const componentName = node.component ?? "";
        const componentState = componentStates[node.id ?? ""];
        if (!configsByComponentName[componentName])
          configsByComponentName[componentName] = [];
        configsByComponentName[componentName].push([tabId, componentState]);
        return;
      }
      for (const child of node.children ?? []) {
        _traverse(child);
      }
    };
    _traverse(layout);
    return configsByComponentName;
  }
);

export function selectComponentConfigById<
  T extends KnownComponentTypesWithConfig | string
>(state: RootState, id?: string): ComponentConfigType<T> | undefined {
  if (id === undefined) return undefined;
  return state.ui.layoutComponentState[id] as
    | ComponentConfigType<T>
    | undefined;
}

export const selectLayoutTabsByComponentConfigId = createSelector(
  [(state: RootState) => state.ui.layout],
  (layout) => {
    const tabsByComponentConfigId = new Map<string, IJsonTabNode>();
    const _traverse = function (
      node: IJsonRowNode | IJsonTabSetNode | IJsonTabNode
    ) {
      if (isRowNode(node) || isTabSetNode(node)) {
        for (const childNode of node.children ?? []) _traverse(childNode);
        return;
      }
      if (!node.id) return;
      tabsByComponentConfigId.set(node.id, node);
    };
    _traverse(layout);
    return tabsByComponentConfigId;
  }
);

export const selectLayoutNestingsByTabNodeId = createSelector(
  [selectLayout],
  (layout) => {
    const result = new Map<string, AnyJsonNode[]>();
    const _traverse = (node: AnyJsonNode, chain: AnyJsonNode[]) => {
      if (isRowNode(node) || isTabSetNode(node)) {
        for (const childNode of node.children ?? [])
          _traverse(childNode, [...chain, childNode]);
        return;
      }
      if (!node.id) return;
      result.set(node.id, [...chain, node]);
    };
    _traverse(layout, []);
    return result;
  }
);

export const selectLayoutTabsByComponentName = createSelector(
  [selectLayout],
  (layout) => {
    const result = new Map<string, IJsonTabNode[]>();
    const _traverse = (node: AnyJsonNode) => {
      if (isRowNode(node) || isTabSetNode(node)) {
        for (const childNode of node.children ?? []) _traverse(childNode);
        return;
      }
      if (!node.id) return;
      if (!result.has(node.component ?? ""))
        result.set(node.component ?? "", []);
      result.get(node.component ?? "")?.push(node);
    };
    _traverse(layout);
    return result;
  }
);

export type LayoutPathNode = {
  node?: AnyJsonNode;
  direction?: "row" | "column";
};

export const selectLayoutPathToViewport = createSelector(
  [selectLayout],
  (layout) => {
    const _traverse = (
      node: AnyJsonNode,
      isColumn = false
    ): LayoutPathNode[] | null => {
      if (node.id === undefined) return null;
      if (isTabNode(node)) {
        if (node.config?.componentName === "viewport") {
          return [
            {
              node
            }
          ];
        }
        return null;
      }
      if (isRowNode(node)) {
        for (const childNode of node.children ?? []) {
          const childNodeResult = _traverse(childNode, !isColumn);
          if (childNodeResult !== null)
            return [
              {
                node,
                direction: isColumn ? "column" : "row"
              },
              ...childNodeResult
            ];
        }
        return null;
      }
      if (isTabSetNode(node)) {
        for (const childNode of node.children ?? []) {
          const childNodeResult = _traverse(childNode, undefined);
          if (childNodeResult !== null) return [{ node }, ...childNodeResult];
        }
        return null;
      }
      return null;
    };
    return _traverse(layout);
  }
);

export function _layoutPathToNodeId(
  node: AnyJsonNode,
  nodeId: string,
  isColumn = false
): LayoutPathNode[] | null {
  if (node.id === nodeId)
    return [
      {
        node,
        direction: isRowNode(node) ? (isColumn ? "column" : "row") : undefined
      }
    ];
  if (isRowNode(node)) {
    for (const childNode of node.children ?? []) {
      const childNodeResult = _layoutPathToNodeId(childNode, nodeId, !isColumn);
      if (childNodeResult !== null)
        return [
          {
            node,
            direction: isColumn ? "column" : "row"
          },
          ...childNodeResult
        ];
    }
  }
  if (isTabSetNode(node)) {
    for (const childNode of node.children ?? []) {
      const childNodeResult = _layoutPathToNodeId(childNode, nodeId, undefined);
      if (childNodeResult !== null) return [{ node }, ...childNodeResult];
    }
  }
  return null;
}

export const selectLayoutPathToNodeId = createSelector(
  [selectLayout, (_state, nodeId: string | undefined | null) => nodeId],
  (layout, nodeId) => {
    if (nodeId === null || nodeId === undefined) return null;
    return _layoutPathToNodeId(layout, nodeId);
  }
);

const defaultEmptyModalArray: ModalInstanceType[] = [];

export const selectModalStack = (state: RootState) =>
  state.ui.modalStack ?? defaultEmptyModalArray;

export const selectEditorFontSize = (state: RootState) =>
  state.ui.editorFontSize;

export const selectCurrentTutorialId = (state: RootState) =>
  state.ui.tutorialQueue.at(0);

export const selectCurrentTutorialStep = (state: RootState) =>
  state.ui.tutorialStep ?? 0;

export const selectIsDarkMode = (state: RootState) => !state.ui.lightMode;
