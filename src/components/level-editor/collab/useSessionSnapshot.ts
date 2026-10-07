import { useEffect, useState } from "react";

import { CollabMember } from "./collabTypes";
import { JoinStage, SessionPhase, levelEditorSession } from "./session";

export type SessionSnapshot = {
  phase: SessionPhase;
  joinStage: JoinStage;
  roomCode: string | null;
  joinError: string | null;
  signalingDown: boolean;
  members: CollabMember[];
};

function readSessionSnapshot(): SessionSnapshot {
  return {
    phase: levelEditorSession.getPhase(),
    joinStage: levelEditorSession.getJoinStage(),
    roomCode: levelEditorSession.getRoomCode(),
    joinError: levelEditorSession.getJoinError(),
    signalingDown: levelEditorSession.isSignalingDown(),
    members: levelEditorSession.getMembers()
  };
}

/** Ignores presence-only churn (cursors update at 15-20Hz) so subscribers
 *  only re-render when membership, identity, or status actually changes. */
function sessionFingerprint(snapshot: SessionSnapshot): string {
  return [
    snapshot.phase,
    snapshot.joinStage,
    snapshot.roomCode,
    snapshot.joinError,
    snapshot.signalingDown,
    ...snapshot.members.map(
      (m) =>
        `${m.clientId}:${m.state.identity.name}:${m.state.identity.color}:` +
        `${m.state.identity.iconKey}:${m.state.away}:${m.idle}:` +
        `${m.state.buildId}`
    )
  ].join("|");
}

export function useSessionSnapshot(): SessionSnapshot {
  const [snapshot, setSnapshot] =
    useState<SessionSnapshot>(readSessionSnapshot);
  useEffect(() => {
    let lastFingerprint = "";
    const update = () => {
      const next = readSessionSnapshot();
      const fingerprint = sessionFingerprint(next);
      if (fingerprint === lastFingerprint) return;
      lastFingerprint = fingerprint;
      setSnapshot(next);
    };
    update();
    levelEditorSession.events.on("sessionChanged", update);
    levelEditorSession.events.on("membersChanged", update);
    // Idle transitions happen without any awareness event to react to.
    const idleRefresh = setInterval(update, 10_000);
    return () => {
      levelEditorSession.events.off("sessionChanged", update);
      levelEditorSession.events.off("membersChanged", update);
      clearInterval(idleRefresh);
    };
  }, []);
  return snapshot;
}
