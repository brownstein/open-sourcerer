/**
 * Utility function to calculate jump height given initial velocity
 */
export function jumpHeightFromVelocity(jumpVelocity: number, gravity: number) {
  return (0.5 * jumpVelocity * jumpVelocity) / gravity;
}

/**
 * Utility function to calculate jump velocity from jump height
 */
export function jumpVelocityFromHeight(jumpHeight: number, gravity: number) {
  const velSq = jumpHeight / (1 / -gravity + 1 / (2 * gravity * gravity));
  return Math.sqrt(velSq);
}

/**
 * Utility function to get the latter time of approach given:
 * - acc: accelleration
 * - v0: initial velocity
 * - dist: distance to cover
 */
export function getTimeOfApproach(
  acc: number,
  v0: number,
  dist: number
): number {
  const hApex = (0.5 * v0 * v0) / acc;
  const tApex = v0 / acc;
  const hApexDelta = hApex - dist;
  let tSinceApexSq = (2 * hApexDelta) / acc;
  if (tSinceApexSq < 0) return -1;
  const tSinceApex = Math.sqrt(tSinceApexSq);
  const tFinal = tApex + tSinceApex;
  return tFinal;
}

/**
 * Utility function to get distance necessary to accelerate to a given distance
 * given an initial velocity
 */
export function distToAccelerate(v0: number, v1: number, a: number) {
  const t = Math.abs((v1 - v0) / a);
  const accMult = v1 >= v0 ? 1 : -1;
  return a * 0.5 * t * t * accMult + t * v0;
}

/**
 * Utility function to get accelleration given a time of intercept, distance,
 * and initial velocity
 */
export function getAcceleration(dist: number, v0: number, t: number) {
  return (2 * (dist - v0 * t)) / (t * t);
}
