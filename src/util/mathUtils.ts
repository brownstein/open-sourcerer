import { Vector3 } from "three";

export function ClampNumberToMinMax(num: number, min: number, max: number) {
  return Math.max(min, Math.min(max, num));
}

export function approxEqual(num1: number, num2: number, epsilon: number) {
  return Math.abs(num1 - num2) <= epsilon;
}

export function toRadians(numDegrees: number) {
  return numDegrees * (Math.PI / 180);
}

export function toDegrees(numRadians: number) {
  return numRadians * (180 / Math.PI);
}

export function distance3DTo2D(vecFrom: Vector3, vecTo: Vector3): number {
  const vecFromZ = vecFrom.z;
  const vecToZ = vecTo.z;

  vecFrom.z = 0;
  vecTo.z = 0;

  const distance2D = vecFrom.distanceTo(vecTo);

  vecFrom.z = vecFromZ;
  vecTo.z = vecToZ;

  return distance2D;
}
