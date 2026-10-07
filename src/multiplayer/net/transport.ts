import { TypedEventEmitter } from "src/api/util";
import { isDevMode } from "src/util/devUtil";

import { LobbyAdMsg } from "./protocol";

/**
 * Transport abstraction for multiplayer networking.
 *
 * Two implementations exist:
 *  - Trystero (browser default): serverless WebRTC over torrent-tracker
 *    signaling; the lobby directory is a well-known public room.
 *  - Steam (Electron app): Valve's matchmaking + P2P networking via
 *    steamworks.js running in the main process, bridged to the renderer
 *    over IPC. Steam lobbies are first-class, so the "directory" is the
 *    Steam lobby list and the advertisement is lobby metadata.
 *
 * Everything above this seam (MultiplayerSession, replication, match rules,
 * screens) is transport-agnostic: rooms are joined by an opaque string ref
 * (Trystero: 8-char room code; Steam: lobby id), peers are opaque string
 * ids (Trystero peer id; Steam: SteamID64).
 */

export type NetChannel<T> = {
  send: (
    data: T,
    options?: { target?: string | string[] }
  ) => Promise<void>;
  setOnMessage: (
    fn: (data: T, context: { peerId: string }) => void
  ) => void;
};

export type NetRoomEvents = {
  peerJoined: string;
  peerLeft: string;
  /** A peer was found but no network path could be established. */
  peerConnectionFailed: string;
  signalingHealthChanged: boolean;
};

export interface NetRoomAPI {
  /** The joinable reference for this room (code / lobby id). */
  readonly ref: string;
  readonly events: TypedEventEmitter<NetRoomEvents>;
  makeChannel<T>(name: string): NetChannel<T>;
  getPeerIds(): string[];
  peerCount(): number;
  isSignalingDown(): boolean;
  close(): void;
}

export type LobbyListing = {
  peerId: string;
  ad: LobbyAdMsg;
  lastSeenMs: number;
};

export type LobbyDiscoveryEvents = {
  /** The visible lobby list changed (ad received, retracted, or expired). */
  listChanged: void;
};

export interface LobbyDiscoveryAPI {
  readonly events: TypedEventEmitter<LobbyDiscoveryEvents>;
  /** Start browsing (idempotent). */
  open(): void;
  /** Stop browsing and retract any advertisement. */
  close(): void;
  /** Set (or clear, with null) this client's lobby advertisement. */
  advertise(ad: Omit<LobbyAdMsg, "protocolVersion"> | null): void;
  /** Current visible lobbies, freshest first. Excludes our own. */
  getListings(): LobbyListing[];
  isOpen(): boolean;
}

export interface NetTransportAPI {
  readonly kind: "trystero" | "steam";
  /** This client's stable peer id under this transport. */
  readonly selfId: string;
  /** Create a new joinable room; the transport generates the ref. */
  createRoom(): Promise<NetRoomAPI>;
  /** Join an existing room by ref. Resolving does NOT mean peers were
   *  found yet — peer discovery is reported via room events. */
  joinRoom(ref: string): Promise<NetRoomAPI>;
  readonly discovery: LobbyDiscoveryAPI;
}

export function logMultiplayer(message: string): void {
  if (isDevMode()) console.info(`[multiplayer] ${message}`);
}

// ---------------------------------------------------------------------------
// Transport selection
// ---------------------------------------------------------------------------

/** Shape of the preload-exposed Steam bridge (see electron/preload.ts). */
export type SteamNetBridge = {
  steamId: string;
  invoke: (op: string, args?: unknown) => Promise<unknown>;
  onEvent: (fn: (event: { kind: string; [key: string]: unknown }) => void) => void;
};

export function getSteamNetBridge(): SteamNetBridge | null {
  const bridge = (
    window as { osts?: { steamNet?: SteamNetBridge } }
  ).osts?.steamNet;
  return bridge && typeof bridge.steamId === "string" ? bridge : null;
}

let activeTransport: NetTransportAPI | null = null;
let transportFactory: (() => NetTransportAPI) | null = null;

/** Registered once at startup by netTransportInit.ts (which statically
 *  imports both adapters and picks by bridge presence). Indirection keeps
 *  this module import-cycle-free for the adapters that import its types. */
export function registerTransportFactory(factory: () => NetTransportAPI): void {
  transportFactory = factory;
}

/** The transport for this runtime: Steam when the Electron preload bridge
 *  reports a running Steam client, Trystero otherwise. Resolved once. */
export function getNetTransport(): NetTransportAPI {
  if (activeTransport) return activeTransport;
  if (!transportFactory) {
    throw new Error(
      "Net transport used before initNetTransport() — import order bug"
    );
  }
  activeTransport = transportFactory();
  logMultiplayer(`transport: ${activeTransport.kind} (${activeTransport.selfId})`);
  return activeTransport;
}

/** This client's stable peer id under the active transport. */
export function getSelfPeerId(): string {
  return getNetTransport().selfId;
}
