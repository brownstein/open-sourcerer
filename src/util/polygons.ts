import { lineLine as linesIntersect } from "intersects";
import pointInPolygon from "point-in-polygon";
import {
  makeCCW,
  removeCollinearPoints,
  removeDuplicatePoints
} from "poly-decomp";
import { centroid } from "polygon-utils";
import { Box2, Vector2 } from "three";

import { arr2, arr2ToVector2, vector2ToArr2 } from "src/engine/util/vecTypes";

export type arr2Polygon = arr2[];
export type arr2Polygons = arr2Polygon[];

export type PolygonAndHoles = {
  outer: arr2Polygon;
  holes: arr2Polygons;
};

export function getArea(polygon: arr2Polygon) {
  let total = 0;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    total += a[0] * b[1] - a[1] * b[0];
  }
  return Math.abs(total) * 0.5;
}

// This creates a single closed polygon by bridging the outer winding and any
// holes within it. Note that it will bridge concentric rings, which is actually
// a bad thing - so don't feed it concentric rings!
export function mergeHolesIntoPolygon(
  polygon: arr2Polygon,
  ...holes: arr2Polygons
) {
  if (!holes.length) return polygon;
  let result = polygon;
  for (const holeIn of holes) {
    const hole = [...holeIn];
    makeCCW(hole);
    // Bridge target innnet.
    let topVertInner: arr2 | null = null;
    let topVertInnerIndex = -1;
    let matchedVertOuterIndex = -1;
    let matchedVertOuterDistSq = Infinity;
    for (let vi = 0; vi < hole.length; vi++) {
      const vtx = hole[vi];
      if (topVertInner === null) {
        topVertInner = vtx;
        topVertInnerIndex = vi;
        continue;
      }
      if (topVertInner[1] > vtx[1]) {
        topVertInner = vtx;
        topVertInnerIndex = vi;
      }
    }
    if (topVertInner === null) continue;
    for (
      let outerVertIndex = 0;
      outerVertIndex < result.length;
      outerVertIndex++
    ) {
      const outerVert = result[outerVertIndex];
      let foundIntersect = false;
      // Check for intesections with the outer polygon.
      let prev = result.at(-1);
      if (!prev) break;
      for (let vi = 0; vi < result.length; vi++) {
        const next = result[vi];
        if (
          vi === outerVertIndex ||
          vi === (outerVertIndex + 1) % result.length
        ) {
          prev = next;
          continue;
        }
        if (
          linesIntersect(
            prev[0],
            prev[1],
            next[0],
            next[1],
            outerVert[0],
            outerVert[1],
            topVertInner[0],
            topVertInner[1]
          )
        ) {
          foundIntersect = true;
          break;
        }
        prev = next;
      }
      if (foundIntersect) continue;
      // Check for intersections with the hole itself.
      prev = hole.at(-1);
      if (!prev) break;
      for (let vi = 0; vi < hole.length; vi++) {
        const next = hole[vi];
        if (
          vi === topVertInnerIndex ||
          vi === (topVertInnerIndex + 1) % hole.length
        ) {
          prev = next;
          continue;
        }
        if (
          linesIntersect(
            prev[0],
            prev[1],
            next[0],
            next[1],
            outerVert[0],
            outerVert[1],
            topVertInner[0],
            topVertInner[1]
          )
        ) {
          foundIntersect = true;
          break;
        }
        prev = next;
      }
      if (foundIntersect) continue;
      const vtxDistSq =
        (outerVert[0] - topVertInner[0]) ** 2 +
        (outerVert[1] - topVertInner[1]) ** 2;
      if (vtxDistSq > matchedVertOuterDistSq) continue;
      matchedVertOuterIndex = outerVertIndex;
      matchedVertOuterDistSq = vtxDistSq;
    }
    // Now stitch the polygons together.
    if (matchedVertOuterIndex === -1) {
      console.warn(
        "[mergeHolesIntoPolygon] unable to bridge hole.",
        result,
        hole
      );
      continue;
    }
    const revHole = [
      ...hole.slice(topVertInnerIndex, hole.length),
      ...hole.slice(0, topVertInnerIndex)
    ];
    revHole.push(revHole[0]);
    revHole.reverse();
    result = [
      ...result.slice(0, matchedVertOuterIndex + 1),
      ...revHole,
      ...result.slice(matchedVertOuterIndex, result.length)
    ];
  }

  return result;
}

const _origin = new Vector2();

export function projectPolygon(
  polygon: arr2Polygon,
  offset: Vector2,
  rotation: number
) {
  return polygon.map((vtx) =>
    vector2ToArr2(
      arr2ToVector2(vtx).rotateAround(_origin, rotation).add(offset)
    )
  );
}

export function unProjectPolygon(
  polygon: arr2Polygon,
  offset: Vector2,
  rotation: number
) {
  return polygon.map((vtx) =>
    vector2ToArr2(
      arr2ToVector2(vtx).sub(offset).rotateAround(_origin, -rotation)
    )
  );
}

export function getPolygonBBox(polygon: arr2Polygon) {
  const bbox = new Box2();
  for (const vert of polygon) {
    bbox.expandByPoint(arr2ToVector2(vert));
  }
  return bbox;
}

export function projectPolygonAndHoles(
  shape: PolygonAndHoles,
  offset: Vector2,
  rotation: number
): PolygonAndHoles {
  return {
    outer: projectPolygon(shape.outer, offset, rotation),
    holes: shape.holes.map((hole) => projectPolygon(hole, offset, rotation))
  };
}

export function unProjectPolygonAndHoles(
  shape: PolygonAndHoles,
  offset: Vector2,
  rotation: number
): PolygonAndHoles {
  return {
    outer: unProjectPolygon(shape.outer, offset, rotation),
    holes: shape.holes.map((hole) => unProjectPolygon(hole, offset, rotation))
  };
}

export function convertRegionsToPolygonsAndHoles(regions: arr2Polygons) {
  const results: PolygonAndHoles[] = [];
  if (regions.length === 0) return results;
  results.push({
    outer: [...regions[0]],
    holes: []
  });
  makeCCW(results[0].outer);
  for (const region of regions.slice(1)) {
    const regionCentroid = centroid(region);
    for (const result of results) {
      if (pointInPolygon(regionCentroid, result.outer)) {
        result.holes.push(region);
        break;
      }
    }
    const outer = [...region];
    makeCCW(outer);
    results.push({
      outer,
      holes: []
    });
  }
  return results;
}

export function sanitizePolygon(polygonIn: arr2Polygon, cw?: boolean) {
  const polygon = [...polygonIn];
  removeCollinearPoints(polygon, 0.001);
  removeDuplicatePoints(polygon, 0.001);
  if (polygon.length < 3) return [];
  makeCCW(polygon);
  if (cw) polygon.reverse();
  return polygon;
}

export function sanitizePolygonAndHoles(shape: PolygonAndHoles) {
  return {
    outer: sanitizePolygon(shape.outer),
    holes: shape.holes
      .map((hole) => sanitizePolygon(hole, true))
      .filter((hole) => hole.length)
  };
}

export function getClosedPolygon(
  polygon: arr2Polygon,
  graceDist: number = 0.25
) {
  if (polygon.length < 3) return null;
  for (let i = 2; i < polygon.length; i++) {
    const prev = polygon[i - 1];
    const next = polygon[i];
    for (let j = 1; j < i - 1; j++) {
      const otherPrev = polygon[j - 1];
      const otherNext = polygon[j];
      if (
        linesIntersect(
          prev[0],
          prev[1],
          next[0],
          next[1],
          otherPrev[0],
          otherPrev[1],
          otherNext[0],
          otherNext[1]
        )
      ) {
        return polygon.slice(0, i + 1);
      }
    }
  }
  const start = polygon[0];
  const end = polygon[polygon.length - 1];
  if (graceDist ** 2 >= (start[0] - end[0]) ** 2 + (start[1] - end[1]) ** 2) {
    return polygon;
  }
  return null;
}
