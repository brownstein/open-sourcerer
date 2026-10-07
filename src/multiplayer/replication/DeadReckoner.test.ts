import { Vector2 } from "three";

import { DeadReckoner } from "./DeadReckoner";

describe("DeadReckoner", () => {
  const out = new Vector2();

  it("projects ballistic motion exactly between reports", () => {
    const reckoner = new DeadReckoner();
    reckoner.applySummary(
      { pos: { x: 0, y: 0 }, vel: { x: 1, y: 2 }, acc: { x: 0, y: -10 } },
      0
    );
    reckoner.sample(500, out);
    // x = 1 * 0.5; y = 2 * 0.5 - 5 * 0.25
    expect(out.x).toBeCloseTo(0.5, 5);
    expect(out.y).toBeCloseTo(-0.25, 5);
  });

  it("projects velocity with acceleration", () => {
    const reckoner = new DeadReckoner();
    reckoner.applySummary(
      { pos: { x: 0, y: 0 }, vel: { x: 3, y: 0 }, acc: { x: 0, y: -10 } },
      0
    );
    reckoner.sampleVelocity(200, out);
    expect(out.x).toBeCloseTo(3, 5);
    expect(out.y).toBeCloseTo(-2, 5);
  });

  it("blends small corrections instead of snapping", () => {
    const reckoner = new DeadReckoner({ correctionMs: 100 });
    reckoner.applySummary({ pos: { x: 0, y: 0 }, vel: { x: 0, y: 0 } }, 0);
    // Report says the entity is actually at x=0.5 — a 0.5 unit error.
    reckoner.applySummary({ pos: { x: 0.5, y: 0 }, vel: { x: 0, y: 0 } }, 50);
    // Immediately after the report the rendered position still holds most of
    // the old estimate (correction is full).
    reckoner.sample(51, out);
    expect(out.x).toBeLessThan(0.1);
    // After the blend window the correction has fully decayed.
    reckoner.sample(50 + 150, out);
    expect(out.x).toBeCloseTo(0.5, 5);
  });

  it("snaps outright past the snap threshold (teleport/deflect)", () => {
    const reckoner = new DeadReckoner({ snapDistance: 2 });
    reckoner.applySummary({ pos: { x: 0, y: 0 }, vel: { x: 0, y: 0 } }, 0);
    reckoner.applySummary({ pos: { x: 10, y: 0 }, vel: { x: 0, y: 0 } }, 50);
    reckoner.sample(51, out);
    expect(out.x).toBeCloseTo(10, 5);
  });

  it("stops extrapolating after the cap so dead links don't run away", () => {
    const reckoner = new DeadReckoner();
    reckoner.applySummary({ pos: { x: 0, y: 0 }, vel: { x: 1, y: 0 } }, 0);
    reckoner.sample(10_000, out);
    // Clamped at 500ms of extrapolation.
    expect(out.x).toBeCloseTo(0.5, 5);
  });

  it("static predict matches instance projection", () => {
    const summary = {
      pos: { x: 1, y: 2 },
      vel: { x: -1, y: 0 },
      acc: { x: 0, y: -4 }
    };
    DeadReckoner.predict(summary, 250, out);
    expect(out.x).toBeCloseTo(1 - 0.25, 5);
    expect(out.y).toBeCloseTo(2 - 2 * 0.0625, 5);
  });
});
