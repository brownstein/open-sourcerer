import { useEffect, useState } from "react";

import {
  LevelEditorEvents,
  LevelEditorStore,
  LevelEditorUIState,
  levelEditorStore
} from "./LevelEditorStore";
import { LevelEditorState } from "./levelEditorState";

/**
 * Mirror a slice of the singleton store into local React state. The component
 * re-renders only when one of the listed events fires AND the selected value
 * (compared with `isEqual`, defaulting to Object.is) differs from the previous.
 */
export function useLevelEditorSelector<T>(
  select: (s: LevelEditorStore) => T,
  events: readonly (keyof LevelEditorEvents)[],
  isEqual: (a: T, b: T) => boolean = Object.is
): T {
  const [value, setValue] = useState<T>(() => select(levelEditorStore));

  useEffect(() => {
    const update = () => {
      const next = select(levelEditorStore);
      setValue((prev) => (isEqual(prev, next) ? prev : next));
    };
    // Catch any change between initial useState and effect mount.
    update();
    for (const e of events) levelEditorStore.events.on(e, update);
    return () => {
      for (const e of events) levelEditorStore.events.off(e, update);
    };
    // We intentionally exclude select/events/isEqual from the deps array —
    // callers pass fresh closures each render but the subscription identity is
    // stable. Treat the first-mount snapshot as authoritative.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return value;
}

/** Re-renders on any state-data change. Returns the full LevelEditorState. */
export function useLevelEditorState(): Readonly<LevelEditorState> {
  return useLevelEditorSelector((s) => s.getState(), ["stateChanged"]);
}

/** Re-renders on any UI-state change (panel sizes, leftTab, missingTilesets). */
export function useLevelEditorUIState(): Readonly<LevelEditorUIState> {
  return useLevelEditorSelector((s) => s.getUI(), ["uiChanged"]);
}

/** Re-renders when the preloader's ready flag flips. */
export function useLevelEditorAssetsReady(): boolean {
  return useLevelEditorSelector(
    (s) => s.isAssetsReady(),
    ["preloaderChanged"]
  );
}
