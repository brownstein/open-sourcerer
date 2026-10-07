// Utility types.
export type PrimitiveValue = boolean | number | string | null | undefined;
export function isPrimitiveValue(input: unknown): input is PrimitiveValue {
  switch (typeof input) {
    case "boolean":
    case "number":
    case "string":
    case "undefined":
      return true;
    default:
      return false;
  }
}

export type PerhapsArray<T> = T | T[];
export type SimpleNestedOrType<T> = PerhapsArray<
  | PrimitiveValue
  | T
  | {
      [key: string]: SimpleNestedOrType<T>;
    }
>;

export type Clazz<T, Args extends unknown[] = any[]> = new (...args: Args) => T;
