import { ITiledListElement } from "./tiledJson";

/**
 * translation between Tiled's "list" custom property format and
 * the plain JS arrays the rest of the codebase works with.
 */

// collapse a Tiled list value into a plain array
export function unwrapTiledList(value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  return value.map((element) =>
    element && typeof element === "object" && "value" in element
      ? unwrapTiledList((element as ITiledListElement).value)
      : element
  );
}

function inferTiledElementType(value: unknown): string {
  if (typeof value === "boolean") return "bool";
  if (typeof value === "number") {
    return Number.isInteger(value) ? "int" : "float";
  }
  return "string";
}

// Wrap a plain array into Tiled's list element form
export function wrapTiledList(value: unknown[]): ITiledListElement[] {
  return value.map((element) =>
    Array.isArray(element)
      ? { type: "list", value: wrapTiledList(element) }
      : { type: inferTiledElementType(element), value: element }
  );
}
