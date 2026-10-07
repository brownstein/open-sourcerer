import { Vector2 } from "three";

import {
  BaseEntityType,
  EntityBehavior,
  EntityLevelEvents,
  LevelAPI
} from "src/api/entity";
import {
  Signal,
  SignalConnectionAPI,
  SignalConnectionEventTypes,
  SignalConnectionEvents
} from "src/api/signal";
import { createTypedEventEmitter } from "src/api/util";
import { SignalBus } from "src/engine/signal/SignalBus";
import {
  SignalConnectionShape,
  SignalConnectionShapePoint,
  SignalNetwork
} from "src/engine/signal/SignalNetwork";
import { vector3To2 } from "src/engine/util/vecTypes";

/**
 * A binding between a {@link SignalConnectionBehavior} and one specific bus.
 * The same connection can hold many of these so an entity can sit at a
 * junction and tap several buses at once — each link records the connection's
 * point and distance-along on that particular bus.
 */
export type SignalConnectionLink = {
  readonly bus: SignalBus;
  readonly connectionPoint: Vector2;
  readonly distanceAlongBus: number;
};

export type SignalConnectionParticipant = BaseEntityType<{
  signal?: SignalConnectionBehavior;
}>;

export type SignalConnectionBehaviorOptions = {
  /**
   * When set, the connection scans for geometric buses within `snapDistance`
   * on level preload and binds to each. On by default — opt out to make the
   * connection a purely logical participant.
   */
  autoProximity?: boolean;
  snapDistance?: number;
};

/**
 * The entity's gateway to the signal network: tap buses, transmit signals
 * onto every tapped bus, and receive signals that other connected entities
 * transmit.
 */
export class SignalConnectionBehavior
  implements EntityBehavior, SignalConnectionAPI
{
  static type = "SignalConnection";
  public type = SignalConnectionBehavior.type;

  public snapDistance = 0.5;
  public autoProximity = true;
  public lastSignal?: Signal;
  public readonly links = new Map<SignalBus, SignalConnectionLink>();
  public readonly events =
    createTypedEventEmitter<SignalConnectionEventTypes>();

  private entity?: BaseEntityType;
  private network?: SignalNetwork;
  private shape?: SignalConnectionShape;

  constructor(options?: SignalConnectionBehaviorOptions) {
    this.autoProximity = options?.autoProximity ?? this.autoProximity;
    this.snapDistance = options?.snapDistance ?? this.snapDistance;
    this.connectToNearbyBuses = this.connectToNearbyBuses.bind(this);
  }

  init(entity: BaseEntityType) {
    this.entity = entity;
    return this;
  }

  setSnapDistance(distance: number) {
    this.snapDistance = distance;
    return this;
  }

  setShape(shape: SignalConnectionShape) {
    this.shape = shape;
    return this;
  }

  attachToLevel(level: LevelAPI) {
    this.network = level.signalNetwork;
    if (!this.autoProximity) return;
    if (level.fullyPreLoaded) {
      this.connectToNearbyBuses();
    } else {
      level.on(EntityLevelEvents.PreloadComplete, this.connectToNearbyBuses);
    }
  }

  detachFromLevel(level: LevelAPI) {
    level.off(EntityLevelEvents.PreloadComplete, this.connectToNearbyBuses);
    this.disconnect();
    this.network = undefined;
  }

  /**
   * Scans the network and binds to every geometric bus whose nearest point is
   * within `snapDistance`. Already-bound buses are skipped, so this is also
   * safe to call again to pick up buses added after the initial preload.
   */
  connectToNearbyBuses(): SignalBus[] {
    if (!this.entity || !this.network) return [];
    const position = vector3To2(this.entity.position);
    const newlyBound: SignalBus[] = [];
    const proximityBusses = this.shape
      ? this.network.findProximityBussesByShape(position, this.shape)
      : this.network.findProximityBuses(position, this.snapDistance);
    for (const bus of proximityBusses) {
      if (this.links.has(bus)) continue;
      const nearest = bus.getNearestPoint(position);
      this.connectTo(bus, nearest.point, nearest.distanceAlong);
      newlyBound.push(bus);
    }
    return newlyBound;
  }

  /**
   * Binds to a specific bus. Idempotent — calling again with the same bus
   * does nothing (so this won't clobber an existing link's tap data).
   */
  connectTo(bus: SignalBus, point?: Vector2, distanceAlong = 0) {
    if (this.links.has(bus)) return this;
    const resolvedPoint =
      point?.clone() ??
      (this.entity
        ? bus.getNearestPoint(vector3To2(this.entity.position)).point
        : new Vector2());
    this.links.set(bus, {
      bus,
      connectionPoint: resolvedPoint,
      distanceAlongBus: distanceAlong
    });
    bus.addConnection(this, distanceAlong);
    this.events.emit(SignalConnectionEvents.Connected, bus);
    return this;
  }

  /** Drops the link to a specific bus (no-op if not connected to it). */
  disconnectFrom(bus: SignalBus) {
    if (!this.links.delete(bus)) return this;
    bus.removeConnection(this);
    this.events.emit(SignalConnectionEvents.Disconnected, bus);
    return this;
  }

  /** Drops every bus link. */
  disconnect() {
    for (const bus of [...this.links.keys()]) {
      this.disconnectFrom(bus);
    }
    return this;
  }

  /**
   * Convenience: a logical link between this entity and another signal
   * participant, with no geometric bus involved.
   */
  linkTo(other: SignalConnectionParticipant): SignalBus | undefined {
    const otherConnection = other.behaviors.signal;
    if (!otherConnection || !this.network) return undefined;
    return this.network.link(this, otherConnection);
  }

  get buses(): readonly SignalBus[] {
    return [...this.links.keys()];
  }

  get connected(): boolean {
    return this.links.size > 0;
  }

  /** Tap distance on a specific bus (0 if not connected to it). */
  distanceAlongBusFor(bus: SignalBus): number {
    return this.links.get(bus)?.distanceAlongBus ?? 0;
  }

  connectionPointFor(bus: SignalBus): Vector2 | undefined {
    return this.links.get(bus)?.connectionPoint;
  }

  /**
   * Pushes the signal onto every bus this connection taps. Each bus
   * broadcasts independently, so an entity sitting at a junction routes the
   * signal across every bus it's bound to at once.
   */
  transmit(signal: Signal): boolean {
    if (this.links.size === 0) return false;
    const enriched = {
      ...signal,
      sourceId: signal.sourceId ?? this.entity?.id
    };
    for (const link of this.links.values()) {
      link.bus.transmit(enriched, this);
    }
    return true;
  }

  /** Called by a connected bus when another entity transmits a signal. */
  receive(signal: Signal, fromBus?: SignalBus) {
    this.lastSignal = signal;
    this.events.emit(SignalConnectionEvents.SignalReceived, {
      signal,
      fromBus
    });
  }

  destroy() {
    this.disconnect();
  }
}
