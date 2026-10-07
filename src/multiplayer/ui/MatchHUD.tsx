import { useAppSelector } from "src/redux/hooks";

import { multiplayerSession } from "../MultiplayerSession";
import { selectMatchState } from "../match/selectors";
import "./MatchHUD.less";

/**
 * In-match overlay: countdown and score line. Opponent health bars live in
 * the status HUD (OpponentBars, below the player's own bars). Renders
 * nothing outside a live match — the post-match state is the
 * ResultsScreen's.
 */
export function MatchHUD() {
  const match = useAppSelector(selectMatchState);

  if (match.phase === "idle" || match.phase === "matchEnd") return null;

  const selfScore = match.selfPeerId
    ? (match.scores[match.selfPeerId] ?? 0)
    : 0;

  return (
    <div className="match-hud">
      {match.phase === "loading" && (
        <div className="match-hud-banner">Waiting for players...</div>
      )}
      {match.phase === "countdown" && (
        <div className="match-hud-countdown">
          {match.countdownSeconds > 0 ? match.countdownSeconds : "GO!"}
        </div>
      )}
      <div className="match-hud-top">
        <div className="match-hud-score">
          <span className="match-hud-score-self">{selfScore}</span>
          <span className="match-hud-score-divider">—</span>
          <span className="match-hud-score-opponent">
            {match.opponents
              .map((o) => match.scores[o.peerId] ?? 0)
              .join(" / ")}
          </span>
        </div>
      </div>
    </div>
  );
}

/** Keep the session referenced so tree-shaking never drops its module (the
 *  session registers the dev global and beforeunload handler on import). */
void multiplayerSession;
