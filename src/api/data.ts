export type PrimitiveData = boolean | number | string | null | undefined;
export type ComplexData =
  | { [key: string]: ComplexData }
  | ComplexData[]
  | PrimitiveData;

export type PrimitiveTypeName = "boolean" | "number" | "string";
export type PrimitiveTypeType = {
  boolean: boolean;
  number: number;
  string: string;
};

// Strings treated as boolean false (case-insensitive, trimmed).
const FALSEY_STRINGS = new Set(["", "false", "0"]);

function toBoolean(value: ComplexData): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0 && !Number.isNaN(value);
  if (typeof value === "string") {
    return !FALSEY_STRINGS.has(value.trim().toLowerCase());
  }
  return Boolean(value);
}

function toNumber(value: ComplexData): number {
  if (typeof value === "number") return value;
  const parsed = Number(typeof value === "string" ? value.trim() : value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toStringValue(value: ComplexData): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

/**
 * Infers the type of a string-authored value: `"true"`/`"false"` become
 * booleans, `"null"` becomes null, numeric strings become numbers, everything
 * else stays as it is. Non-strings pass through untouched.
 */
export function inferPrimitive(value: ComplexData): ComplexData {
  if (typeof value !== "string") return value ?? null;
  const trimmed = value.trim();
  if (trimmed === "") return "";
  const lowered = trimmed.toLowerCase();
  if (lowered === "true") return true;
  if (lowered === "false") return false;
  if (lowered === "null") return null;
  const parsed = Number(trimmed);
  if (Number.isFinite(parsed)) return parsed;
  return value;
}

/** Coerces any value to the requested primitive type. */
export function coercePrimitive<T extends PrimitiveTypeName>(
  type: T,
  value: ComplexData
): PrimitiveTypeType[T] {
  const coerced =
    type === "boolean"
      ? toBoolean(value)
      : type === "number"
        ? toNumber(value)
        : toStringValue(value);
  return coerced as PrimitiveTypeType[T];
}

/** Coerces to `forcedType` when given, otherwise infers the type. */
export function resolvePrimitive(
  value: ComplexData,
  forcedType?: PrimitiveTypeName
): ComplexData {
  return forcedType
    ? coercePrimitive(forcedType, value)
    : inferPrimitive(value);
}
