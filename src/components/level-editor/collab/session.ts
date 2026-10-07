import {
  defaultRelayUrls,
  getRelaySockets,
  joinRoom
} from "@trystero-p2p/torrent";
import type { Room } from "@trystero-p2p/torrent";
import {
  Awareness,
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
  removeAwarenessStates
} from "y-protocols/awareness";
import * as Y from "yjs";

import { createTypedEventEmitter } from "src/api/util";
import { isDevMode } from "src/util/devUtil";

import { levelEditorStore } from "../LevelEditorStore";
import { recenterOnContent } from "../editorMapActions";
import { REMOTE_ORIGIN, getDocMeta } from "../levelEditorDoc";
import { BUILD_ID } from "./buildIdentity";
import {
  CollabAwarenessState,
  CollabIdentity,
  CollabMember,
  pickFreeColor
} from "./collabTypes";

// The collaboration session singleton. It lives at the same altitude as
// levelEditorStore: created on Host/Join, torn down only by explicit Leave or
// page unload, never by the editor tab unmounting. React components are pure
// subscribers.
//
// Roles: "host" only means "created the room and seeded the doc". After first
// sync all peers are equal; the session survives the creator leaving because
// every peer can seed late joiners from its own copy of the doc.

const APP_ID = "open-sourcerer-level-editor";
// The tracker protocol can't trickle ICE, so each side must finish candidate
// gathering (15s transport cap when STUN is blocked) before its offer/answer
// can be sent, and ICE checks run after that. Observed on a STUN-degraded
// network: answer arrives ~30s in, so the timeout must comfortably outlast
// the full worst-case handshake.
const JOIN_TIMEOUT_MS = 60_000;
const SIGNALING_GRACE_MS = 5_000;
const SIGNALING_POLL_MS = 3_000;
const RESYNC_INTERVAL_MS = 30_000;
const JOIN_TOAST_QUIET_MS = 3_000;
const IDLE_AFTER_MS = 30_000;

/** Awareness update origin for changes applied from the network. */
const AWARENESS_REMOTE_ORIGIN = "remote";

/** Awareness update origin for dropping a peer whose link to us died. */
const AWARENESS_PEER_LEFT_ORIGIN = "peer-left";

/** How long incoming doc updates buffer before applying in one transaction.
 *  A drag-painting peer sends one update per mousemove; applying each on its
 *  own re-derives the store view (and re-syncs the renderer) per update. */
const REMOTE_APPLY_COALESCE_MS = 16;

// Public TURN relay (Open Relay project), used by ICE only when no direct
// path between peers exists (privacy-hardened browsers that suppress local
// candidates, networks without NAT hairpinning). Peer traffic stays
// end-to-end encrypted through the relay.
const FALLBACK_TURN_SERVERS = [
  {
    urls: "turn:openrelay.metered.ca:80",
    username: "openrelayproject",
    credential: "openrelayproject"
  },
  {
    urls: "turn:openrelay.metered.ca:443",
    username: "openrelayproject",
    credential: "openrelayproject"
  },
  {
    urls: "turns:openrelay.metered.ca:443?transport=tcp",
    username: "openrelayproject",
    credential: "openrelayproject"
  }
];

function anyRelaySocketOpen(): boolean {
  const sockets: Record<string, WebSocket> = getRelaySockets();
  return Object.values(sockets).some(
    (socket) => socket?.readyState === WebSocket.OPEN
  );
}

// y-protocols types awareness states as untyped maps, so every read goes
// through these two accessors to keep the cast in one place. A state can
// still be missing its identity mid-handshake; callers check for it.
function getAwarenessStates(
  awareness: Awareness
): Map<number, CollabAwarenessState> {
  return awareness.getStates() as Map<number, CollabAwarenessState>;
}

function getLocalAwarenessState(
  awareness: Awareness
): CollabAwarenessState | null {
  return awareness.getLocalState() as CollabAwarenessState | null;
}

function logCollab(message: string): void {
  if (isDevMode()) console.info(`[collab] ${message}`);
}

export type SessionPhase = "idle" | "connecting" | "in-room";

/** What the joiner is visibly waiting on while connecting. */
export type JoinStage = "searching" | "syncing";

export type SessionEvents = {
  /** Phase / room code / error / signaling health changed. */
  sessionChanged: void;
  /** The set of members (or a member's awareness state) changed. */
  membersChanged: void;
  memberJoined: { name: string };
  memberLeft: { name: string };
};

type ActiveRoom = {
  code: string;
  room: Room;
  doc: Y.Doc;
  awareness: Awareness;
  detach: () => void;
};

export class LevelEditorSession {
  readonly events = createTypedEventEmitter<SessionEvents>();

  private _phase: SessionPhase = "idle";
  private _joinError: string | null = null;
  private _active: ActiveRoom | null = null;
  private _isCreator = false;
  /** The local slot whose save seeded the room (creator only). Saving to it
   *  again skips the overwrite prompt. */
  private _seededSavedMapId: string | null = null;
  /** Once the user answers the save-overwrite prompt (or it's auto-resolved),
   *  saves go silently to the chosen slot for the rest of the session. */
  private _saveDecisionMade = false;
  /** Last known identities, for naming members that just left. */
  private _lastKnownIdentities = new Map<number, CollabIdentity>();
  private _lastActivityByClient = new Map<number, number>();
  private _joinTimeout: ReturnType<typeof setTimeout> | null = null;
  private _signalingPoll: ReturnType<typeof setInterval> | null = null;
  private _signalingDown = false;
  private _roomOpenedAt = 0;
  /** Suppresses join toasts while the initial awareness sync floods in. */
  private _quietJoinsUntil = Infinity;
  /** A peer was found and SDP was exchanged, but no network path worked.
   *  Distinguishes "blocked p2p" from "nobody in the room" on join timeout. */
  private _sawPeerConnectionFailure = false;
  private _joinStage: JoinStage = "searching";

  constructor() {
    if (typeof window !== "undefined") {
      window.addEventListener("beforeunload", () => {
        this.leave();
      });
    }
    levelEditorStore.events.on("openCountChanged", () => {
      this.setLocalField("away", levelEditorStore.getOpenCount() === 0);
    });
    // A different level was loaded into the shared doc: slot choices made for
    // the old level (seed slot, answered overwrite prompt) no longer apply.
    levelEditorStore.events.on("levelIdentityChanged", () => {
      this._saveDecisionMade = false;
      this._seededSavedMapId = null;
    });
  }

  // -------------------------------------------------------------------------
  // Read API
  // -------------------------------------------------------------------------

  getPhase(): SessionPhase {
    return this._phase;
  }

  isInRoom(): boolean {
    return this._phase === "in-room";
  }

  getRoomCode(): string | null {
    return this._active?.code ?? null;
  }

  getJoinError(): string | null {
    return this._joinError;
  }

  getJoinStage(): JoinStage {
    return this._joinStage;
  }

  isCreator(): boolean {
    return this._isCreator;
  }

  /** True when none of the signaling servers is reachable: peers can't find
   *  the room, though already-established connections keep working. */
  isSignalingDown(): boolean {
    return this._signalingDown;
  }

  getSeededSavedMapId(): string | null {
    return this._seededSavedMapId;
  }

  isSaveDecisionMade(): boolean {
    return this._saveDecisionMade;
  }

  markSaveDecisionMade(): void {
    this._saveDecisionMade = true;
  }

  getMembers(): CollabMember[] {
    if (!this._active) return [];
    const selfClientId = this._active.doc.clientID;
    const now = Date.now();
    const members: CollabMember[] = [];
    getAwarenessStates(this._active.awareness).forEach((state, clientId) => {
      if (!state?.identity) return;
      const isSelf = clientId === selfClientId;
      members.push({
        clientId,
        isSelf,
        idle:
          !isSelf &&
          now - (this._lastActivityByClient.get(clientId) ?? now) >
            IDLE_AFTER_MS,
        state
      });
    });
    members.sort((a, b) => a.clientId - b.clientId);
    return members;
  }

  // -------------------------------------------------------------------------
  // Presence write API (identity now; cursors etc. layer on the same channel)
  // -------------------------------------------------------------------------

  setLocalField<K extends keyof CollabAwarenessState>(
    field: K,
    value: CollabAwarenessState[K]
  ): void {
    this._active?.awareness.setLocalStateField(field, value);
  }

  updateIdentity(identity: CollabIdentity): void {
    this.setLocalField("identity", identity);
  }

  // -------------------------------------------------------------------------
  // Host / Join / Leave
  // -------------------------------------------------------------------------

  /** Create a room seeded from the current editor document. */
  host(code: string, identity: CollabIdentity): void {
    if (this._phase !== "idle") return;
    const doc = levelEditorStore.getDoc();
    this._isCreator = true;
    this._seededSavedMapId = levelEditorStore.getState().savedMapId ?? null;
    this._saveDecisionMade = false;
    this._quietJoinsUntil = Date.now() + JOIN_TOAST_QUIET_MS;
    this.openRoom(code, doc, identity);
    levelEditorStore.setSharedDocMode(true);
    this._phase = "in-room";
    this._joinError = null;
    this.events.emit("sessionChanged");
  }

  /** Join an existing room. THE JOIN-ADOPTS RULE: the room's document is
   *  adopted wholesale into a fresh local doc; the joiner's pre-existing doc
   *  never enters the room, so no cross-session merge can ever happen. */
  join(code: string, identity: CollabIdentity): void {
    if (this._phase !== "idle") return;
    const doc = new Y.Doc();
    this._isCreator = false;
    this._seededSavedMapId = null;
    this._saveDecisionMade = false;
    this._phase = "connecting";
    this._joinError = null;
    this._joinStage = "searching";
    // Tell the UI immediately: the next session event otherwise only arrives
    // once a peer connects, leaving the join click looking ignored.
    this.events.emit("sessionChanged");

    this._joinTimeout = setTimeout(() => {
      const reachedSignaling = anyRelaySocketOpen();
      const sawPeer = this._sawPeerConnectionFailure;
      this.teardown();
      this._phase = "idle";
      this._joinError = sawPeer
        ? "Found the room, but a direct connection couldn't be made. This network or browser may be blocking peer-to-peer traffic."
        : reachedSignaling
          ? "Couldn't find the room. Check the code, and make sure someone's still in it."
          : "Couldn't reach the connection servers. Check your internet connection or firewall, then try again.";
      this.events.emit("sessionChanged");
    }, JOIN_TIMEOUT_MS);

    this.openRoom(code, doc, identity, () => {
      if (this._joinTimeout) {
        clearTimeout(this._joinTimeout);
        this._joinTimeout = null;
      }
      levelEditorStore.replaceDoc(doc);
      levelEditorStore.setSharedDocMode(true);
      // The joiner's local save slot doesn't correspond to the room's level;
      // the save flow re-matches by level UUID.
      levelEditorStore.setSavedMapId(undefined);
      recenterOnContent(levelEditorStore.getState().layers);
      this._quietJoinsUntil = Date.now() + JOIN_TOAST_QUIET_MS;
      this._phase = "in-room";
      this.events.emit("sessionChanged");
      this.events.emit("membersChanged");
    });
  }

  /** Leave the room. The local doc stays as-is: the user keeps the level
   *  exactly as it was at the moment of leaving, and can rejoin with the
   *  same code. */
  leave(): void {
    if (!this._active && this._phase === "idle") return;
    this.teardown();
    this._phase = "idle";
    this._joinError = null;
    this.events.emit("sessionChanged");
    this.events.emit("membersChanged");
  }

  clearJoinError(): void {
    this._joinError = null;
    this.events.emit("sessionChanged");
  }

  // -------------------------------------------------------------------------
  // Wiring
  // -------------------------------------------------------------------------

  private openRoom(
    code: string,
    doc: Y.Doc,
    identity: CollabIdentity,
    onAdopt?: () => void
  ): void {
    // The code doubles as the Trystero password: signaling is end-to-end
    // encrypted, so trackers only ever see hashed topics and IPs. All known
    // relays are used (not the default first-3 slice): public trackers fail
    // often enough that redundancy is what makes rooms findable at all.
    this._sawPeerConnectionFailure = false;
    const room = joinRoom(
      {
        appId: APP_ID,
        password: code,
        relayConfig: { urls: defaultRelayUrls },
        turnConfig: FALLBACK_TURN_SERVERS
      },
      code,
      {
        onJoinError: (details) => {
          this._sawPeerConnectionFailure = true;
          console.warn(`[collab] peer connection failed: ${details.error}`);
        }
      }
    );

    const docState = room.makeAction<Uint8Array>("docState");
    const docStateVector = room.makeAction<Uint8Array>("docSv");
    const awarenessChannel = room.makeAction<Uint8Array>("aware");
    const hello = room.makeAction<number>("hello");

    const awareness = new Awareness(doc);
    awareness.setLocalState({
      identity,
      buildId: BUILD_ID,
      away: levelEditorStore.getOpenCount() === 0,
      joinedAt: Date.now()
    } satisfies CollabAwarenessState);

    // A joiner is not a seed until it adopts the room's doc: it must not
    // answer state-vector requests (two concurrent joiners would otherwise
    // adopt each other's empty docs), and adoption waits for real level data.
    let seeded = onAdopt == null;

    const onDocUpdate = (update: Uint8Array, origin: unknown) => {
      if (origin === REMOTE_ORIGIN) return;
      void docState.send(update);
    };
    doc.on("update", onDocUpdate);

    let pendingRemoteUpdates: Uint8Array[] = [];
    let remoteFlushTimer: ReturnType<typeof setTimeout> | null = null;
    const flushRemoteUpdates = () => {
      if (remoteFlushTimer) {
        clearTimeout(remoteFlushTimer);
        remoteFlushTimer = null;
      }
      if (pendingRemoteUpdates.length === 0) return;
      const updates = pendingRemoteUpdates;
      pendingRemoteUpdates = [];
      doc.transact(() => {
        for (const update of updates) {
          Y.applyUpdate(doc, update, REMOTE_ORIGIN);
        }
      }, REMOTE_ORIGIN);
    };

    docState.onMessage = (update) => {
      if (!seeded) {
        Y.applyUpdate(doc, update, REMOTE_ORIGIN);
        if (getDocMeta(doc).get("levelUuid") != null) {
          seeded = true;
          logCollab("adopted the room document");
          onAdopt?.();
        }
        return;
      }
      pendingRemoteUpdates.push(update);
      if (!remoteFlushTimer) {
        remoteFlushTimer = setTimeout(
          flushRemoteUpdates,
          REMOTE_APPLY_COALESCE_MS
        );
      }
    };

    // State-vector exchange for initial/late-join sync: every peer greets a
    // newcomer with its state vector, and answers received vectors with the
    // missing diff. The full mesh makes this redundant per-peer, which is
    // what guarantees any peer can seed a late joiner after the creator
    // leaves.
    docStateVector.onMessage = (stateVector, { peerId }) => {
      if (!seeded) return;
      flushRemoteUpdates();
      void docState.send(Y.encodeStateAsUpdate(doc, stateVector), {
        target: peerId
      });
    };

    awarenessChannel.onMessage = (update) => {
      applyAwarenessUpdate(awareness, update, AWARENESS_REMOTE_ORIGIN);
    };

    const onAwarenessUpdate = (
      changes: { added: number[]; updated: number[]; removed: number[] },
      origin: unknown
    ) => {
      if (origin === AWARENESS_REMOTE_ORIGIN) return;
      // A peer-left removal reflects one dead link, not the room's view;
      // rebroadcasting it would evict the member for peers whose links to
      // them are still healthy.
      if (origin === AWARENESS_PEER_LEFT_ORIGIN) return;
      const changed = [
        ...changes.added,
        ...changes.updated,
        ...changes.removed
      ];
      if (changed.length === 0) return;
      void awarenessChannel.send(encodeAwarenessUpdate(awareness, changed));
    };
    awareness.on("update", onAwarenessUpdate);

    const onAwarenessChange = (changes: {
      added: number[];
      updated: number[];
      removed: number[];
    }) => {
      const selfClientId = doc.clientID;
      const now = Date.now();
      for (const clientId of [...changes.added, ...changes.updated]) {
        if (clientId !== selfClientId) {
          this._lastActivityByClient.set(clientId, now);
        }
      }
      const announceJoins = now > this._quietJoinsUntil;
      for (const clientId of changes.added) {
        if (clientId === selfClientId) continue;
        const state = getAwarenessStates(awareness).get(clientId);
        if (announceJoins && state?.identity) {
          this.events.emit("memberJoined", { name: state.identity.name });
        }
      }
      for (const clientId of [...changes.added, ...changes.updated]) {
        const state = getAwarenessStates(awareness).get(clientId);
        if (state?.identity) {
          this._lastKnownIdentities.set(clientId, state.identity);
        }
      }
      for (const clientId of changes.removed) {
        if (clientId === selfClientId) continue;
        const last = this._lastKnownIdentities.get(clientId);
        this._lastKnownIdentities.delete(clientId);
        this._lastActivityByClient.delete(clientId);
        if (last) {
          this.events.emit("memberLeft", { name: last.name });
        }
      }
      this.resolveColorCollision(awareness);
      this.events.emit("membersChanged");
    };
    awareness.on("change", onAwarenessChange);

    const clientIdByPeer = new Map<string, number>();
    hello.onMessage = (clientId, { peerId }) => {
      clientIdByPeer.set(peerId, clientId);
    };

    room.onPeerJoin = (peerId) => {
      logCollab(`peer connected: ${peerId}`);
      if (this._phase === "connecting" && this._joinStage !== "syncing") {
        this._joinStage = "syncing";
        this.events.emit("sessionChanged");
      }
      void hello.send(doc.clientID, { target: peerId });
      void docStateVector.send(Y.encodeStateVector(doc), { target: peerId });
      const states = [...awareness.getStates().keys()];
      if (states.length > 0) {
        void awarenessChannel.send(encodeAwarenessUpdate(awareness, states), {
          target: peerId
        });
      }
    };

    // Drop a disconnected peer's presence immediately: a crashed tab never
    // announces its own departure, and the awareness timeout takes 30s.
    room.onPeerLeave = (peerId) => {
      logCollab(`peer left: ${peerId}`);
      const clientId = clientIdByPeer.get(peerId);
      clientIdByPeer.delete(peerId);
      if (clientId != null && clientId !== doc.clientID) {
        removeAwarenessStates(
          awareness,
          [clientId],
          AWARENESS_PEER_LEFT_ORIGIN
        );
      }
    };

    // Heals updates a flaky link dropped mid-session; answers to an in-sync
    // vector are near-empty.
    const resyncInterval = setInterval(() => {
      if (!seeded) return;
      flushRemoteUpdates();
      void docStateVector.send(Y.encodeStateVector(doc));
    }, RESYNC_INTERVAL_MS);

    this._roomOpenedAt = Date.now();
    this._signalingDown = false;
    this._signalingPoll = setInterval(
      () => this.checkSignalingHealth(),
      SIGNALING_POLL_MS
    );

    this._active = {
      code,
      room,
      doc,
      awareness,
      detach: () => {
        clearInterval(resyncInterval);
        flushRemoteUpdates();
        doc.off("update", onDocUpdate);
        awareness.off("update", onAwarenessUpdate);
        awareness.off("change", onAwarenessChange);
      }
    };
  }

  private checkSignalingHealth(): void {
    if (!this._active) return;
    const down =
      !anyRelaySocketOpen() &&
      Date.now() - this._roomOpenedAt > SIGNALING_GRACE_MS;
    if (down !== this._signalingDown) {
      this._signalingDown = down;
      this.events.emit("sessionChanged");
    }
  }

  /** Members keep their chosen color unless someone who joined earlier
   *  already wears it. Seniority (join time, then client id) makes the
   *  resolution deterministic on every peer, so two simultaneous arrivals
   *  wearing the same color can't both bump onto the same replacement. */
  private resolveColorCollision(awareness: Awareness): void {
    if (this._isCreator) return;
    const localState = getLocalAwarenessState(awareness);
    if (!localState?.identity) return;
    const selfClientId = awareness.clientID;
    const selfJoinedAt = localState.joinedAt ?? 0;
    const taken: string[] = [];
    let mustYield = false;
    getAwarenessStates(awareness).forEach((state, clientId) => {
      if (clientId === selfClientId) return;
      const color = state?.identity?.color;
      if (!color) return;
      taken.push(color);
      if (color !== localState.identity.color) return;
      const otherJoinedAt = state.joinedAt ?? 0;
      if (
        otherJoinedAt < selfJoinedAt ||
        (otherJoinedAt === selfJoinedAt && clientId < selfClientId)
      ) {
        mustYield = true;
      }
    });
    if (!mustYield) return;
    const freeColor = pickFreeColor(localState.identity.color, taken);
    if (freeColor === localState.identity.color) return;
    awareness.setLocalStateField("identity", {
      ...localState.identity,
      color: freeColor
    });
  }

  private teardown(): void {
    if (this._joinTimeout) {
      clearTimeout(this._joinTimeout);
      this._joinTimeout = null;
    }
    if (this._signalingPoll) {
      clearInterval(this._signalingPoll);
      this._signalingPoll = null;
    }
    this._signalingDown = false;
    this._quietJoinsUntil = Infinity;
    const active = this._active;
    if (!active) return;
    this._active = null;
    this._lastKnownIdentities.clear();
    this._lastActivityByClient.clear();
    this._isCreator = false;
    this._seededSavedMapId = null;
    this._saveDecisionMade = false;
    levelEditorStore.setSharedDocMode(false);
    // Broadcast our departure before the connections close.
    removeAwarenessStates(
      active.awareness,
      [active.doc.clientID],
      "local-leave"
    );
    active.detach();
    active.awareness.destroy();
    void active.room.leave();
  }
}

export const levelEditorSession = new LevelEditorSession();

// Expose for MCP/console debugging alongside the store.
if (typeof window !== "undefined") {
  (
    window as { __levelEditorSession__?: LevelEditorSession }
  ).__levelEditorSession__ = levelEditorSession;
}
