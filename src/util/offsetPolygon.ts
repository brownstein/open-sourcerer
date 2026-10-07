import { Feature, Polygon } from "geojson";
import { makeCCW } from "poly-decomp";
import polylineNormals from "polyline-normals";
import simplepolygon from "simplepolygon";

import { addArr2, arr2, copyArr2, scaleArr2 } from "src/engine/util/vecTypes";

export function insetPolygon(polygonIn: arr2[], amount: number): arr2[][] {
  // Ensure polygon is CCW.
  const rawCCWPolygon = [...polygonIn];
  makeCCW(rawCCWPolygon);

  // Inset the polygon using polyline normals.
  const vtxNormals = polylineNormals(rawCCWPolygon, true);
  const insetVerts: arr2[] = [];
  for (let i = 0; i < rawCCWPolygon.length; i++) {
    const vtx = rawCCWPolygon[i];
    const vtxNormal = vtxNormals[i];
    const pos = copyArr2(vtx);
    const delta = copyArr2(vtxNormal[0]);
    scaleArr2(delta, Math.min(3, vtxNormal[1] * amount));
    addArr2(pos, delta);
    insetVerts.push([pos[0], pos[1]]);
  }

  // Add first vertex to inset verts end, making it ciruclar.
  insetVerts.push(insetVerts[0]);

  // Handle self-intersections.
  const insetFeature: Feature<Polygon> = {
    type: "Feature",
    properties: {},
    geometry: {
      type: "Polygon",
      coordinates: [insetVerts]
    }
  };

  // Split the features, detect winding, filter the result.
  const splitInsetFeatures = simplepolygon(insetFeature);
  const results: arr2[][] = [];
  for (const feature of splitInsetFeatures.features) {
    const parent = feature.properties?.parent;
    const winding = feature.properties?.winding;
    if (winding < 0 || parent >= 0) continue;
    const polygon = feature.geometry;
    results.push(
      polygon.coordinates[0].slice(
        0,
        polygon.coordinates[0].length - 1
      ) as arr2[]
    );
  }
  return results;
}
