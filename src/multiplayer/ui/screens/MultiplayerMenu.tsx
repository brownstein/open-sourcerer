import { useCallback, useEffect, useState } from "react";

import { IdentityEditor } from "src/components/level-editor/collab/IdentityEditor";
import {
  CollabIdentity,
  ROOM_CODE_LENGTH,
  isValidRoomCode,
  normalizeRoomCode
} from "src/components/level-editor/collab/collabTypes";
import {
  loadStoredIdentity,
  storeIdentity
} from "src/components/level-editor/collab/identityStorage";
import { useAppDispatch } from "src/redux/hooks";

import { multiplayerSession } from "../../MultiplayerSession";
import { setMultiplayerFlow } from "../../match/matchSlice";
import type { LobbyListing } from "../../net/transport";
import { getNetTransport } from "../../net/transport";
import { useMultiplayerSnapshot } from "../useMultiplayerSnapshot";

function useLobbyListings(): LobbyListing[] {
  const discovery = getNetTransport().discovery;
  const [listings, setListings] = useState<LobbyListing[]>(() =>
    discovery.getListings()
  );
  useEffect(() => {
    discovery.open();
    const update = () => setListings(discovery.getListings());
    discovery.events.on("listChanged", update);
    update();
    return () => {
      discovery.events.off("listChanged", update);
      // Discovery stays open if we're advertising (hosting); otherwise
      // browsing ends with the menu.
      if (!multiplayerSession.isHost()) discovery.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return listings;
}

/** The multiplayer entry screen: identity, live lobby browser, create
 *  (public/private), and join-by-code. */
export function MultiplayerMenu() {
  const dispatch = useAppDispatch();
  const snapshot = useMultiplayerSnapshot();
  const listings = useLobbyListings();
  const [identity, setIdentity] = useState<CollabIdentity>(loadStoredIdentity);
  const [joinCode, setJoinCode] = useState("");
  const [isPublic, setIsPublic] = useState(true);

  useEffect(() => {
    multiplayerSession.clearJoinError();
  }, []);

  const updateIdentity = useCallback((next: CollabIdentity) => {
    setIdentity(next);
    storeIdentity(next);
  }, []);

  const identityReady = identity.name.trim().length > 0;
  // Trystero refs are 8-char codes; Steam refs are numeric lobby ids.
  const isSteam = getNetTransport().kind === "steam";
  const normalizedCode = isSteam
    ? joinCode.replace(/[^0-9]/g, "")
    : normalizeRoomCode(joinCode);
  const refValid = isSteam
    ? /^\d{6,20}$/.test(normalizedCode)
    : isValidRoomCode(normalizedCode);
  const trimmedIdentity = useCallback(
    (): CollabIdentity => ({ ...identity, name: identity.name.trim() }),
    [identity]
  );

  const onCreate = useCallback(() => {
    if (!identityReady) return;
    void multiplayerSession.host(trimmedIdentity(), { isPublic });
  }, [identityReady, trimmedIdentity, isPublic]);

  const onJoin = useCallback(
    (code: string) => {
      if (!identityReady) return;
      void multiplayerSession.join(code, trimmedIdentity());
    },
    [identityReady, trimmedIdentity]
  );

  const onBack = useCallback(() => {
    multiplayerSession.leave();
    getNetTransport().discovery.close();
    dispatch(setMultiplayerFlow("none"));
  }, [dispatch]);

  const joining = snapshot.phase === "connecting";

  return (
    <div className="mp-screen" data-testid="mp-menu">
      <button className="mp-back" onClick={onBack}>
        ← Back
      </button>
      <h1>Multiplayer</h1>

      <div className="mp-panel">
        <h2>Your Sorcerer</h2>
        <IdentityEditor identity={identity} onChange={updateIdentity} />
      </div>

      {joining ? (
        <div className="mp-panel" data-testid="mp-joining">
          <div className="mp-row mp-spread">
            <span>Looking for the room…</span>
            <button onClick={() => multiplayerSession.leave()}>Cancel</button>
          </div>
        </div>
      ) : (
        <>
          <div className="mp-panel">
            <div className="mp-row mp-spread">
              <h2>Open Lobbies</h2>
              <span className="mp-hint">{listings.length} found</span>
            </div>
            <div className="mp-lobby-list" data-testid="mp-lobby-list">
              {listings.length === 0 && (
                <div className="mp-empty">
                  No open lobbies right now — create one below.
                </div>
              )}
              {listings.map((listing) => {
                const ad = listing.ad;
                const full = ad.playerCount >= ad.maxPlayers;
                return (
                  <div key={listing.peerId} className="mp-lobby-entry">
                    <span
                      className="mp-member-swatch"
                      style={{ backgroundColor: ad.hostColor }}
                    />
                    <span className="mp-lobby-host">{ad.hostName}</span>
                    <span className="mp-lobby-meta">
                      {ad.levelId} · {ad.playerCount}/{ad.maxPlayers} · first to{" "}
                      {ad.targetScore}
                    </span>
                    <button
                      disabled={!identityReady || full || !ad.code}
                      onClick={() => ad.code && onJoin(ad.code)}
                    >
                      {full ? "Full" : "Join"}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mp-panel">
            <div className="mp-row mp-spread">
              <h2>Create a Lobby</h2>
              <label className="mp-row">
                <input
                  type="checkbox"
                  checked={isPublic}
                  onChange={(e) => setIsPublic(e.target.checked)}
                />
                <span className="mp-hint">Listed publicly</span>
              </label>
              <button
                className="mp-primary"
                disabled={!identityReady}
                onClick={onCreate}
                data-testid="mp-create-lobby"
              >
                Create
              </button>
            </div>
            <div className="mp-row">
              <h2>Join by code</h2>
              <input
                type="text"
                value={joinCode}
                placeholder="CODE"
                onChange={(e) =>
                  setJoinCode(
                    isSteam
                      ? e.target.value.replace(/[^0-9]/g, "").slice(0, 20)
                      : normalizeRoomCode(e.target.value).slice(
                          0,
                          ROOM_CODE_LENGTH
                        )
                  )
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter") onJoin(normalizedCode);
                }}
                data-testid="mp-code-input"
              />
              <button
                disabled={!identityReady || !refValid}
                onClick={() => onJoin(normalizedCode)}
                data-testid="mp-code-join"
              >
                Join
              </button>
            </div>
          </div>
        </>
      )}

      {snapshot.joinError && <div className="mp-error">{snapshot.joinError}</div>}
      {!identityReady && (
        <div className="mp-hint">Give your sorcerer a name to continue.</div>
      )}
    </div>
  );
}
