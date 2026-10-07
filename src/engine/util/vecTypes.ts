import { Box2, Vector2, Vector3 } from "three";

export type arr2 = [number, number];
export type arr3 = [number, number, number];

export interface IVector2 {
  x: number;
  y: number;
}
export interface IVector3 {
  x: number;
  y: number;
  z: number;
}

export type ReadPositionAttributes = {
  readonly x: number;
  readonly y: number;
  readonly z: number;
};

export type PositionAttribute = {
  x: number;
  y: number;
  z: number;
};

export type ReadSizeAttributes = {
  readonly width: number;
  readonly height: number;
};

export type SizeAttributes = {
  width: number;
  height: number;
};

export const cloneArr2 = (v: arr2): arr2 => [v[0], v[1]];
export const cloneArr3 = (v: arr3): arr3 => [v[0], v[1], v[2]];

export function posToSize(
  v: IVector2 | ReadPositionAttributes | arr2 | arr3
): SizeAttributes {
  if (Array.isArray(v))
    return {
      width: v[0],
      height: v[1]
    };
  return {
    width: v.x,
    height: v.y
  };
}

export function sizeToVector2(s: ReadSizeAttributes): Vector2 {
  return new Vector2(s.width, s.height);
}

export function sizeToVector3(s: ReadSizeAttributes): Vector3 {
  return new Vector3(s.width, s.height, 0);
}

export function sizeToArr2(s: ReadSizeAttributes): arr2 {
  return [s.width, s.height];
}

export function sizeToArr3(s: ReadSizeAttributes): arr3 {
  return [s.width, s.height, 0];
}

export function arr2Equal(a: arr2, b: arr2) {
  return a[0] === b[0] && a[1] === b[1];
}

export function arr3Equal(a: arr3, b: arr3) {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
}

export function arr2ToVector2(input: arr2) {
  return new Vector2(input[0], input[1]);
}

export function arr2ToIVector2(input: arr2) {
  return {
    x: input[0],
    y: input[1]
  };
}

export function vector2ToArr2(input: Vector2 | IVector2): arr2 {
  return [input.x, input.y];
}

export function arr3ToVector3(input: arr3) {
  return new Vector3(input[0], input[1], input[2]);
}

export function vector3ToArr3(input: Vector3 | IVector3): arr3 {
  return [input.x, input.y, input.z];
}

export function vector2To3(input: Vector2 | IVector2): Vector3 {
  return new Vector3(input.x, input.y, 0);
}

export function vector3To2(input: Vector3 | IVector3): Vector2 {
  return new Vector2(input.x, input.y);
}

export function toVector2(input: IVector2): Vector2 {
  return new Vector2(input.x, input.y);
}

export function toVector3(input: IVector3): Vector3 {
  return new Vector3(input.x, input.y, input.z);
}

export function copyArr2(input: number[]): arr2 {
  return [input[0], input[1]];
}

export function addArr2(a: arr2, b: arr2) {
  a[0] += b[0];
  a[1] += b[1];
  return a;
}

export function subArr2(a: arr2, b: arr2) {
  a[0] -= b[0];
  a[1] -= b[1];
  return a;
}

export function scaleArr2(a: arr2, b: number) {
  a[0] *= b;
  a[1] *= b;
  return a;
}

export function anyToVector2(input: unknown) {
  if (Array.isArray(input)) return new Vector2(input[0], input[1]);
  if (typeof input !== "object" || input === null) return new Vector2();
  if (
    "x" in input &&
    "y" in input &&
    typeof input.x === "number" &&
    typeof input.y === "number"
  )
    return new Vector2(input.x, input.y);
  return new Vector2();
}

export function anyToVector3(input: unknown) {
  if (Array.isArray(input)) return new Vector3(input[0], input[1], input[2]);
  if (typeof input !== "object" || input === null) return new Vector3();
  if (
    "x" in input &&
    "y" in input &&
    typeof input.x === "number" &&
    typeof input.y === "number"
  )
    return new Vector3(
      input.x,
      input.y,
      "z" in input && typeof input.z === "number" ? input.z : 0
    );
  return new Vector3();
}

export function isVector2(v: any): v is Vector2 {
  return v && (v as Vector2).isVector2;
}

export function isVector3(v: any): v is Vector3 {
  return v && (v as Vector3).isVector3;
}

export function isBox2(b: any): b is Box2 {
  // for some reason Box2 type definition doesn't have this defined
  return b && (b as any).isBox2;
}
