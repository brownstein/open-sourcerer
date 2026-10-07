import { useCallback, useMemo } from "react";

import { returnToTitleScreen } from "src/redux/gameState/slice";
import { useAppDispatch, useAppSelector } from "src/redux/hooks";

import { multiplayerSession } from "../../MultiplayerSession";
import { selectMatchState } from "../../match/selectors";
import { useMultiplayerSnapshot } from "../useMultiplayerSnapshot";
import "./MultiplayerScreens.less";

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/**
 * Post-match results overlay: outcome, score table, duration, and the
 * rematch loop. "Rematch" is a ready-up — when every member is ready the
 * host's client re-fires the match with the same settings, so nobody ever
 * reconnects between matches.
 */
export function ResultsScreen() {
  const dispatch = useAppDispatch();
  const match = useAppSelector(selectMatchState);
  const snapshot = useMultiplayerSnapshot();

  const onLeave = useCallback(() => {
    multiplayerSession.leave();
    dispatch(returnToTitleScreen());
  }, [dispatch]);

  const rows = useMemo(() => {
    const names = new Map<string, { name: string; color: string }>();
    if (match.selfPeerId) {
      names.set(match.selfPeerId, { name: "You", color: "#ffffff" });
    }
    for (const opponent of match.opponents) {
      names.set(opponent.peerId, {
        name: opponent.name,
        color: opponent.color
      });
    }
    return Object.entries(match.scores)
      .map(([peerId, score]) => ({
        peerId,
        score,
        name: names.get(peerId)?.name ?? "???",
        color: names.get(peerId)?.color ?? "#ffffff",
        isWinner: peerId === match.winnerPeerId
      }))
      .sort((a, b) => b.score - a.score);
  }, [match.scores, match.opponents, match.selfPeerId, match.winnerPeerId]);

  if (match.flow !== "results") return null;

  const won = match.winnerPeerId === match.selfPeerId;
  const durationMs =
    match.matchStartedAtMs !== null && match.matchEndedAtMs !== null
      ? match.matchEndedAtMs - match.matchStartedAtMs
      : null;

  const selfReady =
    snapshot.members.find((m) => m.isSelf)?.state.ready ?? false;
  const readyCount = snapshot.members.filter((m) => m.state.ready).length;
  const stillConnected = snapshot.members.length > 1;

  return (
    <div className="mp-results" data-testid="mp-results">
      <h1 className={won ? "victory" : "defeat"}>
        {won ? "VICTORY" : "DEFEAT"}
      </h1>

      <table className="mp-results-table">
        <thead>
          <tr>
            <th>Player</th>
            <th>KOs</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.peerId}
              className={row.isWinner ? "mp-results-winner" : undefined}
            >
              <td>
                <span
                  className="mp-member-swatch"
                  style={{
                    display: "inline-block",
                    width: 12,
                    height: 12,
                    borderRadius: "50%",
                    marginRight: 8,
                    backgroundColor: row.color
                  }}
                />
                {row.name}
                {row.isWinner ? " 🏆" : ""}
              </td>
              <td>{row.score}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {durationMs !== null && (
        <div className="mp-results-duration">
          Match time: {formatDuration(durationMs)}
        </div>
      )}

      <div className="mp-results-buttons">
        {stillConnected && (
          <button
            className="mp-primary"
            disabled={selfReady}
            onClick={() => multiplayerSession.setReady(true)}
            data-testid="mp-rematch"
          >
            {selfReady ? "Waiting…" : "Rematch"}
          </button>
        )}
        {stillConnected && multiplayerSession.isHost() && (
          <button onClick={() => multiplayerSession.backToLobby()}>
            Back to Lobby
          </button>
        )}
        <button onClick={onLeave} data-testid="mp-leave">
          Leave
        </button>
      </div>

      {stillConnected && (
        <div className="mp-results-waiting">
          {readyCount}/{snapshot.members.length} ready for a rematch
        </div>
      )}
      {!stillConnected && (
        <div className="mp-results-waiting">Your opponent left the room.</div>
      )}
    </div>
  );
}
