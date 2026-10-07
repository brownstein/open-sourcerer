// Sparse string-mapped grids intended to be used with integer indexes.
export class IndexedGrid<T> {
  private mapping = new Map<string, T>();
  set(x: number, y: number, value: T) {
    this.mapping.set(`${x}:${y}`, value);
  }
  has(x: number, y: number) {
    return this.mapping.has(`${x}:${y}`);
  }
  get(x: number, y: number) {
    return this.mapping.get(`${x}:${y}`);
  }
  delete(x: number, y: number) {
    this.mapping.delete(`${x}:${y}`);
  }
  clear() {
    this.mapping.clear();
  }
  get size() {
    return this.mapping.size;
  }
  forEach(cb: (arg: [[number, number], T]) => void) {
    for (const value of this) cb(value);
  }
  [Symbol.iterator]() {
    const mappingIt = this.mapping[Symbol.iterator]();
    const it: Iterator<
      [[number, number], T],
      [[number, number], T] | undefined,
      unknown
    > = {
      next: () => {
        const mappingNext = mappingIt.next();
        const mappingValue = mappingNext.value;
        const value: [[number, number], T] | undefined = mappingValue
          ? [
              mappingValue[0].split(":").map(Number) as [number, number],
              mappingValue[1]
            ]
          : undefined;
        if (mappingNext.done || value === undefined) {
          return {
            done: true,
            value
          };
        } else {
          return {
            value
          };
        }
      }
    };
    return it;
  }
}
