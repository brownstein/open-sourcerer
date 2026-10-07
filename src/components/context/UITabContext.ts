import { createContext, useCallback, useContext, useMemo } from "react";

import { useAppSelector, useAppStore } from "src/redux/hooks";
import { selectComponentConfigById } from "src/redux/ui/selectors";
import { updateComponentState } from "src/redux/ui/slice";

import { ComponentConfigType } from "../ui/config/types";

export type UITabContextType = {
  tabId: string;
};

export const UITabContext = createContext<UITabContextType>({
  tabId: ""
});

export type UpdateOrThunk<T> = T | ((value?: T) => T);

// This is a helper to leverage the state and allow easy updates for a tab.
export function useTabState<ComponentName extends string = string>(): [
  ComponentConfigType<ComponentName> | undefined,
  (value: UpdateOrThunk<ComponentConfigType<ComponentName>>) => void
] {
  const { tabId } = useContext(UITabContext);
  const store = useAppStore();
  const componentState = useAppSelector((state) =>
    selectComponentConfigById(state, tabId)
  ) as ComponentConfigType<ComponentName> | undefined;

  const updater = useCallback(
    (update: UpdateOrThunk<ComponentConfigType<ComponentName>>) => {
      if (typeof update === "function") {
        const state = store.getState();
        const currentState = selectComponentConfigById<ComponentName>(
          state,
          tabId
        );
        store.dispatch(updateComponentState([tabId, update(currentState)]));
      } else {
        store.dispatch(updateComponentState([tabId, update]));
      }
    },
    [tabId, store]
  );

  return useMemo(() => [componentState, updater], [componentState, updater]);
}
