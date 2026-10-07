import { useEffect } from "react";

import { LevelEditorTab } from "./LevelEditor";
import { levelEditorStore } from "./LevelEditorStore";
import { useLevelEditorAssetsReady } from "./useLevelEditorStore";

/**
 * Wraps the level editor and preloads all entity assets before rendering.
 * Both the asset-loading lifecycle and the open-instance count are owned by
 * the LevelEditorStore singleton, so progress is preserved across mount /
 * unmount (e.g. when the user drags the tab around the FlexLayout).
 */
export function LevelEditorPreloaderTab() {
  const ready = useLevelEditorAssetsReady();

  useEffect(() => {
    levelEditorStore.openInstance();
    return () => {
      levelEditorStore.closeInstance();
    };
  }, []);

  if (!ready) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: "100%",
          height: "100%",
          background: "#1a1a2e",
          color: "#ccc",
          fontSize: 14,
          fontFamily: "monospace"
        }}
      >
        Loading entity assets...
      </div>
    );
  }

  return <LevelEditorTab />;
}
