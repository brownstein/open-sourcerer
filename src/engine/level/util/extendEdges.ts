import { Box2, Vector2 } from "three";

import * as TiledAPI from "../tiled/api";

type Edge = [Vector2, Vector2];

export const kLeftExtensionId = "EXT_LEFT";
export const kRightExtensionId = "EXT_RIGHT";
export const kTopExtensionId = "EXT_TOP";
export const kBottomExtensionId = "EXT_BOTTOM";

export function extendEdges(
  map: TiledAPI.Map,
  distance = 4,
  outerBounds = true
) {
  // A map with no solid terrain has no finite bounds to extend; synthesizing
  // outer-bound walls from an empty bbox yields ±Infinity polygons that crash
  // the physics convex-hull builder. Object-only maps (e.g. the skill tree)
  // simply have no edges to extend.
  if (map.bbox.isEmpty()) return [];

  const leftEdges: Edge[] = [];
  const rightEdges: Edge[] = [];
  const bottomEdges: Edge[] = [];
  const topEdges: Edge[] = [];

  const minX = map.bbox.min.x;
  const maxX = map.bbox.max.x;
  const minY = map.bbox.min.y;
  const maxY = map.bbox.max.y;

  for (const layer of map.layers) {
    if (!TiledAPI.isMapTileLayer(layer)) continue;
    if (layer.properties?.noTerrainExtension) continue;
    for (const terrain of layer.terrain) {
      let isSolid = true;
      switch (terrain.tileType) {
        case TiledAPI.TileType.decal:
          isSolid = false;
          break;
        default:
          break;
      }
      if (!isSolid) continue;
      const vtxs = terrain.polygon;
      for (let vi = 0; vi < vtxs.length; vi++) {
        const a = vtxs[vi].clone().add(terrain.pos);
        const b = vtxs[(vi + 1) % vtxs.length].clone().add(terrain.pos);
        if (a.x === minX && b.x === minX) leftEdges.push([a, b]);
        if (a.x === maxX && b.x === maxX) rightEdges.push([a, b]);
        if (a.y === minY && b.y === minY) bottomEdges.push([a, b]);
        if (a.y === maxY && b.y === maxY) topEdges.push([a, b]);
      }
    }
  }

  const resultTerrain: TiledAPI.MapTerrain[] = [];

  // Build left extensions.
  const leftPolygons: Vector2[][] = [];
  for (const edge of leftEdges) {
    const [a, b] = edge;
    leftPolygons.push([
      new Vector2(minX - distance, a.y),
      new Vector2(minX, a.y),
      new Vector2(minX, b.y),
      new Vector2(minX - distance, b.y)
    ]);
    if (a.y === minY) bottomEdges.push([a, a.clone().setX(minX - distance)]);
    if (b.y === minY) bottomEdges.push([b, b.clone().setX(minX - distance)]);
    if (a.y === maxY) topEdges.push([a, a.clone().setX(minX - distance)]);
    if (b.y === maxY) topEdges.push([b, b.clone().setX(minX - distance)]);
  }
  // Also add outer bounds to keep us from running /falling offscreen infinitely.
  if (outerBounds) {
    leftPolygons.push([
      new Vector2(minX - distance * 2, maxY + distance),
      new Vector2(minX - distance, maxY + distance),
      new Vector2(minX - distance, minY - distance),
      new Vector2(minX - distance * 2, minY - distance)
    ]);
  }
  const leftBBox = new Box2();
  for (const polygon of leftPolygons) {
    for (const vtx of polygon) leftBBox.expandByPoint(vtx);
  }
  const leftPos = new Vector2();
  leftBBox.getCenter(leftPos);
  for (const polygon of leftPolygons) {
    for (const vtx of polygon) vtx.sub(leftPos);
  }
  resultTerrain.push({
    id: kLeftExtensionId,
    polygon: [],
    convexComponentPolygons: leftPolygons,
    decalTiles: [],
    pos: leftPos,
    bbox: leftBBox
  });

  // Build right extensions.
  const rightPolygons: Vector2[][] = [];
  for (const edge of rightEdges) {
    const [a, b] = edge;
    rightPolygons.push([
      new Vector2(maxX, a.y),
      new Vector2(maxX + distance, a.y),
      new Vector2(maxX + distance, b.y),
      new Vector2(maxX, b.y)
    ]);
    if (a.y === minY) bottomEdges.push([a, a.clone().setX(maxX + distance)]);
    if (b.y === minY) bottomEdges.push([b, b.clone().setX(maxX + distance)]);
    if (a.y === maxY) topEdges.push([a, a.clone().setX(maxX + distance)]);
    if (b.y === maxY) topEdges.push([b, b.clone().setX(maxX + distance)]);
  }
  // Also add outer bounds to keep us from running /falling offscreen infinitely.
  if (outerBounds) {
    rightPolygons.push([
      new Vector2(maxX + distance, maxY + distance),
      new Vector2(maxX + distance * 2, maxY + distance),
      new Vector2(maxX + distance * 2, minY - distance),
      new Vector2(maxX + distance, minY - distance)
    ]);
  }
  const rightBBox = new Box2();
  for (const polygon of rightPolygons) {
    for (const vtx of polygon) rightBBox.expandByPoint(vtx);
  }
  const rightPos = new Vector2();
  rightBBox.getCenter(rightPos);
  for (const polygon of rightPolygons) {
    for (const vtx of polygon) vtx.sub(rightPos);
  }
  resultTerrain.push({
    id: kRightExtensionId,
    polygon: [],
    convexComponentPolygons: rightPolygons,
    decalTiles: [],
    pos: rightPos,
    bbox: rightBBox
  });

  // Build top extensions.
  const topPolygons: Vector2[][] = [];
  for (const edge of topEdges) {
    const [a, b] = edge;
    topPolygons.push([
      new Vector2(a.x, maxY + distance),
      new Vector2(b.x, maxY + distance),
      new Vector2(b.x, maxY),
      new Vector2(a.x, maxY)
    ]);
  }
  // Also add outer bounds to keep us from running /falling offscreen infinitely.
  if (outerBounds) {
    topPolygons.push([
      new Vector2(minX - distance * 2, maxY + distance * 2),
      new Vector2(maxX + distance * 2, maxY + distance * 2),
      new Vector2(maxX + distance * 2, maxY + distance),
      new Vector2(minX - distance * 2, maxY + distance)
    ]);
  }
  const topBBox = new Box2();
  for (const polygon of topPolygons) {
    for (const vtx of polygon) topBBox.expandByPoint(vtx);
  }
  const topPos = new Vector2();
  topBBox.getCenter(topPos);
  for (const polygon of topPolygons) {
    for (const vtx of polygon) vtx.sub(topPos);
  }
  resultTerrain.push({
    id: kTopExtensionId,
    polygon: [],
    convexComponentPolygons: topPolygons,
    decalTiles: [],
    pos: topPos,
    bbox: topBBox
  });

  // Build bottom extensions.
  const bottomPolygons: Vector2[][] = [];
  for (const edge of bottomEdges) {
    const [a, b] = edge;
    bottomPolygons.push([
      new Vector2(a.x, minY),
      new Vector2(b.x, minY),
      new Vector2(b.x, minY - distance),
      new Vector2(a.x, minY - distance)
    ]);
  }
  // Also add outer bounds to keep us from running /falling offscreen infinitely.
  if (outerBounds) {
    bottomPolygons.push([
      new Vector2(minX - distance * 2, minY - distance),
      new Vector2(maxX + distance * 2, minY - distance),
      new Vector2(maxX + distance * 2, minY - distance * 2),
      new Vector2(minX - distance * 2, minY - distance * 2)
    ]);
  }
  const bottomBBox = new Box2();
  for (const polygon of bottomPolygons) {
    for (const vtx of polygon) bottomBBox.expandByPoint(vtx);
  }
  const bottomPos = new Vector2();
  bottomBBox.getCenter(bottomPos);
  for (const polygon of bottomPolygons) {
    for (const vtx of polygon) vtx.sub(bottomPos);
  }
  resultTerrain.push({
    id: kBottomExtensionId,
    polygon: [],
    convexComponentPolygons: bottomPolygons,
    decalTiles: [],
    pos: bottomPos,
    bbox: bottomBBox
  });

  return resultTerrain;
}
