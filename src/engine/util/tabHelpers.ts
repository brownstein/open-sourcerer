import { IJsonTabSetNode } from "flexlayout-react";
import shortid from "shortid";

import {
  ComponentConfigType,
  KnownComponentTypesWithConfig
} from "src/components/ui/config/types";
import { updateLayoutExt } from "src/redux/shared/actions";
import { AppDispatch, AppStore, RootState } from "src/redux/store";
import {
  _layoutPathToNodeId,
  selectComponentConfigs,
  selectLayout
} from "src/redux/ui/selectors";
import {
  AnyJsonNode,
  isRowNode,
  isTabNode,
  isTabSetNode
} from "src/redux/ui/util";

export type RelativePositionString =
  | "left"
  | "right"
  | "top"
  | "bottom"
  | "shared";

export function buildOpenTabExtAction({
  extendAction,
  currentNodeId,
  componentName,
  componentConfig: componentConfigIn,
  relativePosition: relativePositionIn,
  duration,
  relativeWeight: relativeWeightIn
}: {
  // Current state.
  extendAction: ReturnType<typeof updateLayoutExt>;
  currentNodeId: string;
  componentName: string;
  componentConfig?: Record<string, unknown> | null;
  relativePosition: RelativePositionString;
  duration?: number;
  relativeWeight?: number;
}): ReturnType<typeof updateLayoutExt> {
  // Identify parameters.
  let componentConfig = componentConfigIn;
  let relativeWeight = relativeWeightIn ?? 0.5;
  let relativePositionString = relativePositionIn;
  let optExtra: Parameters<typeof updateLayoutExt>[0] = {
    layout: extendAction.payload.layout,
    componentConfigs: extendAction?.payload.componentConfigs,
    transitions: extendAction?.payload.transitions,
    editor: extendAction?.payload.editor
  };

  // Construct new layout and transitions.
  const layout = optExtra.layout;
  const currentNodePath = _layoutPathToNodeId(layout, currentNodeId);

  // TODO: implement a logical section where we base the opening behavior off of the current
  // tab position and available screen real estate.

  // Measure current layout.
  // const layoutEl = document.querySelector(".flexlayout__layout");
  // if (layoutEl) {
  //   const layoutRect = layoutEl.getBoundingClientRect();
  //   const isWide = layoutRect.width > layoutRect.height;
  // }

  const newTab = {
    id: shortid(),
    type: "tab",
    component: componentName
  };
  const mutations = new Map<string, (node: AnyJsonNode) => AnyJsonNode>();
  const opt: Parameters<typeof updateLayoutExt>[0] = {
    ...optExtra,
    layout,
    componentConfigs: {
      ...optExtra.componentConfigs,
      [newTab.id]: {
        ...componentConfig
      }
    },
    transitions: [...(optExtra.transitions ?? [])]
  };

  // Handle case where we want another tab in a tabset.
  let replaced = false;
  if (relativePositionIn === "shared" && currentNodePath) {
    let tabSet: IJsonTabSetNode | undefined;
    for (let i = currentNodePath.length - 1; i >= 0; i--) {
      const pathNode = currentNodePath.at(i);
      if (!pathNode?.node) continue;
      if (isTabSetNode(pathNode.node)) {
        tabSet = pathNode.node;
        break;
      }
    }
    if (tabSet?.id) {
      replaced = true;
      mutations.set(tabSet.id, (tabSet) =>
        isTabSetNode(tabSet)
          ? {
              ...tabSet,
              selected: tabSet.children?.length ?? 0,
              children: [...(tabSet.children ?? []), newTab]
            }
          : tabSet
      );
    }
  }
  if (!replaced) {
    if (currentNodePath === undefined || currentNodePath === null) {
      throw new Error("Unable to identify current node path");
    }

    let childPathRow = currentNodePath.at(-2);
    let parentPathRow = currentNodePath.at(-3);

    const newTabSet: IJsonTabSetNode = {
      id: shortid(),
      type: "tabset",
      weight: duration ? 0 : undefined,
      selected: 0,
      children: [newTab]
    };
    let indexOffset = 0;
    switch (relativePositionString) {
      case "right":
      case "bottom":
        indexOffset = 1;
        break;
      default:
        break;
    }
    let needsSubdivide = false;
    switch (relativePositionString) {
      case "left":
      case "right":
        if (parentPathRow?.direction === "column") {
          needsSubdivide = true;
        }
        break;
      case "bottom":
      case "top":
        if (parentPathRow?.direction === "row") {
          needsSubdivide = true;
        }
        break;
      default:
        break;
    }

    if (
      needsSubdivide &&
      parentPathRow?.node &&
      childPathRow?.node &&
      isRowNode(parentPathRow.node) &&
      (isRowNode(childPathRow.node) || isTabSetNode(childPathRow.node))
    ) {
      const oldChildId = childPathRow?.node?.id;
      const newChildId = shortid();
      mutations.set(parentPathRow.node.id ?? "", (node) => ({
        ...node,
        type: "row",
        weight: !isTabNode(node) ? node.weight ?? 100 : 100,
        children: isRowNode(node)
          ? node.children?.map((child) => {
              if (child.id !== oldChildId) return child;
              return {
                ...child,
                id: oldChildId,
                type: "row",
                weight: child.weight ?? 100,
                children: [
                  {
                    ...child,
                    weight:
                      isRowNode(child) || isTabSetNode(child)
                        ? // Note that this fallback is intentionally boolean to coerce 0s.
                          child.weight || 100
                        : undefined,
                    id: newChildId
                  }
                ]
              };
            })
          : undefined
      }));
      parentPathRow = {
        node: {
          id: oldChildId,
          type: "row",
          weight: parentPathRow.node.weight,
          children: parentPathRow.node.children
        },
        direction: parentPathRow.direction === "row" ? "column" : "row"
      };
      childPathRow = {
        node: {
          ...childPathRow.node,
          id: newChildId
        }
      };
    }
    if (parentPathRow === undefined) {
      opt.layout = {
        type: "row",
        id: shortid(),
        children: [opt.layout]
      };
      if (
        relativePositionString === "top" ||
        relativePositionString === "bottom"
      ) {
        opt.layout.weight = 1;
        parentPathRow = {
          node: opt.layout,
          direction: "column"
        };
        if (childPathRow) childPathRow.direction = "row";
        opt.layout = {
          type: "row",
          id: shortid(),
          children: [opt.layout]
        };
      } else {
        parentPathRow = {
          node: opt.layout,
          direction: "row"
        };
        if (childPathRow) childPathRow.direction = "column";
      }
    }
    const weightSum =
      parentPathRow?.node !== undefined && isRowNode(parentPathRow.node)
        ? parentPathRow.node.children?.reduce(
            (acc, v) => acc + (v.weight ?? 100),
            0
          ) ?? 0
        : 1;

    if (parentPathRow?.node?.id) {
      mutations.set(parentPathRow.node.id, (node) => {
        if (!isRowNode(node)) return node;
        let childIndex =
          node.children?.findIndex((c) => c.id === childPathRow?.node?.id) ?? 0;
        if (childIndex === -1) childIndex = 0;
        if (newTabSet.weight === undefined) {
          newTabSet.weight =
            relativeWeight *
              (node.children?.reduce(
                (acc, c) =>
                  acc + (isRowNode(c) || isTabSetNode(c) ? c.weight ?? 1 : 1),
                0
              ) ?? 0) || 1;
        }
        return {
          ...node,
          weight: node.weight ?? 100,
          children: [
            ...(node.children?.slice(0, childIndex + indexOffset) ?? []),
            newTabSet,
            ...(node.children?.slice(childIndex + indexOffset) ?? [])
          ]
        };
      });
      if (duration) {
        opt.transitions?.push({
          id: newTabSet.id ?? "",
          relativeWeight,
          duration
        });
      } else {
        newTabSet.weight = weightSum * relativeWeight;
      }
    }
  }

  const _traverseApply = (node: AnyJsonNode): AnyJsonNode => {
    let workingNode = node;
    const nodeMutation = mutations.get(node.id ?? "");
    if (nodeMutation !== undefined) {
      workingNode = nodeMutation(workingNode);
      mutations.delete(node.id ?? "");
    }
    if (isRowNode(workingNode)) {
      workingNode = {
        ...workingNode,
        children: workingNode.children
          ?.map(_traverseApply)
          .filter((c) => (!!c && isRowNode(c)) || isTabSetNode(c))
      };
    }
    if (isTabSetNode(workingNode)) {
      workingNode = {
        ...workingNode,
        children: workingNode.children
          ?.map(_traverseApply)
          .filter((c) => !!c && isTabNode(c))
      };
    }
    return workingNode;
  };

  const newLayout = _traverseApply(opt.layout);
  if (isRowNode(newLayout)) opt.layout = newLayout;
  return updateLayoutExt(opt);
}

function buildCloseTabExtAction({
  extendAction,
  nodeId,
  duration
}: {
  // Current state.
  extendAction: ReturnType<typeof updateLayoutExt>;
  nodeId: string;
  duration?: number;
}): ReturnType<typeof updateLayoutExt> {
  const opt: Parameters<typeof updateLayoutExt>[0] = {
    ...extendAction.payload,
    layout: extendAction.payload.layout,
    transitions: [...(extendAction?.payload.transitions ?? [])]
  };

  if (duration) {
    const nodePath = _layoutPathToNodeId(opt.layout, nodeId);
    const parentTabSetNode = nodePath?.at(-2)?.node;
    const parentRowNode = nodePath?.at(-3)?.node;
    if (
      parentTabSetNode?.id &&
      isTabSetNode(parentTabSetNode) &&
      parentTabSetNode.children?.length === 1
    ) {
      opt.transitions?.push({
        id: parentTabSetNode.id,
        duration,
        relativeWeight: 0,
        closeAfterComplete: true
      });
      if (
        parentRowNode?.id &&
        isRowNode(parentRowNode) &&
        parentRowNode.children?.length === 1
      ) {
        opt.transitions?.push({
          id: parentRowNode.id,
          duration,
          relativeWeight: 0,
          closeAfterComplete: true
        });
      }
      return updateLayoutExt(opt);
    }
  }

  function _traverseApply(node: AnyJsonNode): AnyJsonNode | null {
    if (node.id === nodeId) return null;
    if (isTabSetNode(node)) {
      const workingNode = {
        ...node,
        children: node.children?.map(_traverseApply).filter((c) => !!c)
      };
      if ((workingNode.children?.length ?? 0) === 0) return null;
      if ((workingNode.children?.length ?? 0) - 1 < (workingNode.selected ?? 0))
        delete workingNode.selected;
      return workingNode;
    }
    if (isRowNode(node)) {
      const workingNode = {
        ...node,
        children: node.children?.map(_traverseApply).filter((c) => !!c)
      };
      if ((workingNode.children?.length ?? 0) === 0) return null;
      if (
        workingNode.children?.length === 1 &&
        isRowNode(workingNode.children[0]) &&
        workingNode.children[0].children?.length === 1 &&
        isRowNode(workingNode.children[0].children[0])
      ) {
        return {
          ...workingNode.children[0].children[0],
          weight: workingNode.weight
        };
      }
      return workingNode;
    }
    return node;
  }
  const newLayout = _traverseApply(opt.layout);
  if (newLayout) {
    if (isRowNode(newLayout)) opt.layout = newLayout;
    if (isTabSetNode(newLayout)) {
      opt.layout = {
        type: "row",
        id: shortid(),
        weight: 100,
        children: [newLayout]
      };
    }
  }

  return updateLayoutExt(opt);
}

type LayoutMutationBuilderInternal = {
  _fromNodeId: string;
  _updateAction: ReturnType<typeof updateLayoutExt>;
  _currentState: RootState;
  _dispatch: AppDispatch;
};

export type LayoutMutationBuilder = LayoutMutationBuilderInternal & {
  openTab: (
    openTabOpt: Pick<
      Parameters<typeof buildOpenTabExtAction>[0],
      | "componentName"
      | "componentConfig"
      | "duration"
      | "relativePosition"
      | "relativeWeight"
    >,
    openTabOptExtra?: Pick<
      Parameters<typeof buildOpenTabExtAction>[0]["extendAction"]["payload"],
      "editor"
    >
  ) => LayoutMutationBuilder;
  closeTab: (
    closeTabDuration?: number,
    closeTabNodeId?: string
  ) => LayoutMutationBuilder;
  apply: () => void;
};

function _openTab(
  builder: LayoutMutationBuilderInternal,
  opt: Parameters<LayoutMutationBuilder["openTab"]>[0],
  // This is a kludge.
  extraPayload?: Pick<ReturnType<typeof updateLayoutExt>["payload"], "editor">
): LayoutMutationBuilder {
  const { _fromNodeId, _updateAction } = builder;
  const {
    componentName,
    componentConfig,
    duration,
    relativePosition,
    relativeWeight
  } = opt;
  return _mutateLayoutActions({
    ...builder,
    _updateAction: buildOpenTabExtAction({
      extendAction: {
        ..._updateAction,
        payload: { ...extraPayload, ..._updateAction.payload }
      },
      currentNodeId: _fromNodeId,
      componentName,
      componentConfig,
      relativePosition,
      duration,
      relativeWeight
    })
  });
}

function _closeTab(
  builder: LayoutMutationBuilderInternal,
  duration?: number,
  otherNodeId?: string
): LayoutMutationBuilder {
  const { _fromNodeId, _updateAction } = builder;
  return _mutateLayoutActions({
    ...builder,
    _updateAction: buildCloseTabExtAction({
      extendAction: _updateAction,
      nodeId: otherNodeId ?? _fromNodeId,
      duration
    })
  });
}

export function _mutateLayoutActions(
  intermediate: LayoutMutationBuilderInternal
): LayoutMutationBuilder {
  return {
    ...intermediate,
    openTab: _openTab.bind(null, intermediate),
    closeTab: _closeTab.bind(null, intermediate),
    apply: () => intermediate._dispatch(intermediate._updateAction)
  };
}

export function mutateLayout(
  store: AppStore,
  fromNodeId: string
): LayoutMutationBuilder {
  const state = store.getState();
  return _mutateLayoutActions({
    _fromNodeId: fromNodeId,
    _updateAction: updateLayoutExt({
      layout: selectLayout(state)
    }),
    _currentState: state,
    _dispatch: store.dispatch.bind(store)
  });
}

export function findLayoutTabNodePath(
  store: AppStore,
  predicate: (
    componentName: string,
    componentConfig?: ComponentConfigType
  ) => boolean
): AnyJsonNode[] | null {
  const state = store.getState();
  const layout = selectLayout(state);
  const componentConfigs = selectComponentConfigs(state);
  const _traverse = (node: AnyJsonNode): AnyJsonNode[] | null => {
    if (isTabNode(node)) {
      const componentName = node.component ?? "";
      const componentConfig = node.id ? componentConfigs[node.id] : undefined;
      if (predicate(componentName, componentConfig)) {
        return [node];
      }
      return null;
    }
    for (const child of node.children ?? []) {
      const result = _traverse(child);
      if (result) return [node, ...result];
    }
    return null;
  };
  return _traverse(layout);
}
