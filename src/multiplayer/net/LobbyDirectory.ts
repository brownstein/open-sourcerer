import { createTypedEventEmitter } from "src/api/util";

import { GameRoom, trysteroSelfId } from "./GameRoom";
import { LobbyAdMsg, PROTOCOL_VERSION } from "./protocol";
import type {
  LobbyDiscoveryAPI,
  LobbyDiscoveryEvents,
  LobbyListing,
  NetChannel
} from "./transport";

/**
 * Trystero lobby discovery: a well-known public directory room every client
 * on the multiplayer menu joins. Hosts advertise their open lobbies into it
 * on a heartbeat; browsers listen and render the list. The directory only
 * discovers — joining still goes through the normal room handshake with the
 * advertised code.
 *
 * By construction this room is public (fixed code), so public lobby
 * metadata is visible to anyone running the game. Private lobbies simply
 * never advertise.
 */
const DIRECTORY_ROOM_CODE = "OSMPDIR1";
const AD_HEARTBEAT_MS = 3_000;
const AD_EXPIRY_MS = 10_000;
const EXPIRY_SWEEP_MS = 2_000;

export type { LobbyListing };

export class LobbyDirectory implements LobbyDiscoveryAPI {
  readonly events = createTypedEventEmitter<LobbyDiscoveryEvents>();

  private room?: GameRoom;
  private channel?: NetChannel<LobbyAdMsg>;
  private listings = new Map<string, LobbyListing>();
  private currentAd: LobbyAdMsg | null = null;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private expirySweep: ReturnType<typeof setInterval> | null = null;

  isOpen(): boolean {
    return !!this.room;
  }

  /** Join the directory room and start listening. Idempotent. */
  open(): void {
    if (this.room) return;
    const room = new GameRoom(DIRECTORY_ROOM_CODE);
    this.room = room;
    this.channel = room.makeChannel<LobbyAdMsg>("lobbyAd");
    this.channel.setOnMessage((ad, { peerId }) => {
      if (ad.protocolVersion !== PROTOCOL_VERSION) return;
      if (ad.code === null) {
        if (this.listings.delete(peerId)) this.events.emit("listChanged");
        return;
      }
      this.listings.set(peerId, { peerId, ad, lastSeenMs: Date.now() });
      this.events.emit("listChanged");
    });
    room.events.on("peerJoined", () => {
      // Introduce our advertisement to the newcomer directly.
      if (this.currentAd) void this.channel?.send(this.currentAd);
    });
    room.events.on("peerLeft", (peerId) => {
      if (this.listings.delete(peerId)) this.events.emit("listChanged");
    });
    this.expirySweep = setInterval(() => {
      const cutoff = Date.now() - AD_EXPIRY_MS;
      let changed = false;
      for (const [peerId, listing] of this.listings) {
        if (listing.lastSeenMs < cutoff) {
          this.listings.delete(peerId);
          changed = true;
        }
      }
      if (changed) this.events.emit("listChanged");
    }, EXPIRY_SWEEP_MS);
  }

  /** Leave the directory room entirely (retracts any advertisement). */
  close(): void {
    this.advertise(null);
    if (this.heartbeat) {
      clearInterval(this.heartbeat);
      this.heartbeat = null;
    }
    if (this.expirySweep) {
      clearInterval(this.expirySweep);
      this.expirySweep = null;
    }
    this.listings.clear();
    this.channel = undefined;
    this.room?.close();
    this.room = undefined;
    this.events.emit("listChanged");
  }

  /** Set (or clear, with null) this client's lobby advertisement. While set,
   *  it re-broadcasts on a heartbeat so browsers can expire dead entries. */
  advertise(ad: Omit<LobbyAdMsg, "protocolVersion"> | null): void {
    if (!this.room) {
      if (ad !== null) {
        // Advertising requires the directory connection; hosts keep it open
        // for as long as the lobby is advertised.
        this.open();
      } else {
        this.currentAd = null;
        return;
      }
    }
    if (ad === null) {
      if (this.currentAd) {
        void this.channel?.send({ ...this.currentAd, code: null });
      }
      this.currentAd = null;
      if (this.heartbeat) {
        clearInterval(this.heartbeat);
        this.heartbeat = null;
      }
      return;
    }
    this.currentAd = { ...ad, protocolVersion: PROTOCOL_VERSION };
    void this.channel?.send(this.currentAd);
    if (!this.heartbeat) {
      this.heartbeat = setInterval(() => {
        if (this.currentAd) void this.channel?.send(this.currentAd);
      }, AD_HEARTBEAT_MS);
    }
  }

  /** Current visible lobbies, freshest first. Excludes our own ad. */
  getListings(): LobbyListing[] {
    return [...this.listings.values()]
      .filter((l) => l.peerId !== trysteroSelfId)
      .sort((a, b) => b.lastSeenMs - a.lastSeenMs);
  }
}
