import { useEffect, useState } from "react";

import {
  MultiplayerMember,
  MultiplayerPhase,
  multiplayerSession
} from "../MultiplayerSession";

export type MultiplayerSnapshot = {
  phase: MultiplayerPhase;
  roomCode: string | null;
  joinError: string | null;
  signalingDown: boolean;
  isCreator: boolean;
  allPeersReady: boolean;
  members: MultiplayerMember[];
};

function readSnapshot(): MultiplayerSnapshot {
  return {
    phase: multiplayerSession.getPhase(),
    roomCode: multiplayerSession.getRoomCode(),
    joinError: multiplayerSession.getJoinError(),
    signalingDown: multiplayerSession.isSignalingDown(),
    isCreator: multiplayerSession.isCreator(),
    allPeersReady: multiplayerSession.allPeersReady(),
    members: multiplayerSession.getMembers()
  };
}

function fingerprint(snapshot: MultiplayerSnapshot): string {
  return [
    snapshot.phase,
    snapshot.roomCode,
    snapshot.joinError,
    snapshot.signalingDown,
    snapshot.isCreator,
    snapshot.allPeersReady,
    ...snapshot.members.map(
      (m) =>
        `${m.peerId}:${m.state.identity.name}:${m.state.identity.color}:` +
        `${m.state.ready}:${m.state.buildId}:${m.state.protocolVersion}:` +
        `${m.state.isHost ?? false}:${JSON.stringify(m.state.lobbyConfig ?? null)}`
    )
  ].join("|");
}

export function useMultiplayerSnapshot(): MultiplayerSnapshot {
  const [snapshot, setSnapshot] = useState<MultiplayerSnapshot>(readSnapshot);
  useEffect(() => {
    let last = "";
    const update = () => {
      const next = readSnapshot();
      const print = fingerprint(next);
      if (print === last) return;
      last = print;
      setSnapshot(next);
    };
    update();
    multiplayerSession.events.on("sessionChanged", update);
    multiplayerSession.events.on("membersChanged", update);
    return () => {
      multiplayerSession.events.off("sessionChanged", update);
      multiplayerSession.events.off("membersChanged", update);
    };
  }, []);
  return snapshot;
}
