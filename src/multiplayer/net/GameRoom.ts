import {
  defaultRelayUrls,
  getRelaySockets,
  joinRoom,
  selfId
} from "@trystero-p2p/torrent";
import type { DataPayload, Room } from "@trystero-p2p/torrent";

import { createTypedEventEmitter } from "src/api/util";

import type { NetChannel, NetRoomAPI, NetRoomEvents } from "./transport";
import { logMultiplayer } from "./transport";

export { logMultiplayer };
export type { NetChannel };

// The Trystero room implementation, mirroring the level editor's collab
// session (src/components/level-editor/collab/session.ts): torrent-signaled
// WebRTC full mesh, room code doubling as the end-to-end encryption
// password, all known relays used for redundancy, and public TURN fallback
// for networks that block direct peer paths.

const APP_ID = "open-sourcerer-multiplayer";

// Public TURN relay (Open Relay project); ICE only uses it when no direct
// path exists. Peer traffic stays end-to-end encrypted through the relay.
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

const SIGNALING_GRACE_MS = 5_000;
const SIGNALING_POLL_MS = 3_000;

/** This client's stable peer id under the Trystero transport. */
export const trysteroSelfId: string = selfId;

function anyRelaySocketOpen(): boolean {
  const sockets: Record<string, WebSocket> = getRelaySockets();
  return Object.values(sockets).some(
    (socket) => socket?.readyState === WebSocket.OPEN
  );
}

/**
 * Trystero-backed room: channels, peer join/leave events, and signaling
 * health monitoring. Owns nothing about lobby or match semantics.
 */
export class GameRoom implements NetRoomAPI {
  readonly code: string;
  readonly events = createTypedEventEmitter<NetRoomEvents>();

  private room: Room;
  private peers = new Set<string>();
  private signalingDown = false;
  private openedAt = Date.now();
  private signalingPoll: ReturnType<typeof setInterval>;
  private closed = false;

  constructor(code: string) {
    this.code = code;
    this.room = joinRoom(
      {
        appId: APP_ID,
        password: code,
        relayConfig: { urls: defaultRelayUrls },
        turnConfig: FALLBACK_TURN_SERVERS
      },
      code,
      {
        onJoinError: (details) => {
          logMultiplayer(`peer connection failed: ${details.error}`);
          this.events.emit("peerConnectionFailed", details.peerId);
        }
      }
    );
    this.room.onPeerJoin = (peerId) => {
      if (this.closed) return;
      logMultiplayer(`peer connected: ${peerId}`);
      this.peers.add(peerId);
      this.events.emit("peerJoined", peerId);
    };
    this.room.onPeerLeave = (peerId) => {
      if (this.closed) return;
      logMultiplayer(`peer left: ${peerId}`);
      this.peers.delete(peerId);
      this.events.emit("peerLeft", peerId);
    };
    this.signalingPoll = setInterval(() => {
      const down =
        !anyRelaySocketOpen() && Date.now() - this.openedAt > SIGNALING_GRACE_MS;
      if (down !== this.signalingDown) {
        this.signalingDown = down;
        this.events.emit("signalingHealthChanged", down);
      }
    }, SIGNALING_POLL_MS);
  }

  get ref(): string {
    return this.code;
  }

  /**
   * Typed wrapper over a Trystero action. Message types are plain JSON by
   * convention (summaries only carry JSON-safe values); the cast keeps
   * Trystero's JsonValue constraint from infecting every message interface.
   */
  makeChannel<T>(name: string): NetChannel<T> {
    const action = this.room.makeAction<DataPayload>(name);
    return {
      send: (data, options) =>
        action.send(data as unknown as DataPayload, options),
      setOnMessage: (fn) => {
        action.onMessage = fn as unknown as (
          data: DataPayload,
          context: { peerId: string }
        ) => void;
      }
    };
  }

  getPeerIds(): string[] {
    return [...this.peers];
  }

  peerCount(): number {
    return this.peers.size;
  }

  isSignalingDown(): boolean {
    return this.signalingDown;
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    clearInterval(this.signalingPoll);
    this.peers.clear();
    void this.room.leave();
  }
}
