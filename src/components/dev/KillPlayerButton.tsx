import { useContext } from "react";

import { GameControllerContext } from "src/components/context/GameControllerContext";
import { isPlayerAPI } from "src/entities/player/PlayerAPI";
import { incrementHealth } from "src/redux/status/slice";
import { store } from "src/redux/store";

export function KillPlayerButton() {
  const gameController = useContext(GameControllerContext);

  const handleKill = () => {
    const level = gameController?.level;
    const player = [...(level?.getEntities().values() ?? [])].find(isPlayerAPI);

    if (!player) {
      console.warn("No player entity found.");
      return;
    }

    store.dispatch(incrementHealth(-999));
  };

  return (
    <div className="kill-player-container">
      <button className="kill-player-button" onClick={handleKill}>
        Kill Player
      </button>
    </div>
  );
}
