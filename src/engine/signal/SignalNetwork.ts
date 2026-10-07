import { Vector2 } from "three";
import { clamp } from "three/src/math/MathUtils.js";

import { Signal, SignalBusAPI, SignalConnectionAPI } from "src/api/signal";

import { SignalBus } from "./SignalBus";

type Segment = [Vector2, Vector2];

/** Shortest distance from point `p` to segment `a`–`b`. */
function pointSegmentDistance(p: Vector2, a: Vector2, b: Vector2): number {
  const ab = new Vector2().subVectors(b, a);
  const lengthSq = ab.lengthSq();
  if (lengthSq === 0) return p.distanceTo(a);
  const t = clamp(new Vector2().subVectors(p, a).dot(ab) / lengthSq, 0, 1);
  return p.distanceTo(ab.multiplyScalar(t).add(a));
}

function cross(o: Vector2, a: Vector2, b: Vector2): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

/** Whether segments `a1`–`a2` and `b1`–`b2` properly cross. */
function segmentsIntersect(
  a1: Vector2,
  a2: Vector2,
  b1: Vector2,
  b2: Vector2
): boolean {
  const d1 = cross(b1, b2, a1);
  const d2 = cross(b1, b2, a2);
  const d3 = cross(a1, a2, b1);
  const d4 = cross(a1, a2, b2);
  return (
    ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
    ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
  );
}

/** Shortest distance between two segments (0 when they cross). */
function segmentSegmentDistance(
  a1: Vector2,
  a2: Vector2,
  b1: Vector2,
  b2: Vector2
): number {
  if (segmentsIntersect(a1, a2, b1, b2)) return 0;
  return Math.min(
    pointSegmentDistance(a1, b1, b2),
    pointSegmentDistance(a2, b1, b2),
    pointSegmentDistance(b1, a1, a2),
    pointSegmentDistance(b2, a1, a2)
  );
}

/** Ray-cast point-in-polygon test for the closed ring `verts`. */
function pointInPolygon(p: Vector2, verts: Vector2[]): boolean {
  let inside = false;
  for (let i = 0, j = verts.length - 1; i < verts.length; j = i++) {
    const vi = verts[i];
    const vj = verts[j];
    if (
      vi.y > p.y !== vj.y > p.y &&
      p.x < ((vj.x - vi.x) * (p.y - vi.y)) / (vj.y - vi.y) + vi.x
    ) {
      inside = !inside;
    }
  }
  return inside;
}

// Signal connection shapes.

/**
 * Represents a circular shape with a given radius around a central point.
 */
export type SignalConnectionShapePoint = {
  type: "point";
  radius: number;
};

/**
 * Represetns a rectangular shape with a given width, height, and angle.
 */
export type SignalConnectionShapeAABB = {
  type: "aabb";
  width: number;
  height: number;
  angle: number;
};

/**
 * Represents a custom polyline.
 */
export type SignalConnectionShapePolyline = {
  type: "polyline";
  closed?: boolean;
  vertices: Vector2[];
};

// Type union for signal connection shapes.
export type SignalConnectionShape =
  | SignalConnectionShapePoint
  | SignalConnectionShapeAABB
  | SignalConnectionShapePolyline;

/**
 * Level-owned system (peer to the physics world) that owns and drives every
 * signal bus, provides proximity lookup for geometric buses, and guards
 * rebroadcasts against loops.
 */
export class SignalNetwork {
  private buses = new Set<SignalBus>();

  registerBus(bus: SignalBus) {
    this.buses.add(bus);
  }

  unregisterBus(bus: SignalBus) {
    this.buses.delete(bus);
  }

  /**
   * Geometric buses intersecting `shape` placed at `pos` (its centre for point
   * and aabb shapes, the offset origin for polyline vertices), grown by
   * `extraRadius` of slop. A bus counts when any part of it comes within
   * `extraRadius` of the shape, or lies entirely inside a closed shape.
   */
  findProximityBussesByShape(
    pos: Vector2,
    shape: SignalConnectionShape,
    extraRadius = 0.125
  ): SignalBus[] {
    // A circle reduces to a point query with an inflated radius.
    if (shape.type === "point") {
      return this.findProximityBuses(pos, shape.radius + extraRadius);
    }

    // Build the shape's boundary as world-space vertices.
    let verts: Vector2[];
    let closed: boolean;
    if (shape.type === "aabb") {
      const hw = shape.width / 2;
      const hh = shape.height / 2;
      const cos = Math.cos(shape.angle);
      const sin = Math.sin(shape.angle);
      verts = [
        new Vector2(-hw, -hh),
        new Vector2(hw, -hh),
        new Vector2(hw, hh),
        new Vector2(-hw, hh)
      ].map(
        (v) =>
          new Vector2(
            pos.x + v.x * cos - v.y * sin,
            pos.y + v.x * sin + v.y * cos
          )
      );
      closed = true;
    } else {
      verts = shape.vertices.map((v) => new Vector2(pos.x + v.x, pos.y + v.y));
      closed = shape.closed ?? false;
    }

    const shapeSegments: Segment[] = [];
    for (let i = 0; i < verts.length - 1; i++) {
      shapeSegments.push([verts[i], verts[i + 1]]);
    }
    if (closed && verts.length > 2) {
      shapeSegments.push([verts[verts.length - 1], verts[0]]);
    }

    const found: SignalBus[] = [];
    for (const bus of this.buses) {
      if (!bus.hasGeometry) continue;
      const world = bus.getWorldPolyline();

      // A bus wholly inside a closed shape touches no edge — test containment.
      if (closed && world.length > 0 && pointInPolygon(world[0], verts)) {
        found.push(bus);
        continue;
      }

      let hit = false;
      for (let i = 0; i < world.length - 1 && !hit; i++) {
        for (const [s1, s2] of shapeSegments) {
          if (
            segmentSegmentDistance(world[i], world[i + 1], s1, s2) <=
            extraRadius
          ) {
            hit = true;
            break;
          }
        }
      }
      // Single-point buses have no segments; fall back to point-to-edge.
      if (!hit && world.length === 1) {
        hit = shapeSegments.some(
          ([s1, s2]) => pointSegmentDistance(world[0], s1, s2) <= extraRadius
        );
      }
      if (hit) found.push(bus);
    }
    return found;
  }

  /** Geometric buses whose nearest point to `pos` is within `within`. */
  findProximityBuses(pos: Vector2, within: number): SignalBus[] {
    const found: SignalBus[] = [];
    for (const bus of this.buses) {
      if (!bus.hasGeometry) continue;
      if (bus.getNearestPoint(pos).distance <= within) found.push(bus);
    }
    return found;
  }

  /**
   * Create an abstract (geometry-less, instant) bus shared by two connections
   * — a logical link.
   */
  link(a: SignalConnectionAPI, b: SignalConnectionAPI): SignalBus {
    const bus = new SignalBus();
    this.registerBus(bus);
    a.connectTo(bus);
    b.connectTo(bus);
    return bus;
  }

  /**
   * Rebroadcast for junctions: relays `signal` onto `ontoBuses`, skipping
   * `fromBus`. Each pulse carries the set of junctions that have already
   * relayed it, so a junction forwards a given pulse at most once and cycles
   * self-terminate, while every fresh pulse propagates unimpeded. Returns
   * whether the signal was relayed.
   */
  relay(
    signal: Signal,
    fromBus: SignalBusAPI,
    ontoBuses: Iterable<SignalBus>,
    source?: SignalConnectionAPI
  ): boolean {
    if (source) {
      const visited = signal.visited ?? (signal.visited = new Set());
      if (visited.has(source)) return false;
      visited.add(source);
    }
    for (const bus of ontoBuses) {
      if (bus === fromBus) continue;
      bus.transmit(signal, source);
    }
    return true;
  }

  step(deltaMs: number) {
    for (const bus of this.buses) {
      bus.step(deltaMs);
    }
  }
}
