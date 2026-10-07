import {
  EntityHitDetails,
  EntityLevelEvents,
  EntityLifecycleEvents
} from "src/api/entity";
import { createTypedEventEmitter } from "src/api/util";
import { BUILD_ID } from "src/components/level-editor/collab/buildIdentity";
import { GameController } from "src/engine/controller/GameController";
import { getPlayer } from "src/engine/util/levelUtil";
import { isPlayerAPI } from "src/entities/player/PlayerAPI";
import { selectCharacterCustomization } from "src/redux/status/selectors";
import { store } from "src/redux/store";

import { NetIdRegistry } from "./NetIdRegistry";
import { MatchDirector } from "./match/MatchDirector";
import { resetMatchSetup } from "./match/applyMatchSetup";
import {
  leaveMultiplayer,
  setMultiplayerFlow,
  setOpponentHp
} from "./match/matchSlice";
import { selectMatchState } from "./match/selectors";
import "./net/netTransportInit";
import {
  NetChannel,
  NetRoomAPI,
  NetTransportAPI,
  getNetTransport,
  getSelfPeerId,
  logMultiplayer
} from "./net/transport";
import {
  CHANNELS,
  DespawnMsg,
  EntityEventMsg,
  LobbyConfig,
  MatchControlMsg,
  MemberIdentity,
  MemberStateMsg,
  PROTOCOL_VERSION,
  SpawnMsg,
  UpdateMsg
} from "./net/protocol";
import { EntityReplicator } from "./replication/EntityReplicator";
import { PlayerStubProps } from "./stubs/PlayerStub";

const JOIN_TIMEOUT_MS = 60_000;
const MELEE_SWING_DAMAGE = 5;
const MELEE_SWING_REACH = 1.8;

export const DEFAULT_LOBBY_CONFIG: LobbyConfig = {
  levelId: "TwoPlatforms",
  targetScore: 3,
  maxPlayers: 4,
  isPublic: true
};

export type MultiplayerPhase = "idle" | "connecting" | "lobby";

export type MultiplayerMember = {
  peerId: string;
  isSelf: boolean;
  state: MemberStateMsg;
};

export type MultiplayerSessionEvents = {
  sessionChanged: void;
  membersChanged: void;
};

type OpenChannels = {
  memberState: NetChannel<MemberStateMsg>;
  match: NetChannel<MatchControlMsg>;
  spawn: NetChannel<SpawnMsg>;
  update: NetChannel<UpdateMsg>;
  despawn: NetChannel<DespawnMsg>;
  event: NetChannel<EntityEventMsg>;
};

/**
 * The multiplayer session singleton — same altitude as the level editor's
 * collab session: created on Host/Join, torn down only by explicit Leave or
 * page unload. React components are pure subscribers.
 *
 * Owns the Trystero room, lobby membership (broadcast member state — no CRDT
 * needed for match play), and the per-match EntityReplicator + MatchDirector.
 */
export class MultiplayerSession {
  readonly events = createTypedEventEmitter<MultiplayerSessionEvents>();

  private _phase: MultiplayerPhase = "idle";
  private _joinError: string | null = null;
  private _isCreator = false;
  private room?: NetRoomAPI;
  private channels?: OpenChannels;
  private localState?: MemberStateMsg;
  private remoteMembers = new Map<string, MemberStateMsg>();
  private controller?: GameController;
  private joinTimeout: ReturnType<typeof setTimeout> | null = null;
  private sawPeerConnectionFailure = false;

  private readonly transport: NetTransportAPI = getNetTransport();
  private readonly selfId: string = getSelfPeerId();
  private readonly netIds = new NetIdRegistry(getSelfPeerId());
  private lastKnownConfig: LobbyConfig = DEFAULT_LOBBY_CONFIG;
  private replicator?: EntityReplicator;
  private director?: MatchDirector;
  /** netId of each remote peer's Player stub, for HUD health routing. */
  private playerNetIdByPeer = new Map<string, string>();
  private lastOpponentHp = new Map<string, number>();
  private detachPlayerHooks?: () => void;
  private detachSpellBindings?: () => void;

  constructor() {
    if (typeof window !== "undefined") {
      window.addEventListener("beforeunload", () => this.leave());
    }
  }

  // ---------------------------------------------------------------------------
  // Read API
  // ---------------------------------------------------------------------------

  getPhase(): MultiplayerPhase {
    return this._phase;
  }

  getRoomCode(): string | null {
    return this.room?.ref ?? null;
  }

  getJoinError(): string | null {
    return this._joinError;
  }

  clearJoinError(): void {
    this._joinError = null;
    this.events.emit("sessionChanged");
  }

  isCreator(): boolean {
    return this._isCreator;
  }

  /** Whether this client currently holds the host role (creator, or the
   *  deterministically promoted member after the creator left). */
  isHost(): boolean {
    return this.localState?.isHost === true;
  }

  /** The lobby's live settings, whoever hosts them. */
  getLobbyConfig(): LobbyConfig {
    if (this.localState?.isHost && this.localState.lobbyConfig) {
      return this.localState.lobbyConfig;
    }
    for (const state of this.remoteMembers.values()) {
      if (state.isHost && state.lobbyConfig) return state.lobbyConfig;
    }
    return this.lastKnownConfig;
  }

  isSignalingDown(): boolean {
    return this.room?.isSignalingDown() ?? false;
  }

  getMembers(): MultiplayerMember[] {
    const members: MultiplayerMember[] = [];
    if (this.localState) {
      members.push({ peerId: this.selfId, isSelf: true, state: this.localState });
    }
    for (const [peerId, state] of this.remoteMembers) {
      members.push({ peerId, isSelf: false, state });
    }
    return members;
  }

  allPeersReady(): boolean {
    if (this.remoteMembers.size === 0) return false;
    for (const state of this.remoteMembers.values()) {
      if (!state.ready) return false;
    }
    return true;
  }

  // ---------------------------------------------------------------------------
  // Game wiring
  // ---------------------------------------------------------------------------

  attachGame(controller: GameController): void {
    this.controller = controller;
    // A title-screen match start parks its loading sequence until the
    // controller exists; resume it now.
    this.director?.notifyControllerAttached();
  }

  /** The game controller is going away (level unload, return to title).
   *  This does NOT leave the room — the lobby connection outlives the game
   *  world so the results→lobby→rematch loop never reconnects. */
  detachGame(): void {
    this.detachPlayerHooks?.();
    this.detachPlayerHooks = undefined;
    this.detachSpellBindings?.();
    this.replicator?.detachLevel();
    this.director?.notifyControllerDetached();
    this.controller = undefined;
  }

  // ---------------------------------------------------------------------------
  // Host / Join / Leave
  // ---------------------------------------------------------------------------

  /** Create a room via the transport (Trystero: generated code; Steam: new
   *  lobby) and enter the lobby flow as its host. Async but safe to
   *  fire-and-forget from UI. */
  async host(
    identity: MemberIdentity,
    config?: Partial<LobbyConfig>
  ): Promise<void> {
    if (this._phase !== "idle") return;
    this._phase = "connecting";
    this._isCreator = true;
    this.lastKnownConfig = { ...DEFAULT_LOBBY_CONFIG, ...config };
    this.events.emit("sessionChanged");
    let room: NetRoomAPI;
    try {
      room = await this.transport.createRoom();
    } catch (err) {
      this._phase = "idle";
      this._isCreator = false;
      this._joinError = `Couldn't create the room: ${String(err)}`;
      this.events.emit("sessionChanged");
      return;
    }
    this.openRoom(room, identity);
    if (this.localState) {
      this.localState.isHost = true;
      this.localState.lobbyConfig = this.lastKnownConfig;
      void this.channels?.memberState.send(this.localState);
    }
    this._phase = "lobby";
    this._joinError = null;
    store.dispatch(setMultiplayerFlow("lobby"));
    this.refreshAdvertisement();
    this.events.emit("sessionChanged");
    this.events.emit("membersChanged");
  }

  /** Join an existing room by ref (code / lobby id). Async but safe to
   *  fire-and-forget from UI; failures surface via joinError. */
  async join(ref: string, identity: MemberIdentity): Promise<void> {
    if (this._phase !== "idle") return;
    this._isCreator = false;
    this._phase = "connecting";
    this._joinError = null;
    this.events.emit("sessionChanged");
    let room: NetRoomAPI;
    try {
      room = await this.transport.joinRoom(ref);
    } catch (err) {
      this._phase = "idle";
      this._joinError = `Couldn't join the room: ${String(err)}`;
      this.events.emit("sessionChanged");
      return;
    }
    this.openRoom(room, identity);
    this.joinTimeout = setTimeout(() => {
      const sawPeer = this.sawPeerConnectionFailure;
      this.teardown();
      this._phase = "idle";
      this._joinError = sawPeer
        ? "Found the room, but a direct connection couldn't be made. This network or browser may be blocking peer-to-peer traffic."
        : "Couldn't find the room. Check the code, and make sure someone's still in it.";
      this.events.emit("sessionChanged");
    }, JOIN_TIMEOUT_MS);
  }

  leave(): void {
    if (!this.room && this._phase === "idle") return;
    if (this.channels) {
      // Best-effort: tell the room we're leaving any running match.
      void this.channels.match.send({ t: "leaveMatch" });
    }
    this.teardown();
    this._phase = "idle";
    this._joinError = null;
    store.dispatch(leaveMultiplayer());
    this.events.emit("sessionChanged");
    this.events.emit("membersChanged");
  }

  /** Host: pull everyone (self included) back to the lobby screen from the
   *  results screen to change settings before the next match. */
  backToLobby(): void {
    if (!this.isHost() || !this.director) return;
    void this.channels?.match.send({ t: "toLobby" });
    this.director.returnToLobby();
    this.setReady(false);
  }

  // ---------------------------------------------------------------------------
  // Presence write API
  // ---------------------------------------------------------------------------

  updateIdentity(identity: MemberIdentity): void {
    this.updateLocalState({ identity });
  }

  setReady(ready: boolean): void {
    this.updateLocalState({
      ready,
      customization: selectCharacterCustomization(store.getState())
    });
    this.maybeAutoRematch();
  }

  /** Host: change lobby settings; guests see them via the host's member
   *  state, and the public advertisement refreshes. */
  setLobbyConfig(partial: Partial<LobbyConfig>): void {
    if (!this.localState?.isHost) return;
    this.lastKnownConfig = { ...this.getLobbyConfig(), ...partial };
    this.updateLocalState({ lobbyConfig: this.lastKnownConfig });
    this.refreshAdvertisement();
  }

  private updateLocalState(partial: Partial<MemberStateMsg>): void {
    if (!this.localState) return;
    this.localState = { ...this.localState, ...partial };
    void this.channels?.memberState.send(this.localState);
    this.events.emit("membersChanged");
  }

  // ---------------------------------------------------------------------------
  // Match control
  // ---------------------------------------------------------------------------

  startMatch(levelId?: string): void {
    if (!this.isHost() || !this.room || !this.director) return;
    if (this.room.peerCount() === 0) return;
    const config = this.getLobbyConfig();
    // The lobby is no longer joinable; retract the public advertisement.
    this.transport.discovery.advertise(null);
    this.transport.discovery.close();
    this.director.startMatch(
      levelId ?? config.levelId,
      this.room.getPeerIds(),
      config.targetScore
    );
  }

  /** On the results screen, "Rematch" = ready-up; when every member is
   *  ready the host's client re-fires the match with the same settings. */
  private maybeAutoRematch(): void {
    if (!this.isHost()) return;
    const flow = selectMatchState(store.getState()).flow;
    if (flow !== "results") return;
    if (!this.localState?.ready || !this.allPeersReady()) return;
    this.setReadyAllLocalOnly(false);
    this.startMatch();
  }

  /** Reset everyone's ready flags locally ahead of a rematch (each client
   *  also resets its own on match start via member state). */
  private setReadyAllLocalOnly(ready: boolean): void {
    if (this.localState) {
      this.localState = { ...this.localState, ready };
      void this.channels?.memberState.send(this.localState);
    }
  }

  // ---------------------------------------------------------------------------
  // Wiring
  // ---------------------------------------------------------------------------

  private openRoom(room: NetRoomAPI, identity: MemberIdentity): void {
    this.sawPeerConnectionFailure = false;
    this.room = room;
    this.localState = {
      protocolVersion: PROTOCOL_VERSION,
      buildId: BUILD_ID,
      identity,
      customization: selectCharacterCustomization(store.getState()),
      ready: false
    };

    const channels: OpenChannels = {
      memberState: room.makeChannel<MemberStateMsg>(CHANNELS.memberState),
      match: room.makeChannel<MatchControlMsg>(CHANNELS.match),
      spawn: room.makeChannel<SpawnMsg>(CHANNELS.spawn),
      update: room.makeChannel<UpdateMsg>(CHANNELS.update),
      despawn: room.makeChannel<DespawnMsg>(CHANNELS.despawn),
      event: room.makeChannel<EntityEventMsg>(CHANNELS.event)
    };
    this.channels = channels;

    this.replicator = new EntityReplicator(this.netIds, {
      sendSpawn: (msg, target) =>
        void channels.spawn.send(msg, target ? { target } : undefined),
      sendUpdate: (msg) => void channels.update.send(msg),
      sendDespawn: (msg) => void channels.despawn.send(msg),
      sendEvent: (msg) => void channels.event.send(msg)
    });

    this.director = new MatchDirector({
      getController: () => this.controller,
      getMemberState: (peerId) => this.remoteMembers.get(peerId),
      sendControl: (msg) => void channels.match.send(msg),
      onMatchLevelReady: () => this.onMatchLevelReady(),
      onMatchOver: () => this.onMatchOver(),
      onPeerLevelReady: (peerId) => this.replicator?.announceTo(peerId)
    });

    channels.memberState.setOnMessage((msg, { peerId }) => {
      const isNew = !this.remoteMembers.has(peerId);
      this.remoteMembers.set(peerId, msg);
      if (isNew) logMultiplayer(`member state from ${peerId}: ${msg.identity.name}`);
      if (msg.isHost && msg.lobbyConfig) {
        this.lastKnownConfig = msg.lobbyConfig;
      }
      if (this._phase === "connecting") {
        if (this.joinTimeout) {
          clearTimeout(this.joinTimeout);
          this.joinTimeout = null;
        }
        this._phase = "lobby";
        store.dispatch(setMultiplayerFlow("lobby"));
        this.events.emit("sessionChanged");
      }
      this.refreshAdvertisement();
      this.maybeAutoRematch();
      this.events.emit("membersChanged");
    });

    channels.match.setOnMessage((msg, { peerId }) => {
      this.director?.handleControl(msg, peerId);
      // A starting match consumes everyone's ready state, so returning to
      // the results/lobby screens later starts un-readied.
      if (msg.t === "start" && this.localState?.ready) {
        this.updateLocalState({ ready: false });
      }
    });

    channels.spawn.setOnMessage((msg, { peerId }) => {
      this.handleSpawn(msg, peerId);
    });
    channels.update.setOnMessage((msg) => {
      this.routeOpponentHp(msg);
      this.replicator?.handleUpdate(msg);
    });
    channels.despawn.setOnMessage((msg) => {
      this.replicator?.handleDespawn(msg);
    });
    channels.event.setOnMessage((msg) => {
      this.replicator?.handleEvent(msg);
    });

    room.events.on("peerJoined", (peerId) => {
      // Introduce ourselves to the newcomer directly.
      if (this.localState) {
        void channels.memberState.send(this.localState, { target: peerId });
      }
      this.refreshAdvertisement();
      this.events.emit("membersChanged");
    });

    room.events.on("peerLeft", (peerId) => {
      const wasHost = this.remoteMembers.get(peerId)?.isHost === true;
      this.remoteMembers.delete(peerId);
      this.playerNetIdByPeer.delete(peerId);
      this.lastOpponentHp.delete(peerId);
      this.director?.handlePeerLeft(peerId);
      this.replicator?.removePeerEntities(peerId);
      if (wasHost) this.promoteHostIfNeeded();
      this.refreshAdvertisement();
      this.events.emit("membersChanged");
    });

    room.events.on("peerConnectionFailed", () => {
      this.sawPeerConnectionFailure = true;
    });

    room.events.on("signalingHealthChanged", () => {
      this.events.emit("sessionChanged");
    });

    // Announce ourselves to anyone already listening.
    void channels.memberState.send(this.localState);
  }

  private handleSpawn(msg: SpawnMsg, ownerPeerId: string): void {
    let stubProps: Partial<PlayerStubProps> | undefined;
    if (msg.entityType === "Player") {
      const member = this.remoteMembers.get(ownerPeerId);
      stubProps = {
        customization: member?.customization,
        displayName: member?.identity.name ?? "???",
        nameColor: member?.identity.color
      };
      this.playerNetIdByPeer.set(ownerPeerId, msg.netId);
    }
    this.replicator?.handleSpawn(msg, ownerPeerId, stubProps);
  }

  /** Mirror remote player health ratios into the match slice for the HUD. */
  private routeOpponentHp(msg: UpdateMsg): void {
    if (typeof msg.summary.hp !== "number") return;
    const ownerPeerId = NetIdRegistry.ownerOf(msg.netId);
    if (this.playerNetIdByPeer.get(ownerPeerId) !== msg.netId) return;
    const hp = msg.summary.hp;
    if (this.lastOpponentHp.get(ownerPeerId) === hp) return;
    this.lastOpponentHp.set(ownerPeerId, hp);
    store.dispatch(setOpponentHp({ peerId: ownerPeerId, hp }));
  }

  /** The departed host's role falls to the lowest peer id among remaining
   *  members — deterministic on every client, so exactly one self-promotes. */
  private promoteHostIfNeeded(): void {
    for (const state of this.remoteMembers.values()) {
      if (state.isHost) return;
    }
    if (this.localState?.isHost) return;
    const allIds = [this.selfId, ...this.remoteMembers.keys()].sort();
    if (allIds[0] !== this.selfId) return;
    logMultiplayer("host left — promoting self to host");
    this.updateLocalState({
      isHost: true,
      lobbyConfig: this.lastKnownConfig
    });
    this.refreshAdvertisement();
  }

  /** Keep the public directory advertisement in sync with lobby reality
   *  (member count, settings). Only the host of a public, not-yet-started
   *  lobby advertises. */
  private refreshAdvertisement(): void {
    if (!this.localState?.isHost || this._phase !== "lobby") return;
    const config = this.getLobbyConfig();
    const inMatch = this.director?.isMatchRunning() === true;
    if (!config.isPublic || inMatch) {
      this.transport.discovery.advertise(null);
      return;
    }
    this.transport.discovery.advertise({
      code: this.room?.ref ?? null,
      hostName: this.localState.identity.name,
      hostColor: this.localState.identity.color,
      levelId: config.levelId,
      playerCount: 1 + this.remoteMembers.size,
      maxPlayers: config.maxPlayers,
      targetScore: config.targetScore,
      started: false
    });
  }

  private onMatchLevelReady(): void {
    const level = this.controller?.level;
    if (!level || !this.replicator) return;
    this.replicator.attachLevel(level);
    this.attachPlayerHooks();
    this.attachSpellBindings(level);
  }

  /** Auto-bind match participants to spell variables: the local player as
   *  `player_1`, each opponent's stub as `opponent_N` (as they spawn), so
   *  match scripts can target them without manual binding. */
  private attachSpellBindings(level: NonNullable<GameController["level"]>): void {
    this.detachSpellBindings?.();
    const player = getPlayer(level);
    if (player) level.bindEntityToVariable(player.id);
    for (const entity of level.getEntities().values()) {
      if (entity.type === "PlayerStub") level.bindEntityToVariable(entity.id);
    }
    const onEntityAdded = (entity: { id: string; type: string }) => {
      if (entity.type === "PlayerStub") level.bindEntityToVariable(entity.id);
    };
    level.on(EntityLevelEvents.EntityAdded, onEntityAdded);
    this.detachSpellBindings = () => {
      level.off(EntityLevelEvents.EntityAdded, onEntityAdded);
      this.detachSpellBindings = undefined;
    };
  }

  private onMatchOver(): void {
    this.detachPlayerHooks?.();
    this.detachPlayerHooks = undefined;
    this.detachSpellBindings?.();
    this.replicator?.detachLevel();
    this.playerNetIdByPeer.clear();
    this.lastOpponentHp.clear();
    // Back in the lobby: everyone re-readies for the next match.
    if (this.localState?.ready) this.updateLocalState({ ready: false });
  }

  /** Owner-side combat hooks: discrete player moments (melee swings, the
   *  cast lifecycle, parries, taken hits) replicate as events so stubs can
   *  play the same animations, spell VFX, and status effects. */
  private attachPlayerHooks(): void {
    this.detachPlayerHooks?.();
    const level = this.controller?.level;
    if (!level || !this.replicator) return;
    const player = getPlayer(level);
    if (!player || !isPlayerAPI(player)) return;
    const replicator = this.replicator;
    const events = player.events as unknown as {
      on: (name: string, fn: (arg?: unknown) => void) => void;
      off: (name: string, fn: (arg?: unknown) => void) => void;
    };

    const hooks: [string, (arg?: unknown) => void][] = [
      [
        "SwordSwing",
        () =>
          replicator.sendEntityEvent(player, "swing", {
            damage: MELEE_SWING_DAMAGE,
            reach: MELEE_SWING_REACH
          })
      ],
      [
        "ParryStart",
        () => replicator.sendEntityEvent(player, "parry")
      ],
      [
        "CastStart",
        (arg) => {
          const [castSpeed, element] = (arg ?? []) as [
            number,
            string | undefined
          ];
          replicator.sendEntityEvent(player, "castStart", {
            castSpeed: typeof castSpeed === "number" ? castSpeed : 1,
            element: element ?? null
          });
        }
      ],
      [
        "CastHoldStart",
        () => replicator.sendEntityEvent(player, "castHoldStart")
      ],
      [
        "CastHoldEnd",
        () => replicator.sendEntityEvent(player, "castHoldEnd")
      ],
      ["CastEnd", () => replicator.sendEntityEvent(player, "castEnd")],
      [
        // Taken hits replicate so the opponent's stub of this player shows
        // the same flash/burn status effects the player shows locally.
        EntityLifecycleEvents.Hit,
        (arg) => {
          const details = arg as EntityHitDetails;
          replicator.sendEntityEvent(player, "tookHit", {
            damage: details.damage,
            element: details.elementalDamageType ?? null
          });
        }
      ]
    ];

    for (const [name, fn] of hooks) events.on(name, fn);
    this.detachPlayerHooks = () => {
      for (const [name, fn] of hooks) events.off(name, fn);
    };
  }

  private teardown(): void {
    if (this.joinTimeout) {
      clearTimeout(this.joinTimeout);
      this.joinTimeout = null;
    }
    this.transport.discovery.advertise(null);
    this.transport.discovery.close();
    this.detachPlayerHooks?.();
    this.detachPlayerHooks = undefined;
    this.detachSpellBindings?.();
    this.director?.teardown();
    this.director = undefined;
    this.replicator?.detachLevel();
    this.replicator = undefined;
    this.netIds.clear();
    this.playerNetIdByPeer.clear();
    this.lastOpponentHp.clear();
    this.remoteMembers.clear();
    this.localState = undefined;
    this.channels = undefined;
    this._isCreator = false;
    this.lastKnownConfig = DEFAULT_LOBBY_CONFIG;
    resetMatchSetup();
    this.room?.close();
    this.room = undefined;
  }
}

export const multiplayerSession = new MultiplayerSession();

// Expose for MCP/console debugging alongside the other dev globals.
if (typeof window !== "undefined") {
  (
    window as { __multiplayerSession__?: MultiplayerSession }
  ).__multiplayerSession__ = multiplayerSession;
}
