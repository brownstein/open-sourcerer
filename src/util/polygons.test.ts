import { arr2 } from "src/engine/util/vecTypes";

import { mergeHolesIntoPolygon } from "./polygons";

describe("mergeHolesIntoPolygon", () => {
  it("Merges a hole with an outer winding for a polygon.", () => {
    const poly: arr2[] = [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1]
    ];
    const hole = poly.map(([x, y]) => [x * 0.5, y * 0.5] as arr2);
    const result = mergeHolesIntoPolygon(poly, hole);
    expect(result.length).toEqual(10);
  });
});
