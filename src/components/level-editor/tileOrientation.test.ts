import {
  IDENTITY_ORIENTATION,
  TileOrientation,
  flipOrientationH,
  flipOrientationV,
  rotateOrientationCCW,
  rotateOrientationCW,
  transformStampOffset
} from "./tileOrientation";

const ALL_ORIENTATIONS: TileOrientation[] = [];
for (const flipD of [false, true]) {
  for (const flipH of [false, true]) {
    for (const flipV of [false, true]) {
      ALL_ORIENTATIONS.push({ flipH, flipV, flipD });
    }
  }
}

describe("tileOrientation", () => {
  test("rotate CW cycles through Tiled's documented flag states", () => {
    // Tiled encodes 90° CW as D+H, 180° as H+V, 270° as D+V.
    const cw1 = rotateOrientationCW(IDENTITY_ORIENTATION);
    expect(cw1).toEqual({ flipH: true, flipV: false, flipD: true });
    const cw2 = rotateOrientationCW(cw1);
    expect(cw2).toEqual({ flipH: true, flipV: true, flipD: false });
    const cw3 = rotateOrientationCW(cw2);
    expect(cw3).toEqual({ flipH: false, flipV: true, flipD: true });
    const cw4 = rotateOrientationCW(cw3);
    expect(cw4).toEqual(IDENTITY_ORIENTATION);
  });

  test("flips toggle their own flag from identity", () => {
    expect(flipOrientationH(IDENTITY_ORIENTATION)).toEqual({
      flipH: true,
      flipV: false,
      flipD: false
    });
    expect(flipOrientationV(IDENTITY_ORIENTATION)).toEqual({
      flipH: false,
      flipV: true,
      flipD: false
    });
  });

  test("CW then CCW is identity for every orientation", () => {
    for (const o of ALL_ORIENTATIONS) {
      expect(rotateOrientationCCW(rotateOrientationCW(o))).toEqual(o);
    }
  });

  test("double flips are identity for every orientation", () => {
    for (const o of ALL_ORIENTATIONS) {
      expect(flipOrientationH(flipOrientationH(o))).toEqual(o);
      expect(flipOrientationV(flipOrientationV(o))).toEqual(o);
    }
  });

  test("flip H after 90° CW differs from 90° CW after flip H", () => {
    // D4 is non-abelian; this guards against accidentally commutative
    // implementations (e.g. independent flag toggles).
    const a = flipOrientationH(rotateOrientationCW(IDENTITY_ORIENTATION));
    const b = rotateOrientationCW(flipOrientationH(IDENTITY_ORIENTATION));
    expect(a).not.toEqual(b);
  });

  test("stamp offsets rotate like the tiles do", () => {
    const cw = rotateOrientationCW(IDENTITY_ORIENTATION);
    const mirrorH = flipOrientationH(IDENTITY_ORIENTATION);
    // 2 wide × 3 tall stamp rotated CW becomes 3 wide × 2 tall; the
    // bottom-left cell lands at the top-left.
    expect(transformStampOffset(0, 2, 2, 3, cw)).toEqual({ dx: 0, dy: 0 });
    expect(transformStampOffset(0, 0, 2, 3, cw)).toEqual({ dx: 2, dy: 0 });
    expect(transformStampOffset(1, 2, 2, 3, cw)).toEqual({ dx: 0, dy: 1 });
    // Horizontal mirror keeps rows, mirrors columns.
    expect(transformStampOffset(0, 1, 3, 2, mirrorH)).toEqual({
      dx: 2,
      dy: 1
    });
  });

  test("every orientation round-trips through a full CW revolution", () => {
    for (const o of ALL_ORIENTATIONS) {
      let cur = o;
      for (let i = 0; i < 4; i++) cur = rotateOrientationCW(cur);
      expect(cur).toEqual(o);
    }
  });
});
