import { IRBBox } from "./types";

/**
 * Internal centered BBox helper - produces a centered bounding box that can be moved around
 * by reassigning the x and y attributes, but always produces a read signature of a read-only
 * bbox. Useful for expressive entity collision checking.
 */
export class CenteredBBox implements IRBBox {
  x: number;
  y: number;
  protected hw: number;
  protected hh: number;
  constructor(x: number, y: number, width: number, height: number) {
    this.x = x;
    this.y = y;
    this.hw = width * 0.5;
    this.hh = height * 0.5;
  }
  get xMin() {
    return this.x - this.hw;
  }
  get yMin() {
    return this.y - this.hh;
  }
  get xMax() {
    return this.x + this.hw;
  }
  get yMax() {
    return this.y + this.hh;
  }
  get width() {
    return this.hw * 2;
  }
  get height() {
    return this.hh * 2;
  }
  set width(value: number) {
    this.hw = value * 0.5;
  }
  set height(value: number) {
    this.hh = value * 0.5;
  }
  clone() {
    return new CenteredBBox(this.x, this.y, this.hw * 2, this.hh * 2);
  }
  copy(other: CenteredBBox) {
    this.x = other.x;
    this.y = other.y;
    this.hw = other.hw;
    this.hh = other.hh;
    return this;
  }
  add(x: number, y: number) {
    this.x += x;
    this.y += y;
    return this;
  }
  grow(delta: number) {
    this.hw += delta * 0.5;
    this.hh += delta * 0.5;
  }
  contains(x: number, y: number) {
    return this.xMin <= x && this.xMax >= x && this.yMin <= y && this.yMax >= y;
  }
}
