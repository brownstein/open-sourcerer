import { TFunction } from "i18next";
import { ComponentType, ReactElement } from "react";

import { DocId } from "src/docs/indexedDocs/docTypes";

export type KnownComponentConfigTypes = {
  codeEditor: {
    editorId?: string;
    theme?: "codingChallenge" | "docs";
    scriptName?: string;
    scriptId?: string;
    spellContextId?: string;
    challengeId?: string;
    docsInstanceId?: string;
  };
  console: {
    editorId?: string;
    spellContextId?: string;
  };
  codingChallenge: {
    // This is used to allow content to maintain state in redux when moving
    // between tab mounting locations (e.g. dragging the challenge around.).
    contentState?: Record<string, unknown>;
  };
  docs: {
    docId?: DocId;
    query?: string;
    scrollPosition?: number;
    navHistory?: DocId[];
    navHistoryIndex?: number;
    highlightNavIndex?: number;
  };
};

export type KnownComponentTypesWithConfig = keyof KnownComponentConfigTypes;

export type ComponentConfigType<
  T extends keyof KnownComponentConfigTypes | string = string
> = T extends keyof KnownComponentConfigTypes
  ? KnownComponentConfigTypes[T]
  : Record<string, unknown>;

export type UIEventTypes = {
  resize: void;
  componentsUpdated: void;
};

export type UIComponentProps<T extends string> = {
  tabId: string;
  componentState?: ComponentConfigType<T>;
};

export type UIComponentType<T extends string = string> = {
  component: ComponentType<UIComponentProps<T>> | (() => ReactElement);
  minimumWidth?: number | string;
  minimumHeight?: number | string;
  fallbackComponent?: ComponentType<UIComponentProps<T>> | (() => ReactElement);
  displayName:
    | ((t: TFunction) => string)
    | ((t: TFunction, config?: ComponentConfigType) => string);
  iconClassName?: string;
};

export type UIComponents<T extends Record<string, unknown>> = T extends {
  [K in keyof T & string]: T[K] extends any ? T[K] : never;
}
  ? T
  : never;

export function uiComponent<K extends string, T extends UIComponentType<K>>(
  input: T
): T {
  return input;
}

export function uiComponents<
  V extends Record<string, unknown>,
  T extends UIComponents<V>
>(input: V): T {
  return input as unknown as T;
}
