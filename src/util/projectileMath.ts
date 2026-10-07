import { Vector2 } from "three";

import { kWorldGravity } from "src/engine/level/Level";

// Calculates the projectile angle necessary to intercept a given relative position.
export function calculateProjectileAngleToInterncept(
  relativePos: Vector2,
  speed: number,
  nearestSolution?: true,
  directPath?: boolean,
  gravity?: number
): number;
export function calculateProjectileAngleToInterncept(
  relativePos: Vector2,
  speed: number,
  nearestSolution?: false,
  directPath?: boolean,
  gravity?: number
): number | null;
export function calculateProjectileAngleToInterncept(
  relativePos: Vector2,
  speed: number,
  nearestSolution: boolean = true,
  directPath: boolean = true,
  gravity: number = kWorldGravity.y
): number | null {
  // Blame https://gamedev.stackexchange.com/questions/104226/calculating-pitch-angle-to-hit-a-target-using-a-projectile-that-has-fixed-speed.
  const { x, y } = relativePos;

  const rawAngle = Math.atan2(y, x);
  if (gravity === 0) return rawAngle;

  const speedSq = speed * speed;
  const speedQd = speedSq * speedSq;
  const rightTermSq = speedQd + gravity * (-gravity * x * x + 2 * y * speedSq);

  if (rightTermSq < 0) {
    if (!nearestSolution) return null;
    return Math.atan2(speedSq, -gravity * x);
  }

  if (directPath) {
    return Math.atan2(speedSq - Math.sqrt(rightTermSq), -gravity * x);
  } else {
    return Math.atan2(speedSq + Math.sqrt(rightTermSq), -gravity * x);
  }
}

export function calculateProjectilePositionAtTime(
  relativePos: Vector2,
  speed: number,
  angle: number,
  time: number,
  gravity: number = kWorldGravity.y
) {
  const vx = speed * Math.cos(angle);
  const vy = speed * Math.sin(angle);

  const t = time;
  const px = relativePos.x + vx * t;
  const py = relativePos.y + vy * t + 0.5 * gravity * t * t;
  return new Vector2(px, py);
}
