import { useCallback, useContext } from "react";

import { GameControllerContext } from "src/components/context/GameControllerContext";

export function LoadButton() {
  const controller = useContext(GameControllerContext);
  const handleLoad = useCallback(() => controller?.load(), [controller]);
  return (
    <button className="dev-controls-button load-game" onClick={handleLoad}>
      Load Game
    </button>
  );
}

export function SaveButton() {
  const controller = useContext(GameControllerContext);
  const handleSave = useCallback(() => controller?.save(), [controller]);
  return (
    <button className="dev-controls-button save-game" onClick={handleSave}>
      Save Game
    </button>
  );
}
