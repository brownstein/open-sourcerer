import { removeCollinearPoints } from "poly-decomp";
import clipping from "polygon-clipping";
import { Vector2 } from "three";

import { arr2, arr2ToVector2, vector2ToArr2 } from "src/engine/util/vecTypes";

import * as API from "./api";
import * as FORMAT from "./tiledJson";

const rawTypeStringToTileType: Record<string, API.TileType> = {
  ground: API.TileType.ground,
  decal: API.TileType.decal,
  platform: API.TileType.platform,
  onewayplatform: API.TileType.platform,
  slopediagleft: API.TileType.slopeLeft,
  slopediagright: API.TileType.slopeRight,
  stairsdiagleft: API.TileType.stairsLeft,
  stairsdiagright: API.TileType.stairsRight,
  platformdiagleft: API.TileType.platformStairsLeft,
  platformdiagright: API.TileType.platformStairsRight,
  spikes: API.TileType.spikes,
  water: API.TileType.water,
  waterfall: API.TileType.waterfall,
  ladder: API.TileType.ladder,
  cracks: API.TileType.cracks,
};

const vtxEpsilon = 0.05;

export function parseTileset(
  src: FORMAT.ITiledTileSetJSON
): API.TilesetTileDefs {
  const sheetInfo: API.TiledJsonSheetSrcInfo = {
    name: src.name,
    src,
    tileSize: new Vector2(src.tilewidth, src.tileheight),
    textureSize: new Vector2(src.imagewidth, src.imageheight)
  };

  const defs: API.TilesetTileDefs = {
    sheetInfo,
    defs: {},
    idToDefId: {}
  };

  const rowCount = Math.floor(src.imagewidth / src.tilewidth);

  // We will use this for tile polygon clipping.
  const tileBoundingSquare: arr2[][] = [
    [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1]
    ]
  ];

  for (const srcDef of src.tiles ?? []) {
    const srcX = src.tilewidth * (srcDef.id % rowCount);
    const srcY = src.tileheight * Math.floor(srcDef.id / rowCount);
    const tileDef: API.TileDef = {
      id: srcDef.id,
      rawTypeString: srcDef.class ?? srcDef.type,
      src: {
        id: srcDef.id,
        src: srcDef,
        sheet: sheetInfo
      },
      srcPos: new Vector2(srcX, srcY)
    };

    if (tileDef.rawTypeString) {
      tileDef.type =
        rawTypeStringToTileType[tileDef.rawTypeString.toLowerCase()];
    }

    const lowerCoordinateBound = new Vector2();
    const upperCoordinateBound = new Vector2(src.tilewidth, src.tileheight);

    if (srcDef.objectgroup) {
      const rawTilePolygons: arr2[][][] = [];
      for (const srcObj of srcDef.objectgroup.objects) {
        if (srcObj.polygon) {
          const rawTilePolygon: Vector2[] = srcObj.polygon.map(
            (pt) => new Vector2(pt.x + srcObj.x, pt.y + srcObj.y)
          );
          for (const vtx of rawTilePolygon) {
            vtx.clamp(lowerCoordinateBound, upperCoordinateBound);
          }
          if (srcObj.rotation) {
            for (const vtx of rawTilePolygon) {
              vtx.rotateAround(
                new Vector2(srcObj.x, srcObj.y),
                (srcObj.rotation * Math.PI) / 180
              );
            }
          }
          for (const vtx of rawTilePolygon) {
            vtx.multiply(new Vector2(1 / src.tilewidth, 1 / src.tileheight));
          }
          rawTilePolygons.push([rawTilePolygon.map(vector2ToArr2)]);
        } else {
          const rawTilePolygon: Vector2[] = [
            new Vector2(srcObj.x, srcObj.y),
            new Vector2(srcObj.x + srcObj.width, srcObj.y),
            new Vector2(srcObj.x + srcObj.width, srcObj.y + srcObj.height),
            new Vector2(srcObj.x, srcObj.y + srcObj.height)
          ];
          if (srcObj.rotation) {
            for (const vtx of rawTilePolygon) {
              vtx.rotateAround(
                new Vector2(srcObj.x, srcObj.y),
                (srcObj.rotation * Math.PI) / 180
              );
            }
          }
          for (const vtx of rawTilePolygon) {
            vtx.multiply(new Vector2(1 / src.tilewidth, 1 / src.tileheight));
          }
          rawTilePolygons.push([rawTilePolygon.map(vector2ToArr2)]);
        }
      }
      if (rawTilePolygons.length > 0) {
        const rawTileUnion = clipping.union(
          rawTilePolygons[0],
          ...rawTilePolygons.slice(1)
        );
        const rawTileIntersection = clipping.intersection(
          tileBoundingSquare,
          rawTileUnion
        );
        if (
          rawTileIntersection.length > 0 &&
          rawTileIntersection[0].length > 0
        ) {
          const rawClippedPolygon = rawTileIntersection[0][0];
          // Remove the last element of rawClippedPolygon - polygon-clipping has
          // an annoying habit of making the last vertex a duplicate of the first.
          rawClippedPolygon.length--;
          removeCollinearPoints(rawClippedPolygon, Math.PI * 0.2);

          // Skip shapes that have collapsed to fewer than 3 vertices or
          // enclose a vanishingly small area. Checking the polygon's signed
          // area avoids false positives from the legacy first-three-vertex
          // angle check, which rejected valid polygons whose first edge was
          // nearly parallel to the diagonal of its 0→2 chord.
          if (rawClippedPolygon.length < 3) continue;
          let signedAreaTwice = 0;
          for (let i = 0; i < rawClippedPolygon.length; i++) {
            const a = rawClippedPolygon[i];
            const b = rawClippedPolygon[(i + 1) % rawClippedPolygon.length];
            signedAreaTwice += a[0] * b[1] - b[0] * a[1];
          }
          if (Math.abs(signedAreaTwice) < 1e-4) continue;

          const clippedPolygon = rawClippedPolygon.map(arr2ToVector2);
          const tileShape: API.TileDefShape = {
            clippedPolygon,
            sidesClosed: {},
            sidesVertexIndices: {}
          };
          for (let vi = 0; vi < clippedPolygon.length; vi++) {
            const a = clippedPolygon[vi];
            const b = clippedPolygon[(vi + 1) % clippedPolygon.length];
            if (
              Math.abs(a.x - 0) <= vtxEpsilon &&
              Math.abs(b.x - 0) <= vtxEpsilon
            ) {
              tileShape.sidesClosed[API.TileSides.left] = true;
              if (
                tileShape.sidesVertexIndices[API.TileSides.left] === undefined
              ) {
                tileShape.sidesVertexIndices[API.TileSides.left] =
                  new Set<number>();
              }
              tileShape.sidesVertexIndices[API.TileSides.left].add(vi);
            }
            if (
              Math.abs(a.x - 1) <= vtxEpsilon &&
              Math.abs(b.x - 1) <= vtxEpsilon
            ) {
              tileShape.sidesClosed[API.TileSides.right] = true;
              if (
                tileShape.sidesVertexIndices[API.TileSides.right] === undefined
              ) {
                tileShape.sidesVertexIndices[API.TileSides.right] =
                  new Set<number>();
              }
              tileShape.sidesVertexIndices[API.TileSides.right].add(vi);
            }
            if (
              Math.abs(a.y - 0) <= vtxEpsilon &&
              Math.abs(b.y - 0) <= vtxEpsilon
            ) {
              tileShape.sidesClosed[API.TileSides.top] = true;
              if (
                tileShape.sidesVertexIndices[API.TileSides.top] === undefined
              ) {
                tileShape.sidesVertexIndices[API.TileSides.top] =
                  new Set<number>();
              }
              tileShape.sidesVertexIndices[API.TileSides.top].add(vi);
            }
            if (
              Math.abs(a.y - 1) <= vtxEpsilon &&
              Math.abs(b.y - 1) <= vtxEpsilon
            ) {
              tileShape.sidesClosed[API.TileSides.bottom] = true;
              if (
                tileShape.sidesVertexIndices[API.TileSides.bottom] === undefined
              ) {
                tileShape.sidesVertexIndices[API.TileSides.bottom] =
                  new Set<number>();
              }
              tileShape.sidesVertexIndices[API.TileSides.bottom].add(vi);
            }
          }
          tileDef.shape = tileShape;
        }
      }
    }

    defs.defs[tileDef.id] = tileDef;
    defs.idToDefId[tileDef.src.id] = tileDef.id;
  }

  // Fill in missing tile definitions as decals.
  const totalTiles =
    (src.imagewidth * src.imageheight) / (src.tilewidth * src.tileheight);
  for (let id = 0; id < totalTiles; id++) {
    if (defs.idToDefId[id]) continue;
    const srcX = src.tilewidth * (id % rowCount);
    const srcY = src.tileheight * Math.floor(id / rowCount);
    const tileDef: API.TileDef = {
      id,
      rawTypeString: "",
      src: {
        id,
        src: {
          id
        },
        sheet: sheetInfo
      },
      srcPos: new Vector2(srcX, srcY),
      type: API.TileType.decal
    };

    defs.defs[id] = tileDef;
    defs.idToDefId[id] = tileDef.id;
  }

  return defs;
}
