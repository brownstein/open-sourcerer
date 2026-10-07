import pointInPolygon from "point-in-polygon";
import { makeCCW, quickDecomp, removeCollinearPoints } from "poly-decomp";
import shortid from "shortid";
import { Box2, Matrix3, Vector2 } from "three";

import { arr2ToVector2, vector2ToArr2 } from "src/engine/util/vecTypes";
import { IndexedGrid } from "src/util/IndexedGrid";

import * as API from "./api";
import { canMergeTerrainTypes, solidTypesSet } from "./mergeTypeMapping";
import {
  DIAGONAL_FLIP_BIT,
  HORIZONTAL_FLIP_BIT,
  TILE_FLIP_BITS,
  TILE_ID_BITS,
  VERTICAL_FLIP_BIT
} from "./tiledJson";

// Internal class to store details about an edge.
class Edge {
  public a: Vector2;
  public b: Vector2;
  public side?: API.TileSides;
  public next?: Edge;
  public prev?: Edge;
  public block?: Block;
  public closed = false;
  public loop?: Loop;
  constructor(a: Vector2, b: Vector2) {
    this.a = a;
    this.b = b;
  }
}

// Default square block edges.
function defaultBlockEdges() {
  const top = new Edge(new Vector2(0, 0), new Vector2(1, 0));
  top.side = API.TileSides.top;
  const right = new Edge(new Vector2(1, 0), new Vector2(1, 1));
  right.side = API.TileSides.right;
  const bottom = new Edge(new Vector2(1, 1), new Vector2(0, 1));
  bottom.side = API.TileSides.bottom;
  const left = new Edge(new Vector2(0, 1), new Vector2(0, 0));
  left.side = API.TileSides.left;
  top.next = right;
  top.prev = left;
  right.next = bottom;
  right.prev = top;
  bottom.next = left;
  bottom.prev = right;
  left.next = top;
  left.prev = bottom;
  return [top, right, bottom, left];
}

// matrix constants used for flipping tile polygons
const DIAGONAL_FLIP_MATRIX = new Matrix3().set(0, 1, 0, 1, 0, 0, 0, 0, 1);

const HORIZONTAL_FLIP_MATRIX = new Matrix3().set(-1, 0, 1, 0, 1, 0, 0, 0, 1);

const VERTICAL_FLIP_MATRIX = new Matrix3().set(1, 0, 0, 0, -1, 1, 0, 0, 1);

// Internal class to store details about a block.
class Block {
  public x: number;
  public y: number;
  public type?: API.TileType;
  public flipOptions?: API.TileFlipOptions;
  public edges: Edge[];
  public edgeSides = new Map<API.TileSides, Edge>();
  public loops: Loop[] = [];
  public tileDef?: API.TileDef;
  public decalApplied = false;
  public modifier?: API.TileModifier;
  constructor(
    x: number,
    y: number,
    type?: API.TileType,
    shape?: API.TileDefShape,
    flipBits?: number,
    modifier?: API.TileModifier
  ) {
    this.x = x;
    this.y = y;
    this.type = type;
    this.modifier = modifier;

    if (flipBits) {
      this.flipOptions = {};

      this.flipOptions[API.TileFlip.diagonal] = !!(
        flipBits & DIAGONAL_FLIP_BIT
      );
      this.flipOptions[API.TileFlip.horizontal] = !!(
        flipBits & HORIZONTAL_FLIP_BIT
      );
      this.flipOptions[API.TileFlip.vertical] = !!(
        flipBits & VERTICAL_FLIP_BIT
      );
    }

    if (shape) {
      // create the transformation matrix for flips
      const flipMatrix = new Matrix3();
      if (this.flipOptions) {
        if (this.flipOptions[API.TileFlip.vertical])
          flipMatrix.multiply(VERTICAL_FLIP_MATRIX);

        if (this.flipOptions[API.TileFlip.horizontal])
          flipMatrix.multiply(HORIZONTAL_FLIP_MATRIX);

        if (this.flipOptions[API.TileFlip.diagonal])
          flipMatrix.multiply(DIAGONAL_FLIP_MATRIX);
      }

      this.edges = [];
      for (let vi = 0; vi < shape.clippedPolygon.length; vi++) {
        const a = new Vector2()
          .copy(shape.clippedPolygon[vi])
          .applyMatrix3(flipMatrix);

        const b = new Vector2()
          .copy(shape.clippedPolygon[(vi + 1) % shape.clippedPolygon.length])
          .applyMatrix3(flipMatrix);

        const edge = new Edge(a, b);
        edge.block = this;
        this.edges.push(edge);
      }

      // helper utility used for getting the correct side labels for edges
      const getFlippedSide = (side: string): string => {
        if (!this.flipOptions) return side;

        if (this.flipOptions[API.TileFlip.diagonal]) {
          switch (side) {
            case API.TileSides.top: {
              side = API.TileSides.left;
              break;
            }
            case API.TileSides.right: {
              side = API.TileSides.bottom;
              break;
            }
            case API.TileSides.bottom: {
              side = API.TileSides.right;
              break;
            }
            case API.TileSides.left: {
              side = API.TileSides.top;
              break;
            }
          }
        }

        if (this.flipOptions[API.TileFlip.horizontal]) {
          switch (side) {
            case API.TileSides.left: {
              side = API.TileSides.right;
              break;
            }
            case API.TileSides.right: {
              side = API.TileSides.left;
              break;
            }
            default: {
              break;
            }
          }
        }

        if (this.flipOptions[API.TileFlip.vertical]) {
          switch (side) {
            case API.TileSides.top: {
              side = API.TileSides.bottom;
              break;
            }
            case API.TileSides.bottom: {
              side = API.TileSides.top;
              break;
            }
            default: {
              break;
            }
          }
        }

        return side;
      };

      for (const [originalSide, vtxIndexSet] of Object.entries(
        shape.sidesVertexIndices
      )) {
        const side = getFlippedSide(originalSide);

        for (const vtxIndex of vtxIndexSet) {
          const edge = this.edges[vtxIndex];
          if (edge === undefined) continue;

          switch (side) {
            case API.TileSides.top:
            case API.TileSides.right:
            case API.TileSides.bottom:
            case API.TileSides.left:
              edge.side = side;
              this.edgeSides.set(side, edge);
              break;
            default:
              break;
          }
        }
      }

      // edges are expected to be traversed in a clockwise direction
      // so, determine if winding order has been broken by checking if num of flips is odd
      let flipCount = 0;
      if (this.flipOptions) {
        flipCount += +!!this.flipOptions[API.TileFlip.diagonal];
        flipCount += +!!this.flipOptions[API.TileFlip.horizontal];
        flipCount += +!!this.flipOptions[API.TileFlip.vertical];
      }

      if (flipCount % 2 !== 0) {
        // An odd number of flips inverts the polygon's winding (CW → CCW).
        // Restore CW by both reversing each edge's endpoints AND linking edges
        // in reverse array order below. Swapping (a, b) is required so that
        // edge.b continues to equal edge.next.a — when adjacency closures
        // splice closed edges out of the chain, that invariant is what keeps
        // the merged loop continuous. Without the swap, the polygon skips
        // intermediate corners (e.g. the end of a slope edge) and stretches
        // diagonals across neighbouring tiles.
        for (const edge of this.edges) {
          [edge.a, edge.b] = [edge.b, edge.a];
        }
      }

      for (let ei = 0; ei < this.edges.length; ei++) {
        let currentEdgeIndex = ei;
        let nextEdgeIndex = (ei + 1) % this.edges.length;

        if (flipCount % 2 !== 0) {
          // enforce clockwise traversal
          currentEdgeIndex *= -1;
          nextEdgeIndex *= -1;
        }

        const a = this.edges.at(currentEdgeIndex)!;
        const b = this.edges.at(nextEdgeIndex)!;
        a.next = b;
        b.prev = a;
      }
    } else {
      this.edges = defaultBlockEdges();
      for (const edge of this.edges) {
        edge.block = this;
        if (edge.side === undefined) continue;
        this.edgeSides.set(edge.side, edge);
      }
    }
  }
  hasLoop(loop: Loop) {
    for (const thisLoop of this.loops) {
      if (loop === thisLoop) return true;
    }
    return false;
  }
}

const MAX_EDGE_TRAVERSAL_STEPS = 10000;

// Internal class to store loop traversals.
class Loop {
  public id = shortid();
  public blockType?: API.TileType;

  // Keep track of edge count to find degenerate loops.
  public edgeCount = 0;

  // We need to know the first edge to traverse the loop.
  // Edges form a bidirectional linked list, so we can rely
  // on this to get the entire polygon.
  public firstEdge?: Edge;

  // Retain knowledge of lower edges for each grid cell.
  public lowerEdges = new IndexedGrid<Edge>();

  // Nesting.
  public outerLoop?: Loop;
  public innerLoops: Loop[] = [];
  public consumedByOuterLoop = false;
  public bbox = new Box2();

  // Traverses all edges in a loop, assigning them to this loop.
  claimOuterEdgesForward(startEdge: Edge) {
    if (this.firstEdge === undefined) this.firstEdge = startEdge;
    let edge = startEdge;
    for (let i = 0; i < MAX_EDGE_TRAVERSAL_STEPS; i++) {
      edge.loop = this;
      this.edgeCount++;
      if (edge.block) {
        this.bbox.expandByPoint(
          new Vector2(edge.block.x + edge.a.x, edge.block.y + edge.a.y)
        );
        if (edge.b.x < edge.a.x) {
          this.lowerEdges.set(edge.block.x, edge.block.y, edge);
        }
      }
      if (edge.next === undefined)
        throw new Error("[mergeTerrain]: Loop closure invariant broken.");
      edge = edge.next;
      if (edge === startEdge) break;
    }
  }

  // Traverse all edges in a loop, reversing them and assigning them to this loop.
  claimInnerEdgesBackward(startEdge: Edge) {
    let edge = startEdge;
    for (let i = 0; i < MAX_EDGE_TRAVERSAL_STEPS; i++) {
      edge.loop = this;
      this.edgeCount++;
      // [edge.a, edge.b] = [edge.b, edge.a];
      // [edge.next, edge.prev] = [edge.prev, edge.next];
      // This might be broken. Block ownership might have to be adjusted too.
      if (edge.block) {
        if (edge.b.x < edge.a.x) {
          this.lowerEdges.set(edge.block.x, edge.block.y, edge);
        }
      }
      if (edge.next === undefined)
        throw new Error("[mergeTerrain]: Loop closure invariant broken.");
      edge = edge.next;
      if (edge === startEdge) break;
    }
  }
  // This is NOT elegent. Need to revise strategy.
  isInside(otherLoop: Loop) {
    if (otherLoop.blockType !== this.blockType) return false;
    if (!otherLoop.bbox.containsBox(this.bbox)) return false;
    const thisPolygon = this.getPolygon().map(vector2ToArr2);
    const otherPolygon = otherLoop.getPolygon().map(vector2ToArr2);
    let interiorCount = 0;
    for (let vi = 0; vi < thisPolygon.length; vi++) {
      const a = thisPolygon[vi];
      const b = thisPolygon[(vi + 1) % thisPolygon.length];
      const midPoint = [0.5 * (a[0] + b[0]), 0.5 * (a[1] + b[1])];
      if (pointInPolygon(midPoint, otherPolygon)) interiorCount++;
    }
    if (interiorCount !== thisPolygon.length) return false;
    return true;
  }
  addInnerLoop(otherLoop: Loop) {
    this.innerLoops.push(otherLoop);
    otherLoop.outerLoop = this;
  }
  consumeInnerLoops() {
    if (this.consumedByOuterLoop || this.innerLoops.length === 0) return;

    // Sort inner loops so we traverse over the lowest first.
    this.innerLoops.sort((a, b) => b.bbox.max.y - a.bbox.max.y);

    for (const innerLoop of this.innerLoops) {
      // Find the lowermost inner edge.
      let lowestBottomInnerEdge: Edge | undefined;
      const startEdgeInner = innerLoop.firstEdge;
      if (startEdgeInner === undefined)
        throw new Error(
          "[mergeTerrain]: inner loop missing pointer to first edge."
        );
      let edge = startEdgeInner;
      for (let i = 0; i < MAX_EDGE_TRAVERSAL_STEPS; i++) {
        if (edge.a.x < edge.b.x) {
          if (!lowestBottomInnerEdge || lowestBottomInnerEdge.a.y < edge.a.y)
            lowestBottomInnerEdge = edge;
        }
        if (edge.next === undefined)
          throw new Error(
            "[mergeTerrain]: Loop closure invariant broken for inner loop."
          );
        edge = edge.next;
        if (edge === startEdgeInner) break;
      }
      if (lowestBottomInnerEdge === undefined)
        throw new Error(
          "[mergeTerrain]: failed to find the bottom of an inner loop."
        );
      if (lowestBottomInnerEdge.block === undefined)
        throw new Error(
          "[mergeTerrain]: failed to find a block for an initialized edge."
        );
      // Find the corresponding edge on the outer loop.
      const blockX = lowestBottomInnerEdge.block.x;
      let blockY = lowestBottomInnerEdge.block.y;
      let matchedOuterEdge: Edge | undefined;
      while (blockY <= this.bbox.max.y) {
        matchedOuterEdge = this.lowerEdges.get(blockX, blockY);
        if (matchedOuterEdge !== undefined) break;
        blockY++;
      }
      if (matchedOuterEdge === undefined)
        throw new Error(
          "[mergeTerrain]: failed to find outer edge to connect to the bottom of the inner loop."
        );
      // OK! We matched some edges up. Now claim the inner loop and stitch them together.
      this.claimInnerEdgesBackward(lowestBottomInnerEdge);

      const oldOuterNext = matchedOuterEdge.next;
      const oldInnerPrev = lowestBottomInnerEdge.prev;
      const outerBlock = matchedOuterEdge.block;
      const innerBlock = lowestBottomInnerEdge.block;

      // I really need to make type assertions for this.
      if (
        outerBlock === undefined ||
        // innerBlock === undefined ||
        oldOuterNext === undefined ||
        oldInnerPrev === undefined
      )
        throw new Error(
          "[mergeTerrain]: Connectivity invariant broken in merge."
        );

      // Create two new edges to connect the loops.
      const newEdgeUp = new Edge(
        matchedOuterEdge.b,
        lowestBottomInnerEdge.a
          .clone()
          .add(new Vector2(innerBlock.x, innerBlock.y))
          .sub(new Vector2(outerBlock.x, outerBlock.y))
      );
      const newEdgeDown = new Edge(newEdgeUp.b, newEdgeUp.a);

      // Stitch in the new edges.
      newEdgeDown.block = outerBlock;
      newEdgeUp.block = outerBlock;
      matchedOuterEdge.next = newEdgeUp;
      newEdgeUp.prev = matchedOuterEdge;
      newEdgeUp.next = lowestBottomInnerEdge;
      lowestBottomInnerEdge.prev = newEdgeUp;
      oldInnerPrev.next = newEdgeDown;
      newEdgeDown.prev = oldInnerPrev;
      newEdgeDown.next = oldOuterNext;
      oldOuterNext.prev = newEdgeDown;
      this.edgeCount += 2;

      // Mark inner loop as consumed.
      innerLoop.consumedByOuterLoop = true;
    }

    this.innerLoops = [];
  }
  getPolygon() {
    if (this.firstEdge === undefined)
      throw new Error("[mergeTerrain]: unable to find first loop edge.");
    const polygon: Vector2[] = [];
    const startEdge = this.firstEdge;
    let edge = startEdge;
    for (let i = 0; i < MAX_EDGE_TRAVERSAL_STEPS; i++) {
      if (edge.block) {
        polygon.push(
          new Vector2(edge.block.x + edge.a.x, edge.block.y + edge.a.y)
        );
      }
      if (edge.next === undefined)
        throw new Error("[mergeTerrain]: loop isn't a ring.");
      edge = edge.next;
      if (edge === startEdge) break;
    }
    return polygon;
  }
}

export function snapPolygon(polygon: Vector2[], snapDistance = 0.05) {
  const invSnapDistance = 1 / snapDistance;
  const result: Vector2[] = [];
  let lastVtx: Vector2 | undefined;
  for (const vtx of polygon) {
    const roundedX = Math.round(vtx.x * invSnapDistance) * snapDistance;
    const roundedY = Math.round(vtx.y * invSnapDistance) * snapDistance;
    vtx.x = roundedX;
    vtx.y = roundedY;
    if (lastVtx === undefined || !lastVtx.equals(vtx)) result.push(vtx);
    lastVtx = vtx;
  }
  return result;
}

export function scalePolygon(
  polygon: Vector2[],
  flipY: boolean,
  dataScale: number
) {
  for (const vtx of polygon) {
    if (flipY) vtx.y *= -1;
    vtx.multiplyScalar(dataScale);
  }
  if (flipY) polygon.reverse();
  return polygon;
}

// This is the callback signature used for tile modifier lookup.
export type TileModifierGetter = (
  gridTileX: number,
  gridTileY: number
) => API.TileModifier | undefined;

export type TileModifierSetter = (
  gridTileX: number,
  gridTileY: number,
  modifier: API.TileModifier | undefined
) => void;

/**
 * Traverses a tile grid to identify grouped entities and polygons.
 * TODO: differentiate by tile type.
 * TODO: support holes / caverns.
 */
export function buildTerrainFromTileGrid(
  data: number[],
  dataWidth: number,
  gidToTileDef: Map<number, API.TileDef>,
  dataOffset: Vector2 = new Vector2(0, 0),
  dataScale: number = 1,
  flipY: boolean = true,
  getModifier?: TileModifierGetter,
  setModifier?: TileModifierSetter
) {
  const dataHeight = Math.floor(data.length / dataWidth);

  const getGIDAtPos = (x: number, y: number) => {
    return data[x + y * dataWidth];
  };

  const getTileIdAtPos = (x: number, y: number) => {
    const gid = getGIDAtPos(x, y);
    return gid & TILE_ID_BITS;
  };

  const getTileFlipBitsAtPos = (x: number, y: number) => {
    const gid = getGIDAtPos(x, y);
    return gid & TILE_FLIP_BITS;
  };

  // Build block grid.
  const blockGrid = new IndexedGrid<Block>();
  for (let x = 0; x < dataWidth; x++) {
    for (let y = 0; y < dataHeight; y++) {
      const tileId = getTileIdAtPos(x, y);
      const tileDef = gidToTileDef.get(tileId);
      if (tileDef === undefined) continue;

      const flipBits = getTileFlipBitsAtPos(x, y);
      const globalX = dataOffset.x + x;
      const globalY = dataOffset.y + y * (flipY ? -1 : 1);

      // Special logic for tile modifiers (cracks).
      if (tileDef.type === API.TileType.cracks) {
        setModifier?.(globalX, globalY, API.TileModifier.cracked);
        continue;
      }

      // Look up modifiers.
      const tileModifier = getModifier?.(globalX, globalY);

      const block = new Block(
        x,
        y,
        tileDef.type,
        tileDef.shape,
        flipBits,
        tileModifier
      );
      block.tileDef = tileDef;
      blockGrid.set(x, y, block);
    }
  }

  // Mark adjacent block sides as closed and update edge adjacencies.
  for (let tx = 0; tx < dataWidth; tx++) {
    for (let ty = 0; ty < dataHeight; ty++) {
      const block = blockGrid.get(tx, ty);
      if (block === undefined) continue;
      const rightBlock = blockGrid.get(tx + 1, ty);
      const bottomBlock = blockGrid.get(tx, ty + 1);
      const rightEdge = block.edgeSides.get(API.TileSides.right);
      const leftEdge = rightBlock?.edgeSides.get(API.TileSides.left);
      const bottomEdge = block.edgeSides.get(API.TileSides.bottom);
      const topEdge = bottomBlock?.edgeSides.get(API.TileSides.top);
      if (
        canMergeTerrainTypes(block.type, rightBlock?.type) &&
        (block.modifier === rightBlock?.modifier ||
          !solidTypesSet.has(block.type ?? API.TileType.decal)) &&
        rightEdge &&
        leftEdge
      ) {
        rightEdge.closed = true;
        leftEdge.closed = true;
        if (rightEdge.prev) rightEdge.prev.next = leftEdge.next;
        if (rightEdge.next) rightEdge.next.prev = leftEdge.prev;
        if (leftEdge.prev) leftEdge.prev.next = rightEdge.next;
        if (leftEdge.next) leftEdge.next.prev = rightEdge.prev;
      }
      if (
        canMergeTerrainTypes(block.type, bottomBlock?.type) &&
        (block.modifier === bottomBlock?.modifier ||
          !solidTypesSet.has(block.type ?? API.TileType.decal)) &&
        bottomEdge &&
        topEdge &&
        block.type !== API.TileType.platform
      ) {
        bottomEdge.closed = true;
        topEdge.closed = true;
        if (bottomEdge.prev) bottomEdge.prev.next = topEdge.next;
        if (bottomEdge.next) bottomEdge.next.prev = topEdge.prev;
        if (topEdge.prev) topEdge.prev.next = bottomEdge.next;
        if (topEdge.next) topEdge.next.prev = bottomEdge.prev;
      }
    }
  }

  // Traverse all loops of open edges.
  const loops: Loop[] = [];
  for (let tx = 0; tx < dataWidth; tx++) {
    for (let ty = 0; ty < dataHeight; ty++) {
      const block = blockGrid.get(tx, ty);
      if (block === undefined) continue;
      for (const startEdge of block.edges) {
        if (startEdge.closed) continue;
        if (startEdge.loop) continue;
        const loop = new Loop();
        loop.blockType = block.type;
        loop.claimOuterEdgesForward(startEdge);
        if (loop.edgeCount < 3) continue;
        let containmentCount = 0;
        let innermostOuterLoop: Loop | undefined;
        for (const outerLoop of loops) {
          if (loop.isInside(outerLoop)) {
            containmentCount++;
            if (
              innermostOuterLoop === undefined ||
              outerLoop.isInside(innermostOuterLoop)
            ) {
              innermostOuterLoop = outerLoop;
            }
          }
        }
        loops.push(loop);
        if (innermostOuterLoop !== undefined && containmentCount % 2 === 1) {
          innermostOuterLoop.addInnerLoop(loop);
        }
      }
    }
  }

  // Turn loops into terrain.
  const allTerrain: API.MapTerrain[] = [];

  for (const loop of loops) {
    if (loop.outerLoop) continue;
    loop.consumeInnerLoops();
    const loopTileType = loop.firstEdge?.block?.type;
    const loopTileModifier = loop.firstEdge?.block?.modifier;

    // Preprocess polygon.
    const initialPolygonVector2 = snapPolygon(loop.getPolygon());

    // Get simplified polygon. This won't account for holes or be convex.
    // Use a small angle threshold so that vertices which are collinear up
    // to floating-point error get removed — a hard `area === 0` check (the
    // poly-decomp default) lets near-collinear runs slip through and breaks
    // the convex decomposition below, sometimes producing vertices that
    // shoot far outside the polygon's bounding box.
    const collinearThreshold = 1e-4;
    const simplePolygonArr = initialPolygonVector2.map(vector2ToArr2);
    makeCCW(simplePolygonArr);
    removeCollinearPoints(simplePolygonArr, collinearThreshold);
    const simplePolygonVector2 = simplePolygonArr.map((vtx) =>
      arr2ToVector2(vtx)
    );

    // Get decomposed polygons. Strip near-collinear vertices BEFORE
    // decomposition — quickDecomp can degenerate when fed near-straight
    // runs, occasionally emitting points far outside the input polygon.
    const decompPolygonArr = initialPolygonVector2.map(vector2ToArr2);
    makeCCW(decompPolygonArr);
    removeCollinearPoints(decompPolygonArr, collinearThreshold);
    const decompedPolygonArrs = quickDecomp(decompPolygonArr);
    for (const deompedPolyArr of decompedPolygonArrs) {
      removeCollinearPoints(deompedPolyArr, collinearThreshold);
    }
    const decompedPolygonVector2s = decompedPolygonArrs
      .map((decompedPolyArr) => {
        const result = decompedPolyArr.map((vtx) => arr2ToVector2(vtx));
        const bbox = new Box2();
        for (const vtx of result) bbox.expandByPoint(vtx);
        if (bbox.min.x === bbox.max.x || bbox.min.y === bbox.max.y) {
          console.warn(
            "[mergeTerrain]: Found flat polygon (BAD), omitting",
            result
          );
          return null;
        }
        return result;
      })
      .filter(Boolean) as Vector2[][];

    // Apply position to all geometry.
    const rawTerrainPos = new Vector2();
    loop.bbox.getCenter(rawTerrainPos);
    for (const vtx of simplePolygonVector2) vtx.sub(rawTerrainPos);
    for (const poly of decompedPolygonVector2s) {
      for (const vtx of poly) vtx.sub(rawTerrainPos);
    }

    // Apply scale to position and geometry.
    const terrainPos = rawTerrainPos.clone().multiplyScalar(dataScale);
    if (flipY) terrainPos.y *= -1;
    scalePolygon(simplePolygonVector2, flipY, dataScale);
    for (const poly of decompedPolygonVector2s)
      scalePolygon(poly, flipY, dataScale);

    // Get multiplied data offset.
    const mDataOffset = flipY
      ? new Vector2(dataOffset.x, -dataOffset.y)
      : dataOffset;
    mDataOffset.multiplyScalar(dataScale);

    // Apply data offset to terrain position.
    terrainPos.add(mDataOffset);

    // Get decal tiles.
    const decalTiles: API.MapTile[] = [];
    if (loop.firstEdge?.block) {
      const firstBlock = loop.firstEdge.block;
      firstBlock.decalApplied = true;
      const frontier = [firstBlock];
      const expand = (fromBlock: Block, dx: number, dy: number) => {
        const x = fromBlock.x + dx;
        const y = fromBlock.y + dy;
        const expandBlock = blockGrid.get(x, y);
        if (
          expandBlock === undefined ||
          expandBlock.decalApplied ||
          !canMergeTerrainTypes(expandBlock.type, fromBlock.type) ||
          (expandBlock.modifier !== fromBlock.modifier &&
            solidTypesSet.has(expandBlock.type ?? API.TileType.decal))
        )
          return;
        if (
          dx > 0 &&
          (!fromBlock.edgeSides.has(API.TileSides.right) ||
            !expandBlock.edgeSides.has(API.TileSides.left))
        )
          return;
        if (
          dx < 0 &&
          (!fromBlock.edgeSides.has(API.TileSides.left) ||
            !expandBlock.edgeSides.has(API.TileSides.right))
        )
          return;
        if (
          dy < 0 &&
          (!fromBlock.edgeSides.has(API.TileSides.top) ||
            !expandBlock.edgeSides.has(API.TileSides.bottom))
        )
          return;
        if (
          dy > 0 &&
          (!fromBlock.edgeSides.has(API.TileSides.bottom) ||
            !expandBlock.edgeSides.has(API.TileSides.top))
        )
          return;
        expandBlock.decalApplied = true;
        frontier.push(expandBlock);
      };
      mDataOffset.multiplyScalar(dataScale);
      while (frontier.length > 0) {
        const nextBlock = frontier.pop();
        if (nextBlock === undefined || nextBlock.tileDef === undefined)
          continue;

        const isSolidTile = solidTypesSet.has(
          nextBlock.type ?? API.TileType.decal
        );
        const collisionPolygon = isSolidTile
          ? nextBlock.edges.map((edge) => {
              const vtx = new Vector2(
                nextBlock.x + edge.a.x,
                nextBlock.y + edge.a.y
              ).sub(rawTerrainPos);
              if (flipY) vtx.y *= -1;
              return vtx.multiplyScalar(dataScale);
            })
          : undefined;
        const decalTile: API.MapTile = {
          def: nextBlock.tileDef,
          pos: new Vector2(nextBlock.x, nextBlock.y)
            .sub(rawTerrainPos)
            .multiplyScalar(dataScale)
            .multiply(new Vector2(1, flipY ? -1 : 1)),
          flipOptions: nextBlock.flipOptions,
          collisionPolygon: collisionPolygon?.length
            ? collisionPolygon
            : undefined
        };
        decalTiles.push(decalTile);
        expand(nextBlock, 1, 0);
        expand(nextBlock, -1, 0);
        expand(nextBlock, 0, 1);
        expand(nextBlock, 0, -1);
      }
    }

    const bbox = loop.bbox.clone();
    bbox.min
      .add(dataOffset)
      .multiplyScalar(dataScale)
      .multiply(new Vector2(1, flipY ? -1 : 1));
    bbox.max
      .add(dataOffset)
      .multiplyScalar(dataScale)
      .multiply(new Vector2(1, flipY ? -1 : 1));

    // Ensure we didn't just break the bbox logic.
    if (bbox.max.x < bbox.min.x)
      [bbox.max.x, bbox.min.x] = [bbox.min.x, bbox.max.x];
    if (bbox.max.y < bbox.min.y)
      [bbox.max.y, bbox.min.y] = [bbox.min.y, bbox.max.y];

    // Omit degenerates.
    const bboxSize = new Vector2();
    bbox.getSize(bboxSize);
    if (bboxSize.x === 0 || bboxSize.y === 0) {
      console.warn("Found degenerate bbox from loop:", bbox, loop);
      continue;
    }

    // Build terrain.
    const terrain: API.MapTerrain = {
      id: shortid(),
      tileType: loopTileType,
      tileModifier: loopTileModifier,
      pos: terrainPos,
      bbox,
      polygon: simplePolygonVector2,
      convexComponentPolygons: decompedPolygonVector2s,
      decalTiles
    };
    allTerrain.push(terrain);
  }

  return allTerrain;
}
