import { HexBar } from "src/components/ui/hexbar/HexBar";
import { useAppSelector } from "src/redux/hooks";

import { selectMatchInProgress, selectMatchState } from "../match/selectors";
import "./OpponentBars.css";

/**
 * Secondary player health bars, docked below the local player's bars in the
 * status HUD during a multiplayer match: one smaller bar per opponent with
 * their name, driven by the replicated hp ratios in the match slice.
 */
export function OpponentBars() {
  const inMatch = useAppSelector(selectMatchInProgress);
  const match = useAppSelector(selectMatchState);

  if (!inMatch || match.opponents.length === 0) return null;

  return (
    <div className="opponent-bars">
      {match.opponents.map((opponent) => {
        const hp = Math.max(
          0,
          Math.min(1, match.opponentHp[opponent.peerId] ?? 1)
        );
        return (
          <div key={opponent.peerId} className="opponent-bar-row">
            <HexBar valueFrac={hp} className="hex-opponent-bar" />
            <span
              className="opponent-bar-name"
              style={{ color: opponent.color }}
            >
              {opponent.name}
            </span>
          </div>
        );
      })}
    </div>
  );
}
