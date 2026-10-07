import { IJsonRowNode, IJsonTabNode, IJsonTabSetNode } from "flexlayout-react";
import shortid from "shortid";

export type AnyJsonNode = IJsonRowNode | IJsonTabNode | IJsonTabSetNode;

export const kLeftBorderDockId = shortid();
export const kLeftBorderDockDropzoneId = shortid();

export function isRowNode(node: AnyJsonNode): node is IJsonRowNode {
  return node.type === "row";
}

export function isTabNode(node: AnyJsonNode): node is IJsonTabNode {
  return node.type === "tab";
}

export function isTabSetNode(node: AnyJsonNode): node is IJsonTabSetNode {
  return node.type === "tabset";
}

export function findNodePath(layout: AnyJsonNode, nodeId: string) {
  function _traverse(node: AnyJsonNode): [AnyJsonNode, number][] | null {
    if (node.id === nodeId) return [[node, 0]];
    if (isTabNode(node)) return null;
    let childIndex = 0;
    for (const childNode of node.children ?? []) {
      const result = _traverse(childNode);
      if (result !== null) return [[node, childIndex], ...result];
      childIndex++;
    }
    return null;
  }
  return _traverse(layout);
}

export function findNodePathForComponentConfig(
  layout: AnyJsonNode,
  componentConfigId: string
) {
  function _traverse(node: AnyJsonNode): [number, AnyJsonNode][] | null {
    if (isTabNode(node)) {
      if (node.config?.componentConfigId === componentConfigId)
        return [[0, node]];
      return null;
    }
    let childIndex = 0;
    for (const childNode of node.children ?? []) {
      const result = _traverse(childNode);
      if (result !== null) return [[childIndex, node], ...result];
      childIndex++;
    }
    return null;
  }
  return _traverse(layout);
}

// Helper to clean up layout after certain operations,
// such as dragging border tabs - prevents us from adding
// tabs to an invalid location.
export function cleanLayout(row: IJsonRowNode): IJsonRowNode {
  return {
    ...row,
    children: row.children?.map((child) =>
      child.type === "row" ? cleanLayout(child) : _cleanLayoutTabset(child)
    )
  };
}

function _cleanLayoutTabset(tabset: IJsonTabSetNode): IJsonTabSetNode {
  return {
    ...tabset,
    children: tabset.children?.filter((tab) => {
      switch (tab.id) {
        case kLeftBorderDockId:
        case kLeftBorderDockDropzoneId:
          return false;
        default:
          return true;
      }
    })
  };
}
