import { useEffect } from "react";

import { gotoLevel } from "src/redux/gameState/slice";
import { useAppStore } from "src/redux/hooks";
import { extractOptsFromCurrentURL } from "src/util/devUtil";

export function useApplyUrlParams() {
  const store = useAppStore();
  useEffect(() => {
    const onUrlUpdate = () => {
      const state = store.getState();
      const opt = extractOptsFromCurrentURL();
      if (opt?.level && opt?.level !== state.gameState.levelId) {
        store.dispatch(gotoLevel({ levelId: opt.level }));
      }
    };
    window.addEventListener("popstate", onUrlUpdate);
    return () => {
      window.removeEventListener("popstate", onUrlUpdate);
    };
  }, [store]);
}
