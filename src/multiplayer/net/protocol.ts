import { CharacterCustomization } from "src/api/characterCustomization";

import { EntityNetSummary } from "../api";

/** Bumped whenever a wire format changes incompatibly. Members with a
 *  different protocol version are shown as incompatible in the lobby. */
export const PROTOCOL_VERSION = 2;

/** Trystero action namespaces (must stay short — 12-byte limit upstream). */
export const CHANNELS = {
  /** Member/lobby state broadcast (identity, ready, customization). */
  memberState: "mstate",
  /** Match control messages (start, level ready, ko, end). */
  match: "match",
  /** Entity replication. */
  spawn: "spawn",
  update: "update",
  despawn: "despawn",
  event: "event"
} as const;

export type MemberIdentity = {
  name: string;
  /** One of the lobby colors. */
  color: string;
  iconKey: string;
};

/** Lobby settings, carried on the host's member state so guests see live
 *  selections without a separate channel. */
export type LobbyConfig = {
  levelId: string;
  targetScore: number;
  maxPlayers: number;
  isPublic: boolean;
};

/** State each member broadcasts to the room whenever it changes. */
export type MemberStateMsg = {
  protocolVersion: number;
  buildId: string;
  identity: MemberIdentity;
  customization: CharacterCustomization;
  ready: boolean;
  /** True on the acting host (the room creator, or the deterministically
   *  promoted member after the creator leaves). */
  isHost?: boolean;
  /** Present only on the host's state. */
  lobbyConfig?: LobbyConfig;
};

export type MatchControlMsg =
  | {
      t: "start";
      levelId: string;
      /** Peer ids in spawn-slot order; each client teleports its own player
       *  to the slot matching its position in this list. */
      spawnOrder: string[];
      /** First score to reach this wins. */
      targetScore: number;
    }
  | { t: "levelReady" }
  | { t: "ko"; victimPeerId: string }
  | { t: "leaveMatch" }
  /** Host sends everyone back to the lobby screen from the results screen
   *  (to change settings before the next match). */
  | { t: "toLobby" };

/** A public lobby's advertisement in the directory room. */
export type LobbyAdMsg = {
  protocolVersion: number;
  /** The joinable room code, or null to retract the advertisement. */
  code: string | null;
  hostName: string;
  hostColor: string;
  levelId: string;
  playerCount: number;
  maxPlayers: number;
  targetScore: number;
  /** True once the match starts (shown as in-progress, not joinable). */
  started: boolean;
};

export type SpawnMsg = {
  netId: string;
  /** Real entity type name on the owner; peers look up the stub class for it
   *  in the stub registry. */
  entityType: string;
  summary: EntityNetSummary;
};

export type UpdateMsg = {
  netId: string;
  summary: EntityNetSummary;
};

export type DespawnMsg = {
  netId: string;
  reason: "removed" | "impact" | "expired";
  finalSummary?: EntityNetSummary;
};

export type EntityEventMsg = {
  netId: string;
  kind: string;
  data?: unknown;
};
