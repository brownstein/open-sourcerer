import { PayloadAction, createSlice } from "@reduxjs/toolkit";
import { IJsonRowNode, IJsonTabNode, IJsonTabSetNode } from "flexlayout-react";
import shortid from "shortid";

import { ModalInstanceType } from "src/api/modal";
import { ComponentConfigType } from "src/components/ui/config/types";
import { isDevMode } from "src/engine/util/devMode";
import { checkMobile } from "src/engine/util/mobile";
import {
  AnyJsonNode,
  cleanLayout,
  findNodePath,
  isRowNode,
  isTabNode,
  isTabSetNode
} from "src/redux/ui/util";

import { markLevelLoadCompleted, unpauseGame } from "../gameState/slice";
import {
  closeTabs,
  loadGame,
  openNewCodeEditorPhase2,
  openTab,
  pushModal,
  updateLayoutExt
} from "../shared/actions";

export enum EnableElements {
  Layout = "Layout",
  HUD = "HUD",
  Health = "Health",
  Mana = "Mana",
  HotBar = "HotBar",
  HotBarBottom = "HotBarBottom",
  HotBarMultipleRows = "HotBarMultipleRows",
  CodeEditor = "CodeEditor",
  CodeEditorEditing = "CodeEditorEditing",
  Portrait = "Portrait"
}

export const EnableElementsArr = [
  EnableElements.Layout,
  EnableElements.HUD,
  EnableElements.Health,
  EnableElements.Mana,
  EnableElements.HotBar,
  EnableElements.HotBarBottom,
  EnableElements.HotBarMultipleRows,
  EnableElements.CodeEditor,
  EnableElements.CodeEditorEditing,
  EnableElements.Portrait
];

type UISliceState = {
  layout: IJsonRowNode;
  layoutComponentState: Record<string, ComponentConfigType>;
  modalStack?: ModalInstanceType[];
  editorFontSize: number;
  tutorialQueue: string[];
  tutorialStep?: number;
  enableElements: Partial<Record<EnableElements | string, boolean>>;
  lightMode?: boolean;
  preserveLayout?: boolean;
};

const kViewportId = "viewport";
const kMobileCodeEditorId = shortid();

const uiSlice = createSlice({
  name: "ui",
  initialState: {
    layout: {
      type: "row",
      id: shortid(),
      weight: 100,
      children: checkMobile()
        ? // In dev mode, start with the code editor open.
          [
            {
              type: "tabset",
              id: shortid(),
              weight: 60,
              children: [
                {
                  id: kViewportId,
                  component: "viewport",
                  enableClose: false,
                  type: "tab"
                }
              ]
            },
            {
              type: "tabset",
              id: shortid(),
              weight: 40,
              children: [
                {
                  id: kMobileCodeEditorId,
                  component: "codeEditor",
                  type: "tab"
                }
              ]
            }
          ]
        : // In normal mode, start with the editor closed.
          [
            {
              type: "tabset",
              id: shortid(),
              weight: 100,
              children: [
                {
                  id: kViewportId,
                  component: "viewport",
                  enableClose: false,
                  type: "tab"
                }
              ]
            }
          ]
    },
    layoutComponentState: checkMobile()
      ? {
          [kMobileCodeEditorId]: {
            scriptName: "Mobile Demo"
          } satisfies ComponentConfigType<"codeEditor">
        }
      : {},
    editorFontSize: 18,
    tutorialQueue: [],
    enableElements: {
      [EnableElements.HotBarBottom]: true,
      [EnableElements.HUD]: true,
      [EnableElements.CodeEditor]: isDevMode(),
      [EnableElements.Health]: isDevMode(),
      [EnableElements.HotBar]: isDevMode(),
      [EnableElements.Mana]: isDevMode(),
      [EnableElements.Portrait]: isDevMode()
    }
  } satisfies UISliceState as UISliceState,
  reducers: {
    // Generic layout update function.
    // Use a more specific function where possible.
    updateLayout(state, action: PayloadAction<IJsonRowNode>) {
      if (state.preserveLayout) return;
      state.layout = cleanLayout(action.payload);
      const ids = new Set<string>();
      const _traverse = (
        subLayout: IJsonRowNode | IJsonTabNode | IJsonTabSetNode
      ) => {
        if (isTabNode(subLayout)) {
          if (subLayout.id === undefined) return;
          ids.add(subLayout.id);
          return;
        }
        if (isRowNode(subLayout) || isTabSetNode(subLayout)) {
          subLayout.children?.map(_traverse);
        }
      };
      state.layout.children?.map(_traverse);
      for (const componentId of Object.keys(state.layoutComponentState)) {
        if (!ids.has(componentId))
          delete state.layoutComponentState[componentId];
      }
      for (const componentId of ids) {
        if (state.layoutComponentState[componentId] === undefined) {
          state.layoutComponentState[componentId] = {
            componentConfigId: componentId
          };
        }
      }
    },

    toggleMaximizedTab(state, action: PayloadAction<string>) {
      const tabId = action.payload; // The ID of the tab whose parent TabSetNode to maximize.

      // Helper function to recursively traverse the layout tree
      const findAndToggleTabSet = (
        node: IJsonRowNode | IJsonTabSetNode
      ): boolean => {
        if (isTabSetNode(node)) {
          // Check if this TabSetNode contains the target TabNode
          const containsTab = node.children?.some((tab) => tab.id === tabId);
          if (containsTab) {
            node.maximized = !node.maximized;
            return true;
          }
        } else if (isRowNode(node)) {
          // If it's a RowNode, recursively check its children
          for (const child of node.children ?? []) {
            if (findAndToggleTabSet(child)) {
              return true; // Stop searching once the correct TabSetNode is found
            }
          }
        }
        return false; // Continue searching
      };

      // Start traversal from the root layout node
      findAndToggleTabSet(state.layout);
    },
    closeTab(state, action: PayloadAction<string>) {
      const removeTabId = action.payload;
      // Keep track of the tab node we removed.
      let tabNode: IJsonTabNode | undefined;
      const _traverse = (
        subLayout: IJsonRowNode | IJsonTabNode | IJsonTabSetNode
      ): IJsonRowNode | IJsonTabNode | IJsonTabSetNode | null => {
        if (isTabNode(subLayout)) {
          if (subLayout.id === removeTabId) {
            tabNode = subLayout;
            return null;
          }
          return subLayout;
        }
        if (isRowNode(subLayout)) {
          let initialWeight = 0;
          for (const child of subLayout.children ?? [])
            initialWeight += child.weight ?? 1;
          const newChildren =
            subLayout.children?.map(_traverse).filter((node) => !!node) ?? [];
          if (newChildren.length === 0) {
            return null;
          }
          // This lead to the layout being altered unnecessairly.
          if (newChildren.length === 1 && newChildren[0]?.type !== "row") {
            return newChildren[0];
          }
          if (newChildren.length === subLayout.children?.length) {
            return {
              ...subLayout,
              children: (newChildren as (IJsonRowNode | IJsonTabSetNode)[]).map(
                (c, i) => ({
                  ...c,
                  weight: subLayout.children?.[i].weight
                })
              )
            };
          }
          let newWeight = 0;
          for (const child of newChildren) {
            if (!child || isTabNode(child)) continue;
            newWeight += child.weight ?? 0;
          }
          if (newWeight === 0) newWeight = initialWeight;
          const adjustWeightRatio = initialWeight / newWeight;
          for (const child of newChildren) {
            if (!child || isTabNode(child)) continue;
            child.weight = (child.weight ?? 1) * adjustWeightRatio;
          }
          return {
            ...subLayout,
            children: newChildren as (IJsonRowNode | IJsonTabSetNode)[]
          } as IJsonRowNode;
        }
        if (isTabSetNode(subLayout)) {
          let previousTabIndex: number | null = null;
          const newChildren =
            subLayout.children
              ?.map((child, index) => {
                const newChild = _traverse(child);
                if (newChild === null) {
                  previousTabIndex = index;
                }
                return newChild;
              })
              .filter((node) => node) ?? [];
          if (newChildren.length === 0) return null;
          return {
            ...subLayout,
            selected:
              previousTabIndex !== null
                ? Math.max(0, previousTabIndex - 1)
                : subLayout.selected,
            children: newChildren as IJsonTabNode[]
          } as IJsonTabSetNode;
        }
        return null;
      };
      const newLayout = _traverse(state.layout);
      if (newLayout) {
        if (isRowNode(newLayout)) {
          state.layout = newLayout;
        } else if (isTabSetNode(newLayout)) {
          state.layout = {
            type: "row",
            id: shortid(),
            children: [newLayout]
          };
        }
      }
      if (tabNode?.id !== undefined) {
        delete state.layoutComponentState[tabNode.id];
      }
    },
    updateComponentState(
      state,
      action: PayloadAction<[string, ComponentConfigType]>
    ) {
      const [tabId, componentConfig] = action.payload;
      state.layoutComponentState[tabId] = componentConfig;
    },
    updateModalInStack(state, action: PayloadAction<ModalInstanceType>) {
      if (!state.modalStack) return;
      for (let i = state.modalStack.length - 1; i >= 0; i--) {
        if (state.modalStack[i].id === action.payload.id) {
          state.modalStack[i] = action.payload;
          break;
        }
      }
    },
    closeCurrentModal(state) {
      if (state.modalStack) {
        state.modalStack.pop();
        if (!state.modalStack.length) state.modalStack = undefined;
      }
    },
    adjustEditorFontSize(state, action: PayloadAction<number>) {
      state.editorFontSize = action.payload;
    },
    startTutorial(state, action: PayloadAction<string>) {
      const inTutorial = state.tutorialQueue.length > 0;
      if (!state.tutorialQueue.some((id) => id === action.payload))
        state.tutorialQueue.push(action.payload);
      if (!inTutorial) state.tutorialStep = 0;
    },
    advanceTutorial(state, action: PayloadAction<number>) {
      if (state.tutorialStep === undefined) state.tutorialStep = 0;
      state.tutorialStep = action.payload;
    },
    exitTutorial(state, action: PayloadAction<string>) {
      state.tutorialQueue = state.tutorialQueue.filter(
        (id) => id !== action.payload
      );
      state.tutorialStep = state.tutorialQueue.length ? 0 : undefined;
    },
    exitAllTutorials(state) {
      state.tutorialQueue = [];
      state.tutorialStep = 0;
    },
    enableUIElements(state, action: PayloadAction<string[]>) {
      for (const el of action.payload) state.enableElements[el] = true;
    },
    disableUIElements(state, action: PayloadAction<string[]>) {
      for (const el of action.payload) state.enableElements[el] = false;
    }
  },

  extraReducers: (builder) => {
    builder.addCase(openNewCodeEditorPhase2, (state, action) => {
      state.layoutComponentState[action.payload.tabId] = {
        ...state.layoutComponentState[action.payload.tabId],
        editorId: action.payload.editorId
      };
    });
    builder.addCase(closeTabs, (state, action) => {
      const removedTabIds: string[] = [];
      const byComponentName = action.payload.componentName;
      const byIds = action.payload.ids as string[] | undefined;

      const removeTabs = (node: AnyJsonNode): AnyJsonNode | null => {
        if (isTabNode(node)) {
          // Keep tab if it doesn't match filters
          const tabId = node.id;
          const matchesById = tabId === node.id;
          const matchesByName = node.component === byComponentName;
          if (matchesById || matchesByName) {
            if (tabId) removedTabIds.push(tabId);
            return null;
          }
          return node;
        }
        if (isTabSetNode(node)) {
          const kept = node.children
            ?.map((child) => removeTabs(child))
            .filter((c) => !!c) as AnyJsonNode[];
          if (kept.length === 0) return null;
          return {
            ...node,
            children: kept as IJsonTabNode[]
          } as IJsonTabSetNode;
        }
        if (isRowNode(node)) {
          const kept = node.children
            ?.map((child) => removeTabs(child))
            .filter((c) => !!c) as (IJsonRowNode | IJsonTabSetNode)[];
          if (kept.length === 0) return null;
          // If only one child remains and it's not a row, collapse upward
          if (kept.length === 1 && kept[0].type !== "row") {
            return kept[0];
          }
          return { ...node, children: kept } as IJsonRowNode;
        }
        return node;
      };

      const newLayout = removeTabs(state.layout);
      if (newLayout && isRowNode(newLayout)) {
        state.layout = newLayout;
      }
      for (const tabId of removedTabIds) {
        delete state.layoutComponentState[tabId];
      }
    });
    builder.addCase(openTab, (state, action) => {
      const {
        tabId,
        tabSetId,
        nextToTabId,
        componentName,
        componentConfig: componentConfigIn,
        relativeWeight: relativeWeightIn,
        slideIn,
        editorId
      } = action.payload;

      // Build component config.
      const componentConfig = {
        ...componentConfigIn
      } as ComponentConfigType;
      if (editorId) componentConfig.editorId = editorId;

      // Determine weight.
      const relativeWeight = slideIn ? 0 : relativeWeightIn ?? 0.5;

      // Helper to deterine if a given node contains the viewport.
      const _hasViewport = (node: AnyJsonNode): boolean => {
        if (isRowNode(node) || isTabSetNode(node)) {
          for (const childNode of node.children ?? [])
            if (_hasViewport(childNode)) return true;
          return false;
        }
        return node.id === "viewport";
      };

      // Determine current path to tab.
      const currentTabPath = nextToTabId
        ? findNodePath(state.layout, nextToTabId)
        : null;

      // Determine the path at which we'll inject the new node.
      let injectPath: number[] = [];
      if (currentTabPath && nextToTabId === "viewport") {
        const currentRow = currentTabPath.at(-3)?.[0] as
          | IJsonRowNode
          | undefined;
        if (currentRow) {
          const rowPathPrefix = currentTabPath
            .slice(0, -3)
            .map(([_node, index]) => index);
          // Prefer an existing non-viewport sibling so the new tab joins that
          // tabset rather than creating a fresh one. If the only child of the
          // row is the viewport's own tabset, append a new sibling tabset at
          // the end of the row instead.
          const childCount = currentRow.children?.length ?? 0;
          const firstNonViewportIndex =
            currentRow.children?.findIndex((child) => !_hasViewport(child)) ??
            -1;
          injectPath = rowPathPrefix;
          injectPath.push(
            firstNonViewportIndex >= 0 ? firstNonViewportIndex : childCount
          );
        }
      } else if (currentTabPath) {
        injectPath = currentTabPath.slice(0, -2).map(([_node, index]) => index);
        // TODO: fix later.
        if (injectPath.length >= 2) {
          injectPath[injectPath.length - 1]++;
        } else {
          injectPath.push(0);
        }
      } else {
        const _traverseFindEmpty = (node: AnyJsonNode): number[] | null => {
          if (isTabNode(node)) return null;
          if (isTabSetNode(node)) return !_hasViewport(node) ? [] : null;
          for (let i = 0; i < (node.children?.length ?? 0); i++) {
            const subPath = node.children
              ? _traverseFindEmpty(node.children[i])
              : null;
            if (subPath !== null) return [i, ...subPath];
          }
          return [1];
        };
        injectPath = _traverseFindEmpty(state.layout) ?? [0];
        // TODO: fix later.
        if (injectPath.length >= 2) {
          injectPath[injectPath.length - 1]++;
        } else {
          injectPath.push(0);
        }
      }

      // Construct the new tab set.
      const newTabSet: IJsonTabSetNode = {
        type: "tabset",
        id: tabSetId,
        weight: relativeWeight,
        children: [
          {
            type: "tab",
            id: tabId,
            component: componentName
          }
        ]
      };

      const _traverse = (
        node: AnyJsonNode,
        injectAt: number[]
      ): AnyJsonNode | null => {
        // If we're in a row, see if it's the right row.
        if (isRowNode(node)) {
          if (injectAt.length && injectAt[0] < (node.children?.length ?? 0)) {
            const index = injectAt[0];
            const newChildren = node.children ? [...node.children] : [];
            newChildren[index] = _traverse(
              newChildren[index],
              injectAt.slice(1)
            ) as IJsonRowNode | IJsonTabSetNode;
            return {
              ...node,
              children: newChildren
            };
          } else {
            let rowWeightSum = 0;
            for (const child of node.children ?? []) {
              rowWeightSum += child.weight ?? 1;
            }
            const newTabSetWeight = (newTabSet.weight ?? 1) * rowWeightSum;
            return {
              ...node,
              children: [
                ...(node.children ?? []),
                {
                  ...newTabSet,
                  weight: newTabSetWeight
                }
              ]
            };
          }
        }
        // If we arrive at a tab set, turn it into a row.
        // This is really more of a fallback.
        if (isTabSetNode(node)) {
          return {
            type: "row",
            id: shortid(),
            weight: node.weight,
            children: action.payload.nextToTabBefore
              ? [newTabSet, { ...node, weight: 0.5 }]
              : [{ ...node, weight: 0.5 }, newTabSet]
          };
        }
        // Otherwise, this is a tab and we should just return it.
        // If we're here something is very wrong.
        return node;
      };
      const traverseResult = _traverse(state.layout, injectPath);
      if (traverseResult && isRowNode(traverseResult)) {
        state.layout = traverseResult;
        state.layoutComponentState[tabId] = componentConfig;
      }
    });
    builder.addCase(updateLayoutExt, (state, action) => {
      if (!state.preserveLayout) {
        state.layout = action.payload.layout;
      }
      state.layoutComponentState = {
        ...state.layoutComponentState,
        ...action.payload.componentConfigs
      };
    });
    builder.addCase(pushModal, (state, action) => {
      if (!state.modalStack) state.modalStack = [];
      state.modalStack.push(action.payload);
    });
    builder.addCase(loadGame, (state, action) => {
      const { ui } = action.payload.reduxStateData;
      const oldState = ui as Partial<UISliceState>;
      if (action.payload.preserveLayout) {
        state.preserveLayout = true;
      } else {
        if (typeof oldState.layout === "object") state.layout = oldState.layout;
        if (typeof oldState.layoutComponentState === "object")
          state.layoutComponentState = oldState.layoutComponentState;
      }
      if (typeof oldState.editorFontSize === "number")
        state.editorFontSize = oldState.editorFontSize;
      if (typeof oldState.enableElements === "object")
        state.enableElements = oldState.enableElements;
    });
    builder.addCase(markLevelLoadCompleted, (state) => {
      state.preserveLayout = false;
    });
    builder.addCase(unpauseGame, (state) => {
      // Unpausing dismisses whatever the player had open — but a modal marked
      // disallowClose is gating something (the intro customizer), so pausing
      // and unpausing must not be a way around it.
      const gating = state.modalStack?.filter((modal) => modal.disallowClose);
      state.modalStack = gating?.length ? gating : undefined;
    });
  }
});

export const {
  closeTab,
  updateComponentState,
  updateLayout,
  updateModalInStack,
  closeCurrentModal,
  adjustEditorFontSize,
  startTutorial,
  advanceTutorial,
  exitTutorial,
  exitAllTutorials,
  enableUIElements,
  disableUIElements
} = uiSlice.actions;

export const { toggleMaximizedTab } = uiSlice.actions;
export const uiReducer = uiSlice.reducer;
