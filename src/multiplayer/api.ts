import { BaseEntityType } from "src/api/entity";

/** Plain-JSON 2D vector as it travels over the wire. */
export type NetVec2 = { x: number; y: number };

/**
 * Everything a peer's stub needs to mirror an entity for one report.
 *
 * This is deliberately NOT the persistence `getSnapshot()` API: summaries are
 * high-frequency, compact, and carry motion (velocity/acceleration) so remote
 * stubs can dead-reckon between reports. Every value must be JSON-safe.
 *
 * Motion model: stubs render `pos + vel*dt + 0.5*acc*dt^2` between reports,
 * so `vel`/`acc` should describe the entity's actual expected motion. For
 * ballistic projectiles (constant acceleration) this makes prediction exact
 * between course changes.
 */
export type EntityNetSummary = {
  pos: NetVec2;
  vel?: NetVec2;
  acc?: NetVec2;
  /** Sprite facing: 1 = right, -1 = left. */
  facing?: 1 | -1;
  /** Animation tag the stub should play. */
  anim?: string;
  /** Per-type extras (damage, health ratio, flags...). JSON-safe only. */
  [key: string]: unknown;
};

/**
 * Opt-in contract for entities supported in multiplayer. Implementing this
 * method is what marks an entity as replicable: the EntityReplicator streams
 * its summaries to peers, where a registered stub class (stubs/stubRegistry)
 * mirrors it. Real entity classes are never synced with themselves over the
 * wire — the stub is always a separate, presentation-focused class.
 */
export interface NetworkedEntityAPI {
  getNetSummary(): EntityNetSummary;
}

export type NetworkedEntity = BaseEntityType & NetworkedEntityAPI;

export function isNetworkedEntity(
  entity: unknown
): entity is NetworkedEntity {
  return (
    typeof (entity as NetworkedEntityAPI | null | undefined)?.getNetSummary ===
    "function"
  );
}

/** Flag interface for stub entities so they are never re-replicated. */
export interface MultiplayerStubAPI {
  readonly isMultiplayerStub: true;
  readonly netId: string;
  readonly ownerPeerId: string;
  applyNetSummary(summary: EntityNetSummary): void;
  handleNetEvent(kind: string, data: unknown): void;
  handleDespawn(reason: string, finalSummary?: EntityNetSummary): void;
}

export function isMultiplayerStub(
  entity: unknown
): entity is BaseEntityType & MultiplayerStubAPI {
  return !!(entity as MultiplayerStubAPI | null | undefined)?.isMultiplayerStub;
}

function isFiniteVec(vec: NetVec2 | undefined): boolean {
  if (vec === undefined) return true;
  return Number.isFinite(vec.x) && Number.isFinite(vec.y);
}

/**
 * A summary's motion fields must be finite before entering the local
 * simulation: a single NaN from a buggy (or hostile) peer would otherwise
 * propagate through dead reckoning into hit impulses and corrupt the local
 * player's physics body. Non-finite summaries are dropped whole.
 */
export function isSaneSummary(summary: EntityNetSummary): boolean {
  return (
    summary.pos !== undefined &&
    Number.isFinite(summary.pos.x) &&
    Number.isFinite(summary.pos.y) &&
    isFiniteVec(summary.vel as NetVec2 | undefined) &&
    isFiniteVec(summary.acc as NetVec2 | undefined)
  );
}
