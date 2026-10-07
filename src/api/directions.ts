import { Vector2 } from "three";

export enum Direction {
  up = "up",
  down = "down",
  left = "left",
  right = "right"
}

export const oppositeDirection: Record<Direction, Direction> = {
  [Direction.up]: Direction.down,
  [Direction.down]: Direction.up,
  [Direction.left]: Direction.right,
  [Direction.right]: Direction.left
};

export function getOppositeDirection(direction: Direction) {
  return oppositeDirection[direction];
}

export const directionalVector: Readonly<Record<Direction, Vector2>> = {
  [Direction.up]: new Vector2(0, 1),
  [Direction.down]: new Vector2(0, -1),
  [Direction.left]: new Vector2(-1, 0),
  [Direction.right]: new Vector2(1, 0)
};

export function getDirectionalVector(direction: Direction) {
  return directionalVector[direction];
}
