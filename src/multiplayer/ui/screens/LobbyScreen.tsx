import { useCallback } from "react";

import { useAppDispatch } from "src/redux/hooks";

import { multiplayerSession } from "../../MultiplayerSession";
import { setMultiplayerFlow } from "../../match/matchSlice";
import { PROTOCOL_VERSION } from "../../net/protocol";
import { useMultiplayerSnapshot } from "../useMultiplayerSnapshot";

/** Levels offered as PvP arenas. */
export const MATCH_LEVELS: { id: string; label: string }[] = [
  { id: "TwoPlatforms", label: "Two Platforms" },
  { id: "DebugPlayground", label: "Debug Playground" },
  { id: "Demo_1_1", label: "Demo Level" }
];

const TARGET_SCORES = [1, 3, 5];

/** The lobby: room code, member list with ready state, host settings, and
 *  the start gate. Guests ready-up; the host starts once everyone is. */
export function LobbyScreen() {
  const dispatch = useAppDispatch();
  const snapshot = useMultiplayerSnapshot();

  const isHost = multiplayerSession.isHost();
  const config = multiplayerSession.getLobbyConfig();
  const selfMember = snapshot.members.find((m) => m.isSelf);
  const selfReady = selfMember?.state.ready ?? false;
  const canStart =
    isHost && snapshot.members.length > 1 && snapshot.allPeersReady;

  const onLeave = useCallback(() => {
    multiplayerSession.leave();
    dispatch(setMultiplayerFlow("menu"));
  }, [dispatch]);

  return (
    <div className="mp-screen" data-testid="mp-lobby">
      <button className="mp-back" onClick={onLeave}>
        ← Leave lobby
      </button>
      <h1>Lobby</h1>

      {snapshot.signalingDown && (
        <div className="mp-error">
          Can't reach the connection servers right now — new players won't be
          able to find this lobby.
        </div>
      )}

      <div className="mp-panel">
        <div className="mp-row mp-spread">
          <h2>Invite code</h2>
          <span className="mp-hint">
            {config.isPublic ? "Listed publicly" : "Private — share the code"}
          </span>
        </div>
        <div className="mp-row" style={{ justifyContent: "center" }}>
          <span className="mp-code" data-testid="mp-room-code">
            {snapshot.roomCode ?? ""}
          </span>
        </div>
      </div>

      <div className="mp-panel">
        <h2>Players</h2>
        {snapshot.members.map((member) => {
          const incompatible =
            member.state.protocolVersion !== PROTOCOL_VERSION;
          return (
            <div key={member.peerId} className="mp-member">
              <span
                className="mp-member-swatch"
                style={{ backgroundColor: member.state.identity.color }}
              />
              <span className="mp-member-name">
                {member.state.identity.name}
                {member.isSelf ? " (you)" : ""}
                {member.state.isHost ? " ⭐" : ""}
              </span>
              {incompatible ? (
                <span className="mp-member-status incompatible">
                  incompatible version
                </span>
              ) : (
                <span
                  className={`mp-member-status${member.state.ready ? " ready" : ""}`}
                >
                  {member.state.isHost
                    ? "Host"
                    : member.state.ready
                      ? "Ready"
                      : "Not ready"}
                </span>
              )}
            </div>
          );
        })}
        {snapshot.members.length <= 1 && (
          <div className="mp-empty">Waiting for players to join…</div>
        )}
      </div>

      <div className="mp-panel">
        <div className="mp-row mp-spread">
          <h2>Arena</h2>
          {isHost ? (
            <select
              value={config.levelId}
              onChange={(e) =>
                multiplayerSession.setLobbyConfig({ levelId: e.target.value })
              }
              data-testid="mp-level-select"
            >
              {MATCH_LEVELS.map((level) => (
                <option key={level.id} value={level.id}>
                  {level.label}
                </option>
              ))}
            </select>
          ) : (
            <span>
              {MATCH_LEVELS.find((l) => l.id === config.levelId)?.label ??
                config.levelId}
            </span>
          )}
        </div>
        <div className="mp-row mp-spread">
          <h2>First to</h2>
          {isHost ? (
            <select
              value={config.targetScore}
              onChange={(e) =>
                multiplayerSession.setLobbyConfig({
                  targetScore: Number(e.target.value)
                })
              }
            >
              {TARGET_SCORES.map((n) => (
                <option key={n} value={n}>
                  {n} KO{n > 1 ? "s" : ""}
                </option>
              ))}
            </select>
          ) : (
            <span>{config.targetScore} KOs</span>
          )}
        </div>
      </div>

      {isHost ? (
        <button
          className="mp-primary"
          disabled={!canStart}
          onClick={() => multiplayerSession.startMatch()}
          data-testid="mp-start-match"
        >
          {snapshot.members.length <= 1
            ? "Waiting for players…"
            : canStart
              ? "Start Match"
              : "Waiting for everyone to ready up…"}
        </button>
      ) : (
        <button
          className={selfReady ? undefined : "mp-primary"}
          onClick={() => multiplayerSession.setReady(!selfReady)}
          data-testid="mp-ready-toggle"
        >
          {selfReady ? "Not ready" : "Ready!"}
        </button>
      )}
    </div>
  );
}
