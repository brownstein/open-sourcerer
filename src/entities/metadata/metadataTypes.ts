// Relative, not aliased: the entity-doc script compiles this file outside the
// app tsconfig, where the `src/*` path alias does not resolve.
import { PrimitiveTypeName } from "../../api/data";

export type { PrimitiveTypeName };

/** Shape of a serializable prop value, for tooling that renders editors. */
export type ValueSchema =
  | {
      kind: PrimitiveTypeName;
      enumValues?: string[];
      multiline?: boolean;
    }
  | { kind: "array"; element: ValueSchema }
  | {
      kind: "object";
      members: { name: string; optional: boolean; schema: ValueSchema }[];
    }
  /** An object with arbitrary string keys, e.g. `Record<string, V>`. */
  | { kind: "record"; value: ValueSchema }
  /** A Tiled object id pointing at another object in the same map. */
  | { kind: "entityRef" };

export type EntityArgEntry = {
  name: string;
  /** The type as written in the source, for docs and tooltips. */
  type: string;
  optional: boolean;
  defaultValue?: string | number | boolean;
  /** Present when the arg has a data representation, so tooling can edit it. */
  schema?: ValueSchema;
};

export type EntityTypeSignature = {
  name: string;
  docString?: string;
  sourceFile: string;
  args: EntityArgEntry[];
};
