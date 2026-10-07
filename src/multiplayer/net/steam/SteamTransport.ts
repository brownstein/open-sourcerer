import { createTypedEventEmitter } from "src/api/util";

import { LobbyAdMsg, PROTOCOL_VERSION } from "../protocol";
import type {
  LobbyDiscoveryAPI,
  LobbyDiscoveryEvents,
  LobbyListing,
  NetChannel,
  NetRoomAPI,
  NetRoomEvents,
  NetTransportAPI,
  SteamNetBridge
} from "../transport";
import { logMultiplayer } from "../transport";

/**
 * Steam-backed transport for the Electron app. All Steamworks calls run in
 * the main process (steamworks.js is a native module); this adapter talks
 * to it through the preload bridge:
 *
 *  - a room IS a Steam lobby: `ref` is the lobby id (as a decimal string),
 *    peers are SteamID64 strings, membership events come from Steam's
 *    LobbyChatUpdate callbacks.
 *  - channels multiplex over Steam P2P messaging as JSON envelopes
 *    `{ c: channelName, d: data }`, fanned out to lobby members by the main
 *    process.
 *  - discovery is native: advertising writes the ad into lobby metadata
 *    (key "osts_ad"), browsing polls Steam's public lobby list. There is no
 *    separate directory room and no heartbeat/expiry bookkeeping — Steam
 *    owns lobby lifetime.
 */

const LOBBY_AD_KEY = "osts_ad";
const LOBBY_LIST_POLL_MS = 4_000;

type WireEnvelope = { c: string; d: unknown };

type SteamNetEvent = {
  kind: string;
  lobbyId?: string;
  peerId?: string;
  payload?: string;
  [key: string]: unknown;
};

class SteamRoom implements NetRoomAPI {
  readonly ref: string;
  readonly events = createTypedEventEmitter<NetRoomEvents>();

  private readonly bridge: SteamNetBridge;
  private peers = new Set<string>();
  private handlers = new Map<
    string,
    (data: unknown, context: { peerId: string }) => void
  >();
  private closed = false;

  constructor(
    bridge: SteamNetBridge,
    lobbyId: string,
    initialPeers: string[]
  ) {
    this.bridge = bridge;
    this.ref = lobbyId;
    for (const peerId of initialPeers) {
      if (peerId !== bridge.steamId) this.peers.add(peerId);
    }
  }

  /** Routed by SteamTransport from the single main-process event stream. */
  handleEvent(event: SteamNetEvent): void {
    if (this.closed) return;
    switch (event.kind) {
      case "memberJoined":
        if (event.peerId && event.peerId !== this.bridge.steamId) {
          this.peers.add(event.peerId);
          this.events.emit("peerJoined", event.peerId);
        }
        break;
      case "memberLeft":
        if (event.peerId && this.peers.delete(event.peerId)) {
          this.events.emit("peerLeft", event.peerId);
        }
        break;
      case "message": {
        if (!event.peerId || typeof event.payload !== "string") break;
        let envelope: WireEnvelope;
        try {
          envelope = JSON.parse(event.payload) as WireEnvelope;
        } catch {
          return;
        }
        const handler = this.handlers.get(envelope.c);
        handler?.(envelope.d, { peerId: event.peerId });
        break;
      }
    }
  }

  makeChannel<T>(name: string): NetChannel<T> {
    return {
      send: async (data, options) => {
        const payload = JSON.stringify({ c: name, d: data });
        const target = options?.target;
        const targets =
          target === undefined
            ? [...this.peers]
            : Array.isArray(target)
              ? target
              : [target];
        await this.bridge.invoke("sendToPeers", {
          lobbyId: this.ref,
          peerIds: targets,
          payload
        });
      },
      setOnMessage: (fn) => {
        this.handlers.set(
          name,
          fn as (data: unknown, context: { peerId: string }) => void
        );
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
    // Steam connectivity is binary: if the bridge initialized, Steam is up.
    return false;
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.peers.clear();
    void this.bridge.invoke("leaveLobby", { lobbyId: this.ref });
  }
}

class SteamDiscovery implements LobbyDiscoveryAPI {
  readonly events = createTypedEventEmitter<LobbyDiscoveryEvents>();

  private readonly bridge: SteamNetBridge;
  private readonly transport: SteamTransport;
  private listings: LobbyListing[] = [];
  private poll: ReturnType<typeof setInterval> | null = null;
  private currentAd: LobbyAdMsg | null = null;

  constructor(bridge: SteamNetBridge, transport: SteamTransport) {
    this.bridge = bridge;
    this.transport = transport;
  }

  isOpen(): boolean {
    return this.poll !== null;
  }

  open(): void {
    if (this.poll) return;
    const refresh = async () => {
      try {
        const result = (await this.bridge.invoke("getLobbies", {
          adKey: LOBBY_AD_KEY
        })) as { lobbies: { lobbyId: string; ad: string }[] };
        const next: LobbyListing[] = [];
        for (const entry of result.lobbies) {
          if (entry.lobbyId === this.transport.activeRoomRef()) continue;
          try {
            const ad = JSON.parse(entry.ad) as LobbyAdMsg;
            if (ad.protocolVersion !== PROTOCOL_VERSION) continue;
            // Steam listings join by lobby id, not by the ad's embedded code.
            next.push({
              peerId: entry.lobbyId,
              ad: { ...ad, code: entry.lobbyId },
              lastSeenMs: Date.now()
            });
          } catch {
            // Not one of ours (or malformed) — skip.
          }
        }
        this.listings = next;
        this.events.emit("listChanged");
      } catch (err) {
        logMultiplayer(`steam lobby list failed: ${String(err)}`);
      }
    };
    void refresh();
    this.poll = setInterval(refresh, LOBBY_LIST_POLL_MS);
  }

  close(): void {
    if (this.poll) {
      clearInterval(this.poll);
      this.poll = null;
    }
    this.listings = [];
    this.events.emit("listChanged");
  }

  advertise(ad: Omit<LobbyAdMsg, "protocolVersion"> | null): void {
    const lobbyId = this.transport.activeRoomRef();
    if (!lobbyId) return;
    if (ad === null) {
      this.currentAd = null;
      void this.bridge.invoke("setLobbyData", {
        lobbyId,
        key: LOBBY_AD_KEY,
        value: ""
      });
      void this.bridge.invoke("setLobbyJoinable", { lobbyId, joinable: true });
      return;
    }
    this.currentAd = { ...ad, protocolVersion: PROTOCOL_VERSION };
    void this.bridge.invoke("setLobbyData", {
      lobbyId,
      key: LOBBY_AD_KEY,
      value: JSON.stringify(this.currentAd)
    });
  }

  getListings(): LobbyListing[] {
    return this.listings;
  }
}

export class SteamTransport implements NetTransportAPI {
  readonly kind = "steam" as const;
  readonly selfId: string;
  readonly discovery: SteamDiscovery;

  private readonly bridge: SteamNetBridge;
  private rooms = new Map<string, SteamRoom>();

  constructor(bridge: SteamNetBridge) {
    this.bridge = bridge;
    this.selfId = bridge.steamId;
    this.discovery = new SteamDiscovery(bridge, this);
    bridge.onEvent((event) => {
      const typed = event as SteamNetEvent;
      if (typed.lobbyId) this.rooms.get(typed.lobbyId)?.handleEvent(typed);
    });
  }

  /** The most recently opened room's lobby id (for discovery correlation). */
  activeRoomRef(): string | null {
    let last: string | null = null;
    for (const ref of this.rooms.keys()) last = ref;
    return last;
  }

  async createRoom(): Promise<NetRoomAPI> {
    const result = (await this.bridge.invoke("createLobby", {})) as {
      lobbyId: string;
    };
    const room = new SteamRoom(this.bridge, result.lobbyId, []);
    this.trackRoom(room);
    return room;
  }

  async joinRoom(ref: string): Promise<NetRoomAPI> {
    const result = (await this.bridge.invoke("joinLobby", {
      lobbyId: ref
    })) as { lobbyId: string; members: string[] };
    const room = new SteamRoom(this.bridge, result.lobbyId, result.members);
    this.trackRoom(room);
    // Membership arrived synchronously with the join; surface the existing
    // peers as join events on the next tick so listeners registered right
    // after joinRoom() resolves still hear them.
    setTimeout(() => {
      for (const peerId of room.getPeerIds()) {
        room.events.emit("peerJoined", peerId);
      }
    }, 0);
    return room;
  }

  private trackRoom(room: SteamRoom): void {
    this.rooms.set(room.ref, room);
    const origClose = room.close.bind(room);
    room.close = () => {
      this.rooms.delete(room.ref);
      origClose();
    };
  }
}
