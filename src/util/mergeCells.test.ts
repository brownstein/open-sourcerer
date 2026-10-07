import { arr2 } from "src/engine/util/vecTypes";

import { MergeCellInput, mergeCellsToPolygons } from "./mergeCells";
import { getArea } from "./polygons";

const full = (gx: number, gy: number): MergeCellInput => ({
  gx,
  gy,
  full: true
});

const edge = (gx: number, gy: number, poly: arr2[]): MergeCellInput => ({
  gx,
  gy,
  full: false,
  edgePoly: poly
});

// Net covered area = sum of outer areas minus hole areas.
const netArea = (cells: MergeCellInput[], cellSize = 1, ox = 0, oy = 0) => {
  const shapes = mergeCellsToPolygons(cells, cellSize, ox, oy);
  let total = 0;
  for (const s of shapes) {
    total += getArea(s.outer);
    for (const h of s.holes) total -= getArea(h);
  }
  return { shapes, total };
};

describe("mergeCellsToPolygons", () => {
  it("returns a unit square for a single full cell", () => {
    const { shapes, total } = netArea([full(0, 0)]);
    expect(shapes).toHaveLength(1);
    expect(shapes[0].holes).toHaveLength(0);
    expect(shapes[0].outer).toHaveLength(4);
    expect(total).toBeCloseTo(1, 6);
  });

  it("scales by cellSize and origin", () => {
    const { shapes, total } = netArea([full(0, 0)], 0.125, 3, -2);
    expect(shapes).toHaveLength(1);
    expect(total).toBeCloseTo(0.125 * 0.125, 6);
    // All vertices within the cell's world bounds.
    for (const [x, y] of shapes[0].outer) {
      expect(x).toBeGreaterThanOrEqual(3 - 1e-9);
      expect(x).toBeLessThanOrEqual(3 + 0.125 + 1e-9);
      expect(y).toBeGreaterThanOrEqual(-2 - 1e-9);
      expect(y).toBeLessThanOrEqual(-2 + 0.125 + 1e-9);
    }
  });

  it("merges a 2x2 block into one square with 4 corners", () => {
    const { shapes, total } = netArea([
      full(0, 0),
      full(1, 0),
      full(0, 1),
      full(1, 1)
    ]);
    expect(shapes).toHaveLength(1);
    expect(shapes[0].outer).toHaveLength(4);
    expect(total).toBeCloseTo(4, 6);
  });

  it("traces a concave L-shape as a single loop", () => {
    const { shapes, total } = netArea([full(0, 0), full(1, 0), full(0, 1)]);
    expect(shapes).toHaveLength(1);
    expect(shapes[0].holes).toHaveLength(0);
    expect(shapes[0].outer).toHaveLength(6); // concave hexagon
    expect(total).toBeCloseTo(3, 6);
  });

  it("produces an outer ring with a hole for a donut", () => {
    const cells: MergeCellInput[] = [];
    for (let x = 0; x < 3; x++) {
      for (let y = 0; y < 3; y++) {
        if (x === 1 && y === 1) continue;
        cells.push(full(x, y));
      }
    }
    const { shapes, total } = netArea(cells);
    expect(shapes).toHaveLength(1);
    expect(shapes[0].holes).toHaveLength(1);
    expect(getArea(shapes[0].outer)).toBeCloseTo(9, 6);
    expect(getArea(shapes[0].holes[0])).toBeCloseTo(1, 6);
    expect(total).toBeCloseTo(8, 6);
  });

  it("keeps disjoint clusters as separate polygons", () => {
    const { shapes, total } = netArea([full(0, 0), full(5, 5)]);
    expect(shapes).toHaveLength(2);
    expect(total).toBeCloseTo(2, 6);
  });

  it("keeps diagonally-touching cells as two non-crossing loops", () => {
    const { shapes, total } = netArea([full(0, 0), full(1, 1)]);
    expect(shapes).toHaveLength(2);
    expect(total).toBeCloseTo(2, 6);
  });

  it("preserves a single edge cell's clipped triangle outline", () => {
    // Right triangle filling the lower-left half of cell (0,0).
    const { shapes, total } = netArea([
      edge(0, 0, [
        [0, 0],
        [1, 0],
        [0, 1]
      ])
    ]);
    expect(shapes).toHaveLength(1);
    expect(shapes[0].outer).toHaveLength(3); // a triangle, not a square
    expect(total).toBeCloseTo(0.5, 6);
  });

  it("stitches a full cell to a neighbouring edge cell across their shared side", () => {
    // Full cell at (0,0); triangle in (1,0) solid along the full shared x=1 line.
    const { shapes, total } = netArea([
      full(0, 0),
      edge(1, 0, [
        [1, 0],
        [2, 1],
        [1, 1]
      ])
    ]);
    expect(shapes).toHaveLength(1); // merged into one loop
    expect(total).toBeCloseTo(1.5, 6);
  });

  it("trims the shared side between two edge cells that meet it differently", () => {
    // Left edge cell solid on x=1 over y in [0,1]; right edge cell solid on x=1
    // over y in [0, 0.5] only. The lower half cancels; the upper half survives.
    const left = edge(0, 0, [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1]
    ]); // actually a full square via edgePoly
    const right = edge(1, 0, [
      [1, 0],
      [2, 0],
      [2, 1],
      [1, 0.5]
    ]);
    const { shapes, total } = netArea([left, right]);
    // Areas: left square = 1, right quad = trapezoid.
    // right quad (1,0),(2,0),(2,1),(1,0.5): shoelace area = 0.75.
    expect(shapes).toHaveLength(1);
    expect(total).toBeCloseTo(1.75, 6);
  });

  it("returns nothing for an empty input", () => {
    expect(mergeCellsToPolygons([], 1, 0, 0)).toHaveLength(0);
  });

  // Detects whether a polygon ring has any non-adjacent edge crossing.
  const selfIntersects = (p: arr2[]): boolean => {
    const cross = (a: arr2, b: arr2, c: arr2) =>
      (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    const proper = (a: arr2, b: arr2, c: arr2, d: arr2) => {
      const d1 = cross(c, d, a);
      const d2 = cross(c, d, b);
      const d3 = cross(a, b, c);
      const d4 = cross(a, b, d);
      return (
        ((d1 > 1e-9 && d2 < -1e-9) || (d1 < -1e-9 && d2 > 1e-9)) &&
        ((d3 > 1e-9 && d4 < -1e-9) || (d3 < -1e-9 && d4 > 1e-9))
      );
    };
    for (let i = 0; i < p.length; i++) {
      for (let j = i + 1; j < p.length; j++) {
        if (j === i || j === (i + 1) % p.length || i === (j + 1) % p.length) {
          continue;
        }
        if (
          proper(p[i], p[(i + 1) % p.length], p[j], p[(j + 1) % p.length])
        ) {
          return true;
        }
      }
    }
    return false;
  };

  const assertSimple = (shapes: ReturnType<typeof netArea>["shapes"]) => {
    for (const s of shapes) {
      expect(selfIntersects(s.outer)).toBe(false);
      for (const h of s.holes) expect(selfIntersects(h)).toBe(false);
    }
  };

  it("conserves area & stays simple for random full-cell fields", () => {
    // Deterministic LCG so the test is reproducible.
    let seed = 123456789;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    for (let trial = 0; trial < 1000; trial++) {
      const set = new Set<string>();
      const cells: MergeCellInput[] = [];
      const n = 5 + Math.floor(rand() * 60);
      for (let i = 0; i < n; i++) {
        const gx = Math.floor(rand() * 8);
        const gy = Math.floor(rand() * 8);
        const k = `${gx},${gy}`;
        if (set.has(k)) continue;
        set.add(k);
        cells.push(full(gx, gy));
      }
      const { shapes, total } = netArea(cells);
      expect(total).toBeCloseTo(set.size, 6);
      assertSimple(shapes);
    }
  });

  it("conserves area for random mixed full + edge-cell fields", () => {
    let seed = 987654321;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    // The four half-cell triangles (CCW), keyed by which corner is cut off.
    const triangles = (gx: number, gy: number): arr2[][] => [
      [
        [gx, gy],
        [gx + 1, gy],
        [gx, gy + 1]
      ],
      [
        [gx + 1, gy],
        [gx + 1, gy + 1],
        [gx, gy]
      ],
      [
        [gx + 1, gy],
        [gx + 1, gy + 1],
        [gx, gy + 1]
      ],
      [
        [gx, gy],
        [gx + 1, gy + 1],
        [gx, gy + 1]
      ]
    ];
    for (let trial = 0; trial < 400; trial++) {
      const seen = new Set<string>();
      const cells: MergeCellInput[] = [];
      let expected = 0;
      const n = 5 + Math.floor(rand() * 40);
      for (let i = 0; i < n; i++) {
        const gx = Math.floor(rand() * 7);
        const gy = Math.floor(rand() * 7);
        const k = `${gx},${gy}`;
        if (seen.has(k)) continue;
        seen.add(k);
        if (rand() < 0.5) {
          cells.push(full(gx, gy));
          expected += 1;
        } else {
          const tri = triangles(gx, gy)[Math.floor(rand() * 4)];
          cells.push(edge(gx, gy, tri));
          expected += 0.5;
        }
      }
      const { total } = netArea(cells);
      expect(total).toBeCloseTo(expected, 5);
    }
  });
});
