// Tile orientation algebra for Tiled's three flip flags. A tile's transform is
// "diagonal flip first, then horizontal, then vertical" (the same order the
// renderer and mergeTerrain apply), which makes (flipH, flipV, flipD) the
// dihedral group D4. Operations compose a mirror/rotation onto the current
// flags and renormalize back into the three booleans.

export type TileOrientation = {
  flipH: boolean;
  flipV: boolean;
  flipD: boolean;
};

export const IDENTITY_ORIENTATION: TileOrientation = {
  flipH: false,
  flipV: false,
  flipD: false
};

// 2x2 matrices [a, b, c, d] = [[a, b], [c, d]] acting on screen-space (x right,
// y down) coordinates.
type Mat = [number, number, number, number];

const IDENTITY: Mat = [1, 0, 0, 1];
const MIRROR_H: Mat = [-1, 0, 0, 1];
const MIRROR_V: Mat = [1, 0, 0, -1];
const TRANSPOSE: Mat = [0, 1, 1, 0];

function multiply(m1: Mat, m2: Mat): Mat {
  return [
    m1[0] * m2[0] + m1[1] * m2[2],
    m1[0] * m2[1] + m1[1] * m2[3],
    m1[2] * m2[0] + m1[3] * m2[2],
    m1[2] * m2[1] + m1[3] * m2[3]
  ];
}

function matrixFor(o: TileOrientation): Mat {
  let m = o.flipD ? TRANSPOSE : IDENTITY;
  if (o.flipH) m = multiply(MIRROR_H, m);
  if (o.flipV) m = multiply(MIRROR_V, m);
  return m;
}

const ALL_ORIENTATIONS: TileOrientation[] = [];
for (const flipD of [false, true]) {
  for (const flipH of [false, true]) {
    for (const flipV of [false, true]) {
      ALL_ORIENTATIONS.push({ flipH, flipV, flipD });
    }
  }
}

function orientationFor(m: Mat): TileOrientation {
  for (const o of ALL_ORIENTATIONS) {
    const candidate = matrixFor(o);
    if (candidate.every((v, i) => v === m[i])) return o;
  }
  throw new Error(`No orientation for matrix ${m}`);
}

function apply(operation: Mat, o: TileOrientation): TileOrientation {
  return orientationFor(multiply(operation, matrixFor(o)));
}

const ROTATE_CW = multiply(MIRROR_H, TRANSPOSE);
const ROTATE_CCW = multiply(MIRROR_V, TRANSPOSE);

export function flipOrientationH(o: TileOrientation): TileOrientation {
  return apply(MIRROR_H, o);
}

export function flipOrientationV(o: TileOrientation): TileOrientation {
  return apply(MIRROR_V, o);
}

export function rotateOrientationCW(o: TileOrientation): TileOrientation {
  return apply(ROTATE_CW, o);
}

export function rotateOrientationCCW(o: TileOrientation): TileOrientation {
  return apply(ROTATE_CCW, o);
}

export type OrientationOp = (o: TileOrientation) => TileOrientation;

/** Where a cell at (dx, dy) of a width×height stamp lands under the given
 *  orientation (an operation expressed as its effect on identity), normalized
 *  back into the positive quadrant of the (possibly transposed) result. */
export function transformStampOffset(
  dx: number,
  dy: number,
  width: number,
  height: number,
  orientation: TileOrientation
): { dx: number; dy: number } {
  const m = matrixFor(orientation);
  const x = m[0] * dx + m[1] * dy;
  const y = m[2] * dx + m[3] * dy;
  // Mirrored axes map the stamp box into negative coordinates; shift back by
  // the extent of whichever source axis feeds the output axis.
  const minX = m[0] < 0 ? -(width - 1) : m[1] < 0 ? -(height - 1) : 0;
  const minY = m[2] < 0 ? -(width - 1) : m[3] < 0 ? -(height - 1) : 0;
  return { dx: x - minX, dy: y - minY };
}
