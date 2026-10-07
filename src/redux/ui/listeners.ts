import { createListenerMiddleware } from "@reduxjs/toolkit";
import { IJsonRowNode, IJsonTabSetNode } from "flexlayout-react";
import shortid from "shortid";

import { getSingleton } from "src/singletons/Singletons";
import { nextAnimationFrame } from "src/util/animationPromise";

import { RootState } from "../rootState";
import { closeTabs, openTab, updateLayoutExt } from "../shared/actions";
import {
  selectLayout,
  selectLayoutPathToNodeId,
  selectLayoutTabsByComponentName
} from "./selectors";
import { startTutorial, updateLayout } from "./slice";
import { findNodePath, findNodePathForComponentConfig } from "./util";
import { AnyJsonNode, isRowNode, isTabNode, isTabSetNode } from "./util";

export const uiListener = createListenerMiddleware<RootState>();

// Smooth tab opening.
uiListener.startListening({
  actionCreator: openTab,
  effect: async (action, listenerApi) => {
    const { tabSetId, relativeWeight, slideIn, duration } = action.payload;
    if (!slideIn) return;

    const targetDurationMs = duration ?? 300;
    const targetRelativeWeight = relativeWeight ?? 0.5;

    const initialLayout = selectLayout(listenerApi.getState());
    const tabSetPath = findNodePath(initialLayout, tabSetId);

    if (!tabSetPath) {
      console.warn("Failed to find path to tab set.");
      return;
    }

    const _drill = (
      parent: AnyJsonNode,
      arr: [AnyJsonNode, number][]
    ): AnyJsonNode => {
      if (isTabNode(parent)) return parent;
      if (arr.length === 0) return parent;
      const child = parent.children?.find(({ id }) => id === arr[0][0].id);
      if (!child) return parent;
      return _drill(child, arr.slice(1));
    };

    const initialRow = _drill(initialLayout, tabSetPath.slice(0, -1));
    if (!initialRow || !isRowNode(initialRow)) {
      console.warn("Failed to find tab set row.");
      return;
    }

    const _traverse = (
      node: AnyJsonNode,
      assignWeightToNodeId: string,
      assignRelativeWeight: number
    ): AnyJsonNode => {
      if (isTabNode(node)) return node;
      if (isTabSetNode(node)) {
        if (node.weight) return node;
        return {
          ...node,
          weight: 1
        };
      }
      const updateChildIndex =
        node.children?.findIndex(
          (childNode) => childNode.id === assignWeightToNodeId
        ) ?? -1;
      const newChildren =
        node.children?.map(
          (childNode) =>
            _traverse(childNode, assignWeightToNodeId, assignRelativeWeight) as
              | IJsonRowNode
              | IJsonTabSetNode
        ) ?? [];
      if (updateChildIndex >= 0) {
        let rowWeightWithoutChild = 0;
        for (let i = 0; i < newChildren.length; i++) {
          if (i === updateChildIndex) continue;
          const childNode = newChildren[i];
          rowWeightWithoutChild += childNode.weight ?? 1;
        }
        const weightedWeight = rowWeightWithoutChild * assignRelativeWeight;
        newChildren[updateChildIndex] = {
          ...newChildren[updateChildIndex],
          weight: weightedWeight
        };
      }
      return {
        ...node,
        weight: node.weight ?? 1,
        children: newChildren as (IJsonRowNode | IJsonTabSetNode)[]
      };
    };

    // Animate the slide-in transition.
    const msStart = performance.now();
    let msElapsed = 0;
    while (msElapsed < targetDurationMs) {
      await nextAnimationFrame();
      const currentLayout = selectLayout(listenerApi.getState());
      msElapsed = performance.now() - msStart;
      const targetWeight =
        (targetRelativeWeight * msElapsed) / targetDurationMs;
      const newLayout = _traverse(
        currentLayout,
        tabSetId,
        targetWeight
      ) as IJsonRowNode;
      listenerApi.dispatch(updateLayout(newLayout));
    }

    const currentLayout = selectLayout(listenerApi.getState());
    const targetWeight = targetRelativeWeight;
    const newLayout = _traverse(
      currentLayout,
      tabSetId,
      targetWeight
    ) as IJsonRowNode;
    listenerApi.dispatch(updateLayout(newLayout));
  }
});

// Smooth tab closing.
uiListener.startListening({
  actionCreator: closeTabs,
  effect: async (action, listenerApi) => {
    const { ids, componentName, smooth: _smooth } = action.payload;

    const removeIds = new Set(ids);

    const targetDurationMs = 500;
    const initialState = listenerApi.getState();
    const initialLayout = selectLayout(initialState);

    if (componentName) {
      for (const tab of selectLayoutTabsByComponentName(initialState).get(
        componentName
      ) ?? []) {
        if (tab.id) {
          removeIds.add(tab.id);
        }
      }
    }

    const tabSetsFinalNodeCount = new Map<string, number>();

    const _drillInitial = (node: AnyJsonNode, path: AnyJsonNode[]) => {
      if (isTabNode(node)) {
        if (node.id) {
          if (!removeIds.has(node.id)) return;
          const parent = path.at(-1);
          if (parent && isTabSetNode(parent) && parent.id) {
            tabSetsFinalNodeCount.set(
              parent.id,
              (tabSetsFinalNodeCount.get(parent.id) ?? 0) - 1
            );
          }
        }
        return;
      }
      if (isTabSetNode(node)) {
        if (node.id) {
          tabSetsFinalNodeCount.set(node.id, node.children?.length ?? 0);
        }
      }
      for (const child of node.children ?? [])
        _drillInitial(child, [...path, node]);
    };
    _drillInitial(initialLayout, []);

    const tabSetIdsToCollapse = new Set<string>();
    for (const [tabSetId, nodeCount] of tabSetsFinalNodeCount) {
      if (nodeCount === 0) tabSetIdsToCollapse.add(tabSetId);
    }

    if (!tabSetIdsToCollapse.size) return;

    const nodeIdToInitialWeight = new Map<string, number>();
    const nodeIdToFinalWeight = new Map<string, number>();

    const _drillSecondary = (node: AnyJsonNode) => {
      if (isTabNode(node)) return;
      if (isTabSetNode(node) && node.id) {
        nodeIdToInitialWeight.set(node.id, node.weight ?? 1);
        nodeIdToFinalWeight.set(
          node.id,
          tabSetIdsToCollapse.has(node.id) ? 0 : node.weight ?? 1
        );
      }
      node.children?.forEach(_drillSecondary);
    };
    _drillSecondary(initialLayout);

    // Animate the slide-out transition.
    const msStart = performance.now();
    let msElapsed = 0;
    while (msElapsed < targetDurationMs) {
      msElapsed = performance.now() - msStart;
      const transitionProgress = msElapsed / targetDurationMs;
      const currentLayout = selectLayout(listenerApi.getState());
      const _traverse = (node: AnyJsonNode): AnyJsonNode => {
        if (isTabNode(node)) return node;
        if (isTabSetNode(node) && node.id) {
          const initialNodeWeight = nodeIdToInitialWeight.get(node.id) ?? 1;
          const finalNodeWeight = nodeIdToFinalWeight.get(node.id) ?? 1;
          return {
            ...node,
            weight:
              initialNodeWeight * (1 - transitionProgress) +
              finalNodeWeight * transitionProgress,
            children: node.children?.map(_traverse)
          };
        }
        return {
          ...node,
          children: node.children?.map(_traverse)
        } as IJsonRowNode | IJsonTabSetNode;
      };
      const newLayout = _traverse(currentLayout) as IJsonRowNode;
      listenerApi.dispatch(updateLayout(newLayout));
      await nextAnimationFrame();
    }

    const currentLayout = selectLayout(listenerApi.getState());
    const _traverse = (node: AnyJsonNode): AnyJsonNode => {
      if (isTabNode(node)) return node;
      return {
        ...node,
        children: node.children
          ?.filter((node) => !tabSetIdsToCollapse.has(node?.id ?? ""))
          .map(_traverse)
      } as IJsonRowNode | IJsonTabSetNode;
    };
    const newLayout = _traverse(currentLayout) as IJsonRowNode;
    listenerApi.dispatch(updateLayout(newLayout));
  }
});

uiListener.startListening({
  actionCreator: updateLayoutExt,
  effect: async (action, listenerApi) => {
    if (action.payload.transitions === undefined) return;
    const initialState = listenerApi.getState();

    type TransitionInternal = {
      duration: number;
      initialWeight: number;
      relativeWeightFinal: number;
      closeAfterComplete: boolean;
    };

    const activeTransitions = new Map<string, TransitionInternal>();
    for (const t of action.payload.transitions) {
      const nodePath = selectLayoutPathToNodeId(initialState, t.id);
      if (nodePath === null) continue;
      const lastNode = nodePath.at(-1);
      if (lastNode?.node === undefined) continue;
      if (!(isRowNode(lastNode.node) || isTabSetNode(lastNode.node))) continue;
      activeTransitions.set(t.id, {
        duration: t.duration,
        initialWeight: lastNode.node.weight ?? 0,
        relativeWeightFinal: t.relativeWeight,
        closeAfterComplete: !!t.closeAfterComplete
      });
    }

    let elapsedMs = 0;
    let lastTime = performance.now();
    let frameSkipped = false;
    while (activeTransitions.size > 0) {
      await nextAnimationFrame();
      const now = performance.now();
      const deltaMs = now - lastTime;
      // Skip frames when we detect slow updates.
      if (now - deltaMs > 100 && !frameSkipped) {
        frameSkipped = true;
        continue;
      }
      frameSkipped = false;
      elapsedMs += deltaMs;
      // eslint-disable-next-line no-loop-func
      const _traverse = (
        node: AnyJsonNode,
        parentNode: AnyJsonNode | null
      ): AnyJsonNode | null => {
        if (isTabNode(node)) return node;
        const nodeTransition = node.id
          ? activeTransitions.get(node.id)
          : undefined;
        let workingNode: IJsonRowNode | IJsonTabSetNode | null = node;
        if (nodeTransition !== undefined) {
          workingNode = {
            ...workingNode
          };
          const progress = Math.min(
            1,
            elapsedMs / (nodeTransition.duration || 1)
          );
          let parentNodeTotalExtraWeight = 0;
          if (parentNode && isRowNode(parentNode)) {
            for (const sibling of parentNode.children ?? []) {
              if (sibling.id !== node.id)
                parentNodeTotalExtraWeight += sibling.weight ?? 100;
            }
          }
          if (parentNodeTotalExtraWeight === 0) parentNodeTotalExtraWeight = 1;
          const _currentWeight = workingNode.weight ?? 0;
          const finalWeight =
            parentNodeTotalExtraWeight * nodeTransition.relativeWeightFinal;
          if (progress === 1) {
            if (nodeTransition.closeAfterComplete) {
              workingNode = null;
            } else {
              workingNode = {
                ...workingNode,
                weight: finalWeight
              };
            }
          } else {
            workingNode = {
              ...workingNode,
              weight:
                nodeTransition.initialWeight * (1 - progress) +
                finalWeight * progress
            };
          }
        }
        // TODO: component de-init.
        if (workingNode === null) return null;
        if (isTabSetNode(workingNode)) {
          return {
            ...workingNode,
            children: workingNode.children
              ?.map((c) => _traverse(c, workingNode))
              .filter((c) => !!c && isTabNode(c))
          };
        }
        if (isRowNode(workingNode)) {
          workingNode = {
            ...workingNode,
            children: workingNode.children
              ?.map((c) => _traverse(c, workingNode))
              .filter((c) => !!c && (isRowNode(c) || isTabSetNode(c)))
          };
          if (workingNode.children?.length === 0) return null;
          if (
            workingNode.children?.length === 1 &&
            isRowNode(workingNode.children[0]) &&
            workingNode.children[0].children?.length === 1 &&
            isRowNode(workingNode.children[0].children[0])
          ) {
            return workingNode.children[0].children[0];
          }
        }
        return workingNode;
      };
      let nextTree = _traverse(selectLayout(listenerApi.getState()), null);
      if (nextTree !== null && isTabSetNode(nextTree)) {
        nextTree = {
          type: "row",
          id: shortid(),
          children: [nextTree]
        };
      }
      if (nextTree !== null && isRowNode(nextTree)) {
        listenerApi.dispatch(updateLayout(nextTree));
      }
      for (const [id, transition] of activeTransitions) {
        if (transition.duration < elapsedMs) activeTransitions.delete(id);
      }
    }
  }
});

// Tutorial sync.
// TODO(brownstein) find a better way to manage the tutorial sync logic.
uiListener.startListening({
  actionCreator: startTutorial,
  effect: (action) => {
    getSingleton("tutorials")?.startTutorial(action.payload);
  }
});
