import shortid from "shortid";

import { BaseEntityType, EntityLevelAPI } from "src/api/entity";
import { IVector2 } from "src/engine/util/vecTypes";

import { JSRunnerAPI } from "../core/api";

// Standardized tracking identifier.
export type TrackingIdentifier = {
  entityId?: string;
  persistentHandleId?: string;
  caster?: boolean;
};

// Message from game to worker with updates about an entity.
export type AvailableTrackingInfoMessage = {
  id: TrackingIdentifier;
  // This is only sent when objects are initially bound to a variable.
  requestedVariableBinding?: string;
  type?: string;
  isEnemy?: boolean;
  position: IVector2;
  extra?: Record<string, unknown>;
};

// Message from game to worker indicating an entity was destroyed.
export type DestroyedTrackingInfoMessage = {
  id: TrackingIdentifier;
  destroyed: true;
};

// Messages from the game to the worker with entity updates.
export type TrackingInfoMessage =
  | AvailableTrackingInfoMessage
  | DestroyedTrackingInfoMessage;

// If a message indicates an entity has been destroyed.
export function isDestroyedTrackingInfoMessage(
  arg: TrackingInfoMessage
): arg is DestroyedTrackingInfoMessage {
  return !!(arg as DestroyedTrackingInfoMessage).destroyed;
}

// API for tracking handles produced by the runtime API.
export type TrackedEntityRuntimeAPI<T extends BaseEntityType = BaseEntityType> =
  {
    // Identifier used in tracking.
    trackingId: TrackingIdentifier;
    // Current entity being tracked.
    currentEntity?: T;
    // Label for variables assigned to entity.
    boundToVariableName?: string;
    // Set this flag to avoid sending the entity over
    // the wire.
    skipSync?: boolean;
  };

// API for tracked entities in the worker thread.
export type TrackedEntityPseudoAPI = {
  runner?: JSRunnerAPI;
  trackingId: TrackingIdentifier;
  type?: string;
  isEnemy?: boolean;
  position: IVector2;
  destroyed?: boolean;
  extra?: Record<string, unknown>;
  postConstruct?: (runner: JSRunnerAPI) => void;
};

export type ReInstantiator = (level: EntityLevelAPI) => BaseEntityType | null;

// API used by the game for synching entities.
export type SpellEntitySyncRuntimeAPI = {
  get<T extends BaseEntityType = BaseEntityType>(
    id: string | TrackingIdentifier
  ): TrackedEntityRuntimeAPI<T> | null;
  // Track an entity with a specified identifier and optional variable binding.
  track: <T extends BaseEntityType>(
    entity: T,
    bindToVariable?: string | null,
    skipSync?: boolean,
    explicitHandleId?: string
  ) => TrackedEntityRuntimeAPI<T>;
  // Remove tracking for a specified entity.
  untrack: (id: TrackingIdentifier) => void;
  // Request from the worker to track multiple entities.
  requestTrackMultiple: (ids: TrackingIdentifier[]) => void;
  // Force an immediate synchronization, with an optional target entity.
  // This sends a message to the worker thread immediately, so we're guaranteed to
  // process it before other other callbacks return so that all we need to pass back
  // over the wire for function implementations is the TrackingIdentifier.
  sync: (id?: TrackingIdentifier | TrackingIdentifier[]) => void;
  // Re-instantiators are used to recreate entities created by spells when moving to a new level.
  setReInstantiator: (
    id: TrackingIdentifier,
    reInstantor: ReInstantiator | null
  ) => void;
  // Call a method on a pseudo entity.
  doPseudoMethod: (
    id: TrackingIdentifier,
    methodName: string,
    args: unknown[]
  ) => void;
};

// API used by the psuedo runtime for synched entities.
export type SpellEntitySyncPseudoAPI = {
  requestTracking: (
    identifier: TrackingIdentifier | TrackingIdentifier[]
  ) => Promise<TrackedEntityPseudoAPI[]>;
  getTrackedWithoutRPC: (
    identifier: TrackingIdentifier
  ) => TrackedEntityPseudoAPI | null;
  setTracked: (
    identifier: TrackingIdentifier,
    instance: TrackedEntityPseudoAPI
  ) => void;
  // setTracked: (identifier: TrackingIdentifier, pseudoEntity: TrackedEntityPseudoAPI) => void;
  handleUpdates: (messages: TrackingInfoMessage[]) => void;
  doMethodOnTracked: (
    idenitifer: TrackingIdentifier,
    methodName: string,
    args: unknown[],
    translateHandlesInArgs?: Record<string, string>
  ) => Promise<unknown>;
};

export const kSpellEntitySync = "sync";

// IOC helper.
export function spellEntitySyncFromRunner(runner: JSRunnerAPI | undefined) {
  return runner?.ctx.ioc.mapping.get(kSpellEntitySync) as
    | SpellEntitySyncPseudoAPI
    | undefined;
}
