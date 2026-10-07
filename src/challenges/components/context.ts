import { createContext, useCallback, useState } from "react";

import {
  CodingChallengeProviderAPI,
  CodingChallengeSegment,
  CodingChallengeSegmentState
} from "src/api/codingChallenge";
import { useTabState } from "src/components/context/UITabContext";

export type CodingChallengeContentContextType = {
  // These attributes are used for actual coding challenges.
  challengeProvider?: CodingChallengeProviderAPI;
  segment?: CodingChallengeSegment;
  segmentIndex?: number;
  segmentState?: CodingChallengeSegmentState;
  
  // These attributes are used for "mini" coding challenges.
  onChangeCode?: (id: string, code: string) => void;
};

export const CodingChallengeContentContext =
  createContext<CodingChallengeContentContextType | null>(null);

type Initializer<T> = T | (() => T);
type OptionalInitializer<T> = Initializer<T> | undefined;
type UpdateOrThunk<T, INIT> =
  INIT extends Initializer<infer IT>
    ? T | ((current: IT) => IT)
    : T | ((current: T | undefined) => T);

type InitializedWith<T, IT extends OptionalInitializer<T>> =
  IT extends Initializer<T> ? T : undefined;

function evalInitializer<T, IT extends OptionalInitializer<T>>(
  initializer: IT
): InitializedWith<T, IT> {
  if (initializer === undefined) return undefined as InitializedWith<T, IT>;
  if (typeof initializer === "function") return initializer();
  return initializer as InitializedWith<T, IT>;
}

export function useContentStateForSegment<
  T,
  INIT extends Initializer<T> | undefined = Initializer<T>
>(
  subPath: string = ".",
  initializer?: INIT
): [InitializedWith<T, INIT>, (updater: UpdateOrThunk<T, INIT>) => void] {
  const [tabState, setTabState] = useTabState<"codingChallenge">();
  const [memoizedInitialValue] = useState(
    () => evalInitializer(initializer) as InitializedWith<T, INIT>
  );

  const contentValue: T | undefined = tabState?.contentState?.[subPath] as
    | T
    | undefined;
  const value: InitializedWith<T, INIT> = (contentValue !== undefined
    ? contentValue
    : memoizedInitialValue) as unknown as InitializedWith<T, INIT>;

  const updater = useCallback(
    (update: UpdateOrThunk<T, INIT>) => {
      if (typeof update === "function") {
        const updater = update as (value?: T) => T;
        setTabState((s) => ({
          ...s,
          contentState: {
            ...s?.contentState,
            [subPath]: updater(
              (s?.contentState?.[subPath] as
                | Parameters<typeof updater>[0]
                | undefined) ?? memoizedInitialValue
            )
          }
        }));
      } else {
        setTabState((s) => ({
          ...memoizedInitialValue,
          ...s,
          contentState: {
            ...s?.contentState,
            [subPath]: update
          }
        }));
      }
    },
    [setTabState, subPath, memoizedInitialValue]
  );

  return [value, updater];
}
