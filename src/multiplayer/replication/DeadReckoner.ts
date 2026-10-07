import { Vector2 } from "three";

import { EntityNetSummary, NetVec2 } from "../api";

/** How long a report correction blends out. Sharp course changes rubber-band
 *  over roughly this window instead of snapping. */
const DEFAULT_CORRECTION_MS = 140;

/** Reported-vs-rendered error beyond this snaps outright — that's a teleport
 *  or deflect, not drift. World units. */
const DEFAULT_SNAP_DISTANCE = 2;

/** Prediction stops extrapolating this long after the last report so a dead
 *  link doesn't send stubs sailing off forever. */
const MAX_EXTRAPOLATION_MS = 500;

/**
 * Second-order dead reckoning for network stubs.
 *
 * Stubs render at the *estimated current* position — `p0 + v*dt + 0.5*a*dt^2`
 * from the latest report — rather than interpolating on a delay. For ballistic
 * projectiles (constant acceleration) this is exact between course changes.
 * Incoming reports don't snap: the error between where prediction had the stub
 * and where the report puts it decays over a short blend window, restarted on
 * every report.
 *
 * The owner side runs the same projection via `predict()` to decide when
 * reality has drifted from what peers are predicting (threshold sends).
 */
export class DeadReckoner {
  private readonly p0 = new Vector2();
  private readonly v0 = new Vector2();
  private readonly a = new Vector2();
  private t0 = 0;
  /** Correction offset being blended out (renderedBefore - reported). */
  private readonly corr = new Vector2();
  private corrStartT = 0;
  private hasState = false;

  private readonly correctionMs: number;
  private readonly snapDistance: number;

  private readonly scratch = new Vector2();

  constructor(options?: { correctionMs?: number; snapDistance?: number }) {
    this.correctionMs = options?.correctionMs ?? DEFAULT_CORRECTION_MS;
    this.snapDistance = options?.snapDistance ?? DEFAULT_SNAP_DISTANCE;
  }

  /** Pure projection of a summary's motion state to `dtMs` in its future. */
  static predict(summary: EntityNetSummary, dtMs: number, out: Vector2): Vector2 {
    const dt = Math.min(dtMs, MAX_EXTRAPOLATION_MS) * 0.001;
    const vel = (summary.vel ?? { x: 0, y: 0 }) as NetVec2;
    const acc = (summary.acc ?? { x: 0, y: 0 }) as NetVec2;
    out.set(
      summary.pos.x + vel.x * dt + 0.5 * acc.x * dt * dt,
      summary.pos.y + vel.y * dt + 0.5 * acc.y * dt * dt
    );
    return out;
  }

  applySummary(summary: EntityNetSummary, nowMs: number): void {
    if (this.hasState) {
      // Where prediction currently has the stub (including any live blend).
      const rendered = this.sample(nowMs, this.scratch);
      const errX = rendered.x - summary.pos.x;
      const errY = rendered.y - summary.pos.y;
      const errSq = errX * errX + errY * errY;
      if (errSq > this.snapDistance * this.snapDistance) {
        this.corr.set(0, 0);
      } else {
        this.corr.set(errX, errY);
      }
      this.corrStartT = nowMs;
    }
    this.p0.set(summary.pos.x, summary.pos.y);
    const vel = summary.vel ?? { x: 0, y: 0 };
    const acc = summary.acc ?? { x: 0, y: 0 };
    this.v0.set(vel.x, vel.y);
    this.a.set(acc.x, acc.y);
    this.t0 = nowMs;
    this.hasState = true;
  }

  /** Estimated position now; blends out any outstanding report correction. */
  sample(nowMs: number, out: Vector2): Vector2 {
    if (!this.hasState) return out.set(0, 0);
    const dt = Math.min(nowMs - this.t0, MAX_EXTRAPOLATION_MS) * 0.001;
    out.set(
      this.p0.x + this.v0.x * dt + 0.5 * this.a.x * dt * dt,
      this.p0.y + this.v0.y * dt + 0.5 * this.a.y * dt * dt
    );
    const corrAge = nowMs - this.corrStartT;
    if (corrAge < this.correctionMs && this.corr.lengthSq() > 0) {
      const remaining = 1 - corrAge / this.correctionMs;
      out.x += this.corr.x * remaining;
      out.y += this.corr.y * remaining;
    }
    return out;
  }

  /** Estimated velocity now (for facing/impulse decisions on stubs). */
  sampleVelocity(nowMs: number, out: Vector2): Vector2 {
    if (!this.hasState) return out.set(0, 0);
    const dt = Math.min(nowMs - this.t0, MAX_EXTRAPOLATION_MS) * 0.001;
    return out.set(this.v0.x + this.a.x * dt, this.v0.y + this.a.y * dt);
  }

  isInitialized(): boolean {
    return this.hasState;
  }
}
