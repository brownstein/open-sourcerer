import { Vector2 } from "three";

import {
  BaseEntityType,
  EntityLevelEvents
} from "src/api/entity";
import { Level } from "src/engine/level/Level";

import {
  EntityNetSummary,
  NetworkedEntity,
  isMultiplayerStub,
  isNetworkedEntity,
  isSaneSummary
} from "../api";
import { NetIdRegistry } from "../NetIdRegistry";
import { logMultiplayer } from "../net/GameRoom";
import {
  DespawnMsg,
  EntityEventMsg,
  SpawnMsg,
  UpdateMsg
} from "../net/protocol";
import { StubEntityProps } from "../stubs/StubEntity";
import { stubClassByEntityType } from "../stubs/stubRegistry";
import { DeadReckoner } from "./DeadReckoner";

/** Reality-vs-peer-prediction divergence that triggers an immediate report.
 *  World units; a tile is 0.5. */
const SEND_EPSILON = 0.08;

/** Reports go out at least this often even when prediction holds. */
const HEARTBEAT_MS = 250;

/** Floor between reports so a wildly diverging entity can't flood. */
const MIN_SEND_INTERVAL_MS = 33;

export type ReplicatorChannels = {
  sendSpawn: (msg: SpawnMsg, targetPeerId?: string) => void;
  sendUpdate: (msg: UpdateMsg) => void;
  sendDespawn: (msg: DespawnMsg) => void;
  sendEvent: (msg: EntityEventMsg) => void;
};

type OwnedTracking = {
  entity: NetworkedEntity;
  netId: string;
  entityType: string;
  lastSent: EntityNetSummary;
  lastSentAt: number;
};

/**
 * Owner-authoritative summary/stub replication.
 *
 * Send side: any locally-owned entity implementing `getNetSummary()` gets a
 * netId and a spawn broadcast when it enters the level; while alive, its
 * summary is re-sent on a heartbeat OR the moment reality deviates from what
 * peers' dead reckoning would be predicting from the last report (threshold
 * sends — steady flight costs a few packets a second, a spell yanking the
 * entity around corrects within a frame). Removal broadcasts a despawn.
 *
 * Receive side: spawn messages construct the registered stub class for the
 * entity type (never the real class), updates/events/despawns route to it by
 * netId, and a leaving peer's stubs are cleaned up.
 */
export class EntityReplicator {
  private readonly registry: NetIdRegistry;
  private readonly channels: ReplicatorChannels;
  private level?: Level;
  private readonly owned = new Map<string, OwnedTracking>();
  private readonly predictScratch = new Vector2();
  /** Updates arriving before their spawn finished preloading. */
  private readonly pendingSummaries = new Map<string, EntityNetSummary>();
  private readonly spawningNetIds = new Set<string>();
  /** Spawns arriving before our level is attached (the peer finished
   *  loading first). Flushed on attachLevel — without this, the faster
   *  loader's entities are silently invisible to the slower loader. */
  private readonly pendingSpawns = new Map<
    string,
    {
      msg: SpawnMsg;
      ownerPeerId: string;
      stubProps?: Partial<StubEntityProps>;
    }
  >();

  constructor(registry: NetIdRegistry, channels: ReplicatorChannels) {
    this.registry = registry;
    this.channels = channels;
    this.onEntityAdded = this.onEntityAdded.bind(this);
    this.onEntityRemoved = this.onEntityRemoved.bind(this);
    this.onLevelStep = this.onLevelStep.bind(this);
  }

  attachLevel(level: Level): void {
    this.detachLevel();
    this.level = level;
    level.on(EntityLevelEvents.EntityAdded, this.onEntityAdded);
    level.on(EntityLevelEvents.EntityRemoved, this.onEntityRemoved);
    level.on(EntityLevelEvents.Step, this.onLevelStep);
    // Entities that were added during level load (the Player) predate this
    // listener — sweep what's already there.
    for (const entity of level.getEntities().values()) {
      this.onEntityAdded(entity);
    }
    // Spawns that arrived while we were still loading.
    const pending = [...this.pendingSpawns.values()];
    this.pendingSpawns.clear();
    for (const entry of pending) {
      this.handleSpawn(entry.msg, entry.ownerPeerId, entry.stubProps);
    }
  }

  detachLevel(): void {
    const level = this.level;
    if (!level) return;
    level.off(EntityLevelEvents.EntityAdded, this.onEntityAdded);
    level.off(EntityLevelEvents.EntityRemoved, this.onEntityRemoved);
    level.off(EntityLevelEvents.Step, this.onLevelStep);
    // Remove any live stubs from the level.
    for (const [netId, stub] of this.registry.getStubEntries()) {
      this.registry.releaseStub(netId);
      level.removeEntity(stub.id);
      stub.destroy?.();
    }
    this.owned.clear();
    this.pendingSummaries.clear();
    this.spawningNetIds.clear();
    this.pendingSpawns.clear();
    this.level = undefined;
  }

  /** Broadcast a discrete event for a locally-owned entity. */
  sendEntityEvent(entity: BaseEntityType, kind: string, data?: unknown): void {
    const netId = this.registry.getOwnedNetId(entity.id);
    if (netId === undefined) return;
    this.channels.sendEvent({ netId, kind, data });
  }

  /** Re-announce all owned entities to a specific (late) peer. */
  announceTo(peerId: string): void {
    for (const tracking of this.owned.values()) {
      this.channels.sendSpawn(
        {
          netId: tracking.netId,
          entityType: tracking.entityType,
          summary: tracking.lastSent
        },
        peerId
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Send side
  // ---------------------------------------------------------------------------

  private onEntityAdded(entity: BaseEntityType): void {
    if (isMultiplayerStub(entity)) return;
    if (!isNetworkedEntity(entity)) return;
    if (this.owned.has(entity.id)) return;
    const summary = entity.getNetSummary();
    // A locally-glitched entity (NaN physics) must not poison peers.
    if (!isSaneSummary(summary)) {
      logMultiplayer(
        `not replicating ${entity.type}: non-finite spawn summary`
      );
      return;
    }
    const netId = this.registry.allocate(entity);
    const tracking: OwnedTracking = {
      entity,
      netId,
      entityType: entity.type,
      lastSent: summary,
      lastSentAt: performance.now()
    };
    this.owned.set(entity.id, tracking);
    logMultiplayer(`replicating ${entity.type} as ${netId}`);
    this.channels.sendSpawn({ netId, entityType: entity.type, summary });
  }

  private onEntityRemoved(entity: BaseEntityType): void {
    if (isMultiplayerStub(entity)) return;
    const tracking = this.owned.get(entity.id);
    if (!tracking) return;
    this.owned.delete(entity.id);
    this.registry.releaseOwned(entity.id);
    this.channels.sendDespawn({
      netId: tracking.netId,
      reason: "removed",
      finalSummary: {
        pos: { x: entity.position.x, y: entity.position.y }
      }
    });
  }

  private onLevelStep(_deltaMs: number): void {
    const now = performance.now();
    for (const tracking of this.owned.values()) {
      const sinceSend = now - tracking.lastSentAt;
      if (sinceSend < MIN_SEND_INTERVAL_MS) continue;
      const summary = tracking.entity.getNetSummary();
      if (!isSaneSummary(summary)) continue;
      let shouldSend = sinceSend >= HEARTBEAT_MS;
      if (!shouldSend) {
        // What are peers predicting from our last report right now?
        DeadReckoner.predict(tracking.lastSent, sinceSend, this.predictScratch);
        const dx = summary.pos.x - this.predictScratch.x;
        const dy = summary.pos.y - this.predictScratch.y;
        shouldSend = dx * dx + dy * dy > SEND_EPSILON * SEND_EPSILON;
      }
      if (!shouldSend) {
        shouldSend = this.nonMotionFieldsChanged(tracking.lastSent, summary);
      }
      if (!shouldSend) continue;
      tracking.lastSent = summary;
      tracking.lastSentAt = now;
      this.channels.sendUpdate({ netId: tracking.netId, summary });
    }
  }

  private nonMotionFieldsChanged(
    a: EntityNetSummary,
    b: EntityNetSummary
  ): boolean {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const key of keys) {
      if (key === "pos" || key === "vel" || key === "acc") continue;
      if (a[key] !== b[key]) return true;
    }
    return false;
  }

  // ---------------------------------------------------------------------------
  // Receive side
  // ---------------------------------------------------------------------------

  handleSpawn(msg: SpawnMsg, ownerPeerId: string, stubProps?: Partial<StubEntityProps>): void {
    const level = this.level;
    if (!level) {
      // Our level is still loading; hold the spawn until attachLevel.
      this.pendingSpawns.set(msg.netId, { msg, ownerPeerId, stubProps });
      return;
    }
    if (this.registry.getStub(msg.netId) || this.spawningNetIds.has(msg.netId)) {
      return;
    }
    const StubClass = stubClassByEntityType[msg.entityType];
    if (!StubClass) {
      logMultiplayer(`no stub registered for entity type ${msg.entityType}`);
      return;
    }
    if (!isSaneSummary(msg.summary)) {
      logMultiplayer(`rejected non-finite spawn summary for ${msg.netId}`);
      return;
    }
    this.spawningNetIds.add(msg.netId);
    const props: StubEntityProps = {
      position: { x: msg.summary.pos.x, y: msg.summary.pos.y, z: 0 },
      netId: msg.netId,
      ownerPeerId,
      spawnSummary: msg.summary,
      ...stubProps
    };
    void level
      .constructEntityAfterPreload(StubClass.type, props)
      .then((stub) => {
        this.spawningNetIds.delete(msg.netId);
        // The level may have been torn down or the peer gone mid-preload.
        if (!stub || this.level !== level) {
          stub?.destroy?.();
          return;
        }
        level.addEntity(stub);
        this.registry.registerStub(msg.netId, stub);
        const pending = this.pendingSummaries.get(msg.netId);
        this.pendingSummaries.delete(msg.netId);
        if (pending && isMultiplayerStub(stub)) {
          stub.applyNetSummary(pending);
        }
        logMultiplayer(`spawned ${StubClass.type} for ${msg.netId}`);
      });
  }

  handleUpdate(msg: UpdateMsg): void {
    const stub = this.registry.getStub(msg.netId);
    if (!stub) {
      if (this.spawningNetIds.has(msg.netId)) {
        this.pendingSummaries.set(msg.netId, {
          ...this.pendingSummaries.get(msg.netId),
          ...msg.summary
        });
      }
      return;
    }
    if (isMultiplayerStub(stub)) stub.applyNetSummary(msg.summary);
  }

  handleEvent(msg: EntityEventMsg): void {
    const stub = this.registry.getStub(msg.netId);
    if (stub && isMultiplayerStub(stub)) {
      stub.handleNetEvent(msg.kind, msg.data);
    }
  }

  handleDespawn(msg: DespawnMsg): void {
    this.pendingSummaries.delete(msg.netId);
    this.pendingSpawns.delete(msg.netId);
    this.spawningNetIds.delete(msg.netId);
    const stub = this.registry.releaseStub(msg.netId);
    if (stub && isMultiplayerStub(stub)) {
      stub.handleDespawn(msg.reason, msg.finalSummary);
    }
  }

  removePeerEntities(peerId: string): void {
    for (const netId of [...this.pendingSpawns.keys()]) {
      if (NetIdRegistry.ownerOf(netId) === peerId) {
        this.pendingSpawns.delete(netId);
      }
    }
    for (const [netId, stub] of this.registry.getStubEntries()) {
      if (NetIdRegistry.ownerOf(netId) !== peerId) continue;
      this.registry.releaseStub(netId);
      if (isMultiplayerStub(stub)) {
        stub.handleDespawn("removed");
      } else {
        this.level?.removeEntity(stub.id);
        stub.destroy?.();
      }
    }
  }
}
