export type ApiParam = {
  name: string;
  /** Human-readable type hint shown in completion docs. */
  type: string;
  description?: string;
  optional?: boolean;
};

export type FunctionEntry = {
  kind: "function";
  description?: string;
  params?: ApiParam[];
  returns?: string;
  /** Extra properties on the callable object itself (e.g. wait.async). */
  properties?: Record<string, ApiEntry>;
};

export type ObjectEntry = {
  kind: "object";
  description?: string;
  properties: Record<string, ApiEntry>;
};

export type ClassEntry = {
  kind: "class";
  description?: string;
  constructorParams?: ApiParam[];
  /**
   * Named properties of a single options-object argument to the constructor.
   * When the user types `new X({`, completions are drawn from here instead of
   * the positional constructorParams list.
   */
  constructorOpts?: Record<string, ApiEntry>;
  /** Instance properties / methods available on `new X()`. */
  properties: Record<string, ApiEntry>;
  /** Static properties / methods accessed on the class itself. */
  staticProperties?: Record<string, ApiEntry>;
};

export type ValueEntry = {
  kind: "value";
  description?: string;
  valueType: string;
};

export type ApiEntry = FunctionEntry | ObjectEntry | ClassEntry | ValueEntry;

export type ModuleManifest = {
  description?: string;
  /** The shape of the value returned by require("moduleName"). */
  export: ApiEntry;
};

export type SpellApiManifests = Record<string, ModuleManifest>;
