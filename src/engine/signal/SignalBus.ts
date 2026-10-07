import { Vector2 } from "three";
import { clamp } from "three/src/math/MathUtils.js";

import {
  NearestPoint,
  Signal,
  SignalBusAPI,
  SignalBusEventTypes,
  SignalConnectionAPI,
  SignalPropagation
} from "src/api/signal";
import { createTypedEventEmitter } from "src/api/util";

/**
 * An in-flight signal expanding outward from the tap point where it was
 * injected. `spread` is how far (in world units along the bus) the fronts have
 * travelled; a connection receives the signal once a front reaches its tap.
 */
type ActivePropagation = SignalPropagation & {
  signal: Signal;
  delivered: Set<SignalConnectionAPI>;
};

export type SignalBusOptions = {
  polyline?: Vector2[];
  closed?: boolean;
  /**
   * Speed (world units / second) at which signals travel along the bus. When
   * undefined (or non-positive / Infinity) signals are delivered instantly.
   */
  propagationSpeed?: number;
  origin?: Vector2;
};

function nearestPointOnSegment(p: Vector2, a: Vector2, b: Vector2): Vector2 {
  const ab = new Vector2().subVectors(b, a);
  const lengthSq = ab.lengthSq();
  if (lengthSq === 0) return a.clone();
  const t = clamp(new Vector2().subVectors(p, a).dot(ab) / lengthSq, 0, 1);
  return ab.multiplyScalar(t).add(a);
}

/**
 * A channel along which connections relay signals to one another. With a
 * polyline the bus has world-space geometry (origin + local points) and a
 * configurable propagation speed; without one it is a purely logical link.
 * Instant buses deliver synchronously to every connection on transmit; timed
 * buses spread a {@link SignalPropagation} outward along the arc-length,
 * reaching each connection when a front passes its tap point.
 */
export class SignalBus implements SignalBusAPI {
  public polyline?: Vector2[];
  public closed = false;
  public propagationSpeed?: number;
  public lastSignal?: Signal;
  public readonly events = createTypedEventEmitter<SignalBusEventTypes>();

  private origin = new Vector2();
  private connections = new Map<SignalConnectionAPI, number>();
  private propagations: ActivePropagation[] = [];

  constructor(options?: SignalBusOptions) {
    this.propagationSpeed = options?.propagationSpeed;
    if (options?.origin) this.origin.copy(options.origin);
    if (options?.polyline) this.setPolyline(options.polyline, options.closed);
  }

  get hasGeometry(): boolean {
    return !!this.polyline && this.polyline.length > 0;
  }

  setOrigin(origin: Vector2) {
    this.origin.copy(origin);
    return this;
  }

  setPolyline(polyline: Vector2[], closed = false) {
    this.polyline = polyline.map((p) => p.clone());
    this.closed = closed;
    if (closed && this.polyline.length > 1) {
      const first = this.polyline[0];
      const last = this.polyline[this.polyline.length - 1];
      if (!first.equals(last)) this.polyline.push(first.clone());
    }
    return this;
  }

  /** The polyline in world space (origin + local points). */
  getWorldPolyline(): Vector2[] {
    if (!this.polyline) return [];
    const { x, y } = this.origin;
    return this.polyline.map((p) => new Vector2(p.x + x, p.y + y));
  }

  getTotalLength(): number {
    const world = this.getWorldPolyline();
    let length = 0;
    for (let i = 0; i < world.length - 1; i++) {
      length += world[i].distanceTo(world[i + 1]);
    }
    return length;
  }

  /**
   * Nearest point on the bus to a world-space position, the straight-line
   * distance to it, and how far along the bus that point sits.
   */
  getNearestPoint(position: Vector2): NearestPoint {
    const world = this.getWorldPolyline();
    if (world.length === 0) {
      return { point: new Vector2(), distance: Infinity, distanceAlong: 0 };
    }
    if (world.length === 1) {
      return {
        point: world[0].clone(),
        distance: world[0].distanceTo(position),
        distanceAlong: 0
      };
    }

    const bestPoint = new Vector2();
    let bestDistance = Infinity;
    let bestDistanceAlong = 0;
    let accumulated = 0;

    for (let i = 0; i < world.length - 1; i++) {
      const start = world[i];
      const end = world[i + 1];
      const near = nearestPointOnSegment(position, start, end);
      const distance = near.distanceTo(position);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestPoint.copy(near);
        bestDistanceAlong = accumulated + start.distanceTo(near);
      }
      accumulated += start.distanceTo(end);
    }

    return {
      point: bestPoint,
      distance: bestDistance,
      distanceAlong: bestDistanceAlong
    };
  }

  /**
   * The world-space point sitting `distance` units along the bus from its
   * start. Distances outside the bus are clamped to its endpoints.
   */
  getPointAlongLine(distance: number): Vector2 {
    const world = this.getWorldPolyline();
    if (world.length === 0) return new Vector2();
    if (world.length === 1) return world[0].clone();

    const target = clamp(distance, 0, this.getTotalLength());
    let accumulated = 0;
    for (let i = 0; i < world.length - 1; i++) {
      const start = world[i];
      const end = world[i + 1];
      const segmentLength = start.distanceTo(end);
      if (segmentLength === 0) continue;
      if (accumulated + segmentLength >= target) {
        const t = (target - accumulated) / segmentLength;
        return new Vector2().lerpVectors(start, end, t);
      }
      accumulated += segmentLength;
    }
    return world[world.length - 1].clone();
  }

  /** Idempotent — re-adding an existing connection keeps its tap distance. */
  addConnection(connection: SignalConnectionAPI, distanceAlong = 0) {
    if (this.connections.has(connection)) return;
    this.connections.set(connection, distanceAlong);
  }

  removeConnection(connection: SignalConnectionAPI) {
    this.connections.delete(connection);
  }

  hasConnection(connection: SignalConnectionAPI): boolean {
    return this.connections.has(connection);
  }

  getConnections(): SignalConnectionAPI[] {
    return [...this.connections.keys()];
  }

  /**
   * Inject a signal at `source`'s tap point. With no propagation speed it is
   * delivered synchronously to every other connection; with a speed set it
   * spreads outward along the bus, reaching each connection when a front
   * passes its tap point. Emits `transmitted` either way.
   */
  transmit(signal: Signal, source?: SignalConnectionAPI) {
    this.lastSignal = signal;
    const originDistance = source ? this.connections.get(source) ?? 0 : 0;
    this.events.emit("transmitted", { signal, originDistance });

    const speed = this.propagationSpeed;
    const propagating = !!speed && speed > 0 && speed !== Infinity;

    if (!propagating) {
      for (const connection of this.connections.keys()) {
        if (connection === source) continue;
        connection.receive(signal, this);
      }
      return;
    }

    this.propagations.push({
      signal,
      originDistance,
      spread: 0,
      delivered: new Set(source ? [source] : [])
    });
  }

  step(deltaMs: number) {
    if (this.propagations.length === 0) return;
    const speed = this.propagationSpeed ?? 0;
    const total = this.getTotalLength();
    for (const propagation of this.propagations) {
      propagation.spread += speed * (deltaMs / 1000);
      for (const [connection, distanceAlong] of this.connections) {
        if (propagation.delivered.has(connection)) continue;
        const reach = Math.abs(distanceAlong - propagation.originDistance);
        if (reach <= propagation.spread) {
          propagation.delivered.add(connection);
          connection.receive(propagation.signal, this);
        }
      }
    }
    this.propagations = this.propagations.filter((propagation) => {
      const maxReach = Math.max(
        propagation.originDistance,
        total - propagation.originDistance
      );
      return propagation.spread < maxReach;
    });
  }

  getActivePropagations(): SignalPropagation[] {
    return this.propagations.map(({ originDistance, spread }) => ({
      originDistance,
      spread
    }));
  }

  destroy() {
    this.propagations = [];
    for (const connection of [...this.connections.keys()]) {
      connection.disconnectFrom(this);
    }
    this.connections.clear();
  }
}
