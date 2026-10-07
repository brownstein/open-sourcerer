import { Vector3 } from "three";

import { GameControllerEvents } from "src/engine/controller/GameControllerAPI";
import { GameController } from "src/engine/controller/GameController";
import { getPlayer } from "src/engine/util/levelUtil";
import {
  selectGamePaused,
  selectInTitleScreen
} from "src/redux/gameState/selectors";
import {
  gotoLevel,
  leaveTitleScreen,
  returnToTitleScreen,
  unpauseGame
} from "src/redux/gameState/slice";
import { selectIsDead } from "src/redux/status/selectors";
import { resetForEditorRetry, setCutsceneLocked } from "src/redux/status/slice";
import { store } from "src/redux/store";

import { getSelfPeerId, logMultiplayer } from "../net/transport";
import { MatchControlMsg, MemberStateMsg } from "../net/protocol";
import { applyMatchSetup } from "./applyMatchSetup";
import {
  MatchOpponent,
  endMatch,
  matchBecameActive,
  matchSetup,
  recordKo,
  resetMatch,
  setCountdownSeconds,
  setMatchPhase,
  setMultiplayerFlow
} from "./matchSlice";
import { selectMatchState } from "./selectors";

const COUNTDOWN_SECONDS = 3;
const RESPAWN_DELAY_MS = 2000;
const DEFAULT_TARGET_SCORE = 3;

export type MatchDirectorDeps = {
  getController: () => GameController | undefined;
  getMemberState: (peerId: string) => MemberStateMsg | undefined;
  sendControl: (msg: MatchControlMsg) => void;
  /** Called when a match fully starts (replicator should attach) and fully
   *  ends (replicator should detach). */
  onMatchLevelReady: () => void;
  onMatchOver: () => void;
  /** A peer finished loading the match level (it is now listening) — the
   *  session re-announces owned entities to it, healing spawns it may have
   *  missed while still loading. */
  onPeerLevelReady?: (peerId: string) => void;
};

/**
 * Runs match rules symmetrically on every peer: synchronized level load with
 * a ready barrier, countdown, KO scoring, respawns, and match end. The host
 * only initiates the start; every other transition is derived identically on
 * each client from the same broadcast messages, so no further authority is
 * needed.
 */
export class MatchDirector {
  private deps: MatchDirectorDeps;
  private expectedPeers: string[] = [];
  private readyPeers = new Set<string>();
  private spawnOrder: string[] = [];
  private spawnPositions = new Map<string, Vector3>();
  /** The exact emitter we hooked for level-ready, so the hook can be
   *  detached even after the session's controller reference changes (React
   *  StrictMode double-mounts the Controller in dev, destroying the first
   *  GameController after we may have hooked it). */
  private levelReadyHooked?: {
    events: GameController["events"];
    handler: () => void;
  };
  private unsubscribeStore?: () => void;
  private wasDead = false;
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private active = false;
  /** The level a deferred (title-screen) match start is waiting on. Only
   *  cleared when the level actually reports ready, so a controller
   *  remount can re-arm the hook. */
  private pendingLevelId: string | null = null;

  constructor(deps: MatchDirectorDeps) {
    this.deps = deps;
  }

  isMatchRunning(): boolean {
    return this.active;
  }

  /** Host-side entry point. */
  startMatch(levelId: string, peerIds: string[], targetScore?: number): void {
    const spawnOrder = [getSelfPeerId(), ...peerIds].sort();
    const msg: MatchControlMsg = {
      t: "start",
      levelId,
      spawnOrder,
      targetScore: targetScore ?? DEFAULT_TARGET_SCORE
    };
    this.deps.sendControl(msg);
    this.handleControl(msg, getSelfPeerId());
  }

  handleControl(msg: MatchControlMsg, fromPeerId: string): void {
    switch (msg.t) {
      case "start":
        this.beginLoading(msg.levelId, msg.spawnOrder, msg.targetScore);
        break;
      case "levelReady":
        this.readyPeers.add(fromPeerId);
        this.deps.onPeerLevelReady?.(fromPeerId);
        this.checkReadyBarrier();
        break;
      case "ko":
        this.handleKo(msg.victimPeerId);
        break;
      case "leaveMatch":
        this.handlePeerGone(fromPeerId);
        break;
      case "toLobby":
        this.returnToLobby();
        break;
    }
  }

  /** Host pulls everyone back to the lobby screen from the results screen.
   *  The session stays connected; the level unloads via the title routing. */
  returnToLobby(): void {
    this.teardown();
    if (!selectInTitleScreen(store.getState())) {
      store.dispatch(returnToTitleScreen());
    }
    store.dispatch(setMultiplayerFlow("lobby"));
  }

  /** A controller mounted after a deferred (title-screen) match start —
   *  (re)arm the level-ready hook on it. Idempotent across StrictMode
   *  remounts: pendingLevelId stays set until the level actually reports
   *  ready, and hookLevelReady always rebinds to the current controller. */
  notifyControllerAttached(): void {
    if (!this.active || this.pendingLevelId === null) return;
    const controller = this.deps.getController();
    if (!controller) return;
    this.hookLevelReady();
    // The transition may already have completed before this attach (the
    // event fired on a controller we weren't hooked to, or raced us).
    if (
      controller.level?.id === this.pendingLevelId &&
      controller.levelTransitionProgress === undefined
    ) {
      this.detachLevelReadyHandler();
      this.pendingLevelId = null;
      this.onLocalLevelReady();
      return;
    }
    logMultiplayer(`resuming deferred match load for ${this.pendingLevelId}`);
  }

  /** The controller is going away (StrictMode remount, return to title).
   *  Drop the hook — a destroyed controller never fires; the next attach
   *  re-arms via pendingLevelId. */
  notifyControllerDetached(): void {
    this.detachLevelReadyHandler();
  }

  handlePeerLeft(peerId: string): void {
    this.handlePeerGone(peerId);
  }

  teardown(): void {
    this.active = false;
    this.pendingLevelId = null;
    this.detachLevelReadyHandler();
    this.unsubscribeStore?.();
    this.unsubscribeStore = undefined;
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
    store.dispatch(setCutsceneLocked(false));
    store.dispatch(resetMatch());
  }

  // ---------------------------------------------------------------------------

  private beginLoading(
    levelId: string,
    spawnOrder: string[],
    targetScore: number
  ): void {
    logMultiplayer(`match starting on ${levelId}`);
    this.active = true;
    this.spawnOrder = spawnOrder;
    this.expectedPeers = spawnOrder.filter((id) => id !== getSelfPeerId());
    this.readyPeers.clear();
    this.spawnPositions.clear();
    this.wasDead = false;

    const opponents: MatchOpponent[] = this.expectedPeers.map((peerId) => {
      const member = this.deps.getMemberState(peerId);
      return {
        peerId,
        name: member?.identity.name ?? "???",
        color: member?.identity.color ?? "#ffffff"
      };
    });
    store.dispatch(
      matchSetup({ levelId, selfPeerId: getSelfPeerId(), opponents, targetScore })
    );
    store.dispatch(resetForEditorRetry());
    store.dispatch(setCutsceneLocked(true));

    // Starting from the title screen: no controller exists yet. Set the
    // level and leave the title; the Controller mounts, attaches to the
    // session, and notifyControllerAttached resumes from there. Dispatching
    // gotoLevel first means the mounting controller loads the match level
    // directly instead of the default level.
    if (selectInTitleScreen(store.getState())) {
      this.pendingLevelId = levelId;
      store.dispatch(gotoLevel({ levelId }));
      store.dispatch(leaveTitleScreen({}));
      return;
    }

    const controller = this.deps.getController();
    if (!controller) return;

    this.hookLevelReady();

    if (controller.level?.id === levelId) {
      // Same level: force a clean reload so both sides start from identical
      // level state.
      controller.restartLevel();
    } else {
      store.dispatch(gotoLevel({ levelId }));
    }
  }

  private hookLevelReady(): void {
    const controller = this.deps.getController();
    if (!controller) return;
    this.detachLevelReadyHandler();
    const handler = () => {
      this.detachLevelReadyHandler();
      this.pendingLevelId = null;
      this.onLocalLevelReady();
    };
    this.levelReadyHooked = { events: controller.events, handler };
    controller.events.on(
      GameControllerEvents.TransitionToLevelComplete,
      handler
    );
  }

  private detachLevelReadyHandler(): void {
    if (!this.levelReadyHooked) return;
    this.levelReadyHooked.events.off(
      GameControllerEvents.TransitionToLevelComplete,
      this.levelReadyHooked.handler
    );
    this.levelReadyHooked = undefined;
  }

  private onLocalLevelReady(): void {
    if (!this.active) return;
    // Combat HUD, editor layout, loadout, and sword (one-time per session).
    applyMatchSetup();
    this.computeSpawnPositions();
    this.teleportToOwnSpawn();
    this.deps.onMatchLevelReady();
    this.watchLocalDeath();
    this.deps.sendControl({ t: "levelReady" });
    this.readyPeers.add(getSelfPeerId());
    this.checkReadyBarrier();
  }

  private computeSpawnPositions(): void {
    const level = this.deps.getController()?.level;
    if (!level) return;
    const player = getPlayer(level);
    const fallbackBase = player?.position.clone() ?? new Vector3();
    const fallbackOffsets = [0, 4, -4, 8, -8, 12, -12, 16];
    this.spawnOrder.forEach((peerId, index) => {
      const marker = level.getEntityForName(`PvpSpawn${index + 1}`);
      if (marker) {
        this.spawnPositions.set(peerId, marker.position.clone());
      } else {
        const pos = fallbackBase.clone();
        pos.x += fallbackOffsets[index % fallbackOffsets.length];
        this.spawnPositions.set(peerId, pos);
      }
    });
  }

  private teleportToOwnSpawn(): void {
    const level = this.deps.getController()?.level;
    if (!level) return;
    const player = getPlayer(level);
    const spawn = this.spawnPositions.get(getSelfPeerId());
    if (player && spawn) player.teleport?.(spawn.clone());
  }

  private checkReadyBarrier(): void {
    if (!this.active) return;
    const state = selectMatchState(store.getState());
    if (state.phase !== "loading") return;
    for (const peerId of this.expectedPeers) {
      if (!this.readyPeers.has(peerId)) return;
    }
    if (!this.readyPeers.has(getSelfPeerId())) return;
    this.beginCountdown();
  }

  private beginCountdown(): void {
    logMultiplayer("all peers ready — countdown");
    store.dispatch(setMatchPhase("countdown"));
    store.dispatch(setCountdownSeconds(COUNTDOWN_SECONDS));
    for (let i = 1; i <= COUNTDOWN_SECONDS; i++) {
      this.addTimer(() => {
        if (!this.active) return;
        const remaining = COUNTDOWN_SECONDS - i;
        store.dispatch(setCountdownSeconds(remaining));
        if (remaining === 0) this.beginActive();
      }, i * 1000);
    }
  }

  private beginActive(): void {
    const state = selectMatchState(store.getState());
    if (state.phase !== "countdown") return;
    store.dispatch(matchBecameActive({ atMs: Date.now() }));
    store.dispatch(setCutsceneLocked(false));
  }

  private watchLocalDeath(): void {
    this.unsubscribeStore?.();
    this.wasDead = selectIsDead(store.getState());
    this.unsubscribeStore = store.subscribe(() => {
      const state = store.getState();
      const matchState = selectMatchState(state);
      // Nobody can pause the mesh — a locally paused sim would silently
      // freeze this player for everyone else.
      if (
        (matchState.phase === "active" || matchState.phase === "countdown") &&
        selectGamePaused(state)
      ) {
        store.dispatch(unpauseGame());
      }
      const dead = selectIsDead(state);
      if (dead && !this.wasDead && matchState.phase === "active") {
        this.wasDead = true;
        this.onLocalDeath();
      }
      if (!dead) this.wasDead = false;
    });
  }

  private onLocalDeath(): void {
    logMultiplayer("local player KO");
    this.deps.sendControl({ t: "ko", victimPeerId: getSelfPeerId() });
    this.handleKo(getSelfPeerId());
  }

  private handleKo(victimPeerId: string): void {
    if (!this.active) return;
    store.dispatch(recordKo({ victimPeerId }));
    if (victimPeerId === getSelfPeerId()) {
      this.addTimer(() => {
        if (!this.active) return;
        const phase = selectMatchState(store.getState()).phase;
        if (phase !== "active") return;
        store.dispatch(resetForEditorRetry());
        this.teleportToOwnSpawn();
      }, RESPAWN_DELAY_MS);
    }
    this.checkForWinner();
  }

  private checkForWinner(): void {
    const state = selectMatchState(store.getState());
    let winner: string | null = null;
    for (const [peerId, score] of Object.entries(state.scores)) {
      if (score >= state.targetScore) winner = peerId;
    }
    if (winner === null) return;
    this.finishMatch(winner);
  }

  private handlePeerGone(peerId: string): void {
    if (!this.active) return;
    this.readyPeers.add(peerId); // Never block the barrier on a gone peer.
    this.expectedPeers = this.expectedPeers.filter((id) => id !== peerId);
    if (this.expectedPeers.length === 0) {
      this.finishMatch(getSelfPeerId());
      return;
    }
    this.checkReadyBarrier();
  }

  private finishMatch(winnerPeerId: string | null): void {
    if (!this.active) return;
    this.active = false;
    logMultiplayer(`match over — winner ${winnerPeerId}`);
    this.unsubscribeStore?.();
    this.unsubscribeStore = undefined;
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
    store.dispatch(setCutsceneLocked(false));
    store.dispatch(resetForEditorRetry());
    store.dispatch(endMatch({ winnerPeerId, atMs: Date.now() }));
    this.deps.onMatchOver();
  }

  private addTimer(fn: () => void, delayMs: number): void {
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      fn();
    }, delayMs);
    this.timers.add(timer);
  }
}
