/**
 * Andrew's monotone chain convex hull from flat xy pairs.
 * Returns a new flat array of xy pairs in CCW winding order.
 */
export function convexHull2D(flat: number[]): number[] {
  const n = flat.length / 2;
  if (n < 3) return [...flat];

  // Build array of [x, y] and sort by x then y
  const pts: [number, number][] = [];
  for (let i = 0; i < flat.length; i += 2) {
    pts.push([flat[i], flat[i + 1]]);
  }
  pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);

  // Cross product of vectors OA and OB where O=o, A=a, B=b
  const cross = (o: [number, number], a: [number, number], b: [number, number]) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

  // Lower hull
  const lower: [number, number][] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }

  // Upper hull
  const upper: [number, number][] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }

  // Remove last point of each half because it's repeated
  lower.pop();
  upper.pop();

  const hull = lower.concat(upper);
  const result: number[] = [];
  for (const [x, y] of hull) {
    result.push(x, y);
  }
  return result;
}
