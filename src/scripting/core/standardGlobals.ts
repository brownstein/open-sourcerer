import {
  ApiEntry,
  ApiParam,
  FunctionEntry,
  ValueEntry
} from "./apiManifest";

// Builders that preserve the discriminating `kind` literal — TypeScript widens
// `kind: "function"` to `string` in inline object literals when the property
// name overlaps with Object.prototype (e.g. `toString`, `valueOf`), which
// breaks discriminated-union narrowing against `ApiEntry`. Wrapping
// construction in a typed helper sidesteps that.
const fn = (
  opts: {
    params?: ApiParam[];
    returns?: string;
    description?: string;
    properties?: Record<string, ApiEntry>;
  } = {}
): FunctionEntry => ({ kind: "function", ...opts });

const val = (
  valueType: string,
  description?: string
): ValueEntry => ({ kind: "value", valueType, description });

// Built-in JS globals available to spell code at runtime. The spell runtime is
// JS-Interpreter (ES5 semantics) with a Promise polyfill injected at startup,
// so we expose ES5 surface area plus Promise. Deliberately NOT included:
// Map/Set/WeakMap/WeakSet, Symbol, Proxy/Reflect, typed arrays (Float32Array
// etc.), BigInt, Promise.allSettled/any, Object.assign/entries/values,
// Array.from/of/find/includes, String.includes/startsWith/endsWith — these
// don't exist in the ES5 runtime even though source code is transpiled to ES5
// (transpile only rewrites syntax, not missing builtins).
//
// Function-valued entries use kind: "function" so the manifest-driven
// completion code shows `name(` as the inserted value. Static helpers on
// "class" entries live under `staticProperties`; instance method/property
// completions live under `properties` and are surfaced when isInstance=true.

const numberMethods: Record<string, ApiEntry> = {
  toString: fn({
    description: "Returns a string representation of the number.",
    params: [{ name: "radix", type: "number", optional: true }],
    returns: "string"
  }),
  toFixed: fn({
    description: "Formats a number with a fixed number of decimals.",
    params: [{ name: "digits", type: "number", optional: true }],
    returns: "string"
  }),
  toExponential: fn({
    description: "Formats a number in exponential notation.",
    params: [{ name: "digits", type: "number", optional: true }],
    returns: "string"
  }),
  toPrecision: fn({
    description: "Formats a number with the specified precision.",
    params: [{ name: "precision", type: "number", optional: true }],
    returns: "string"
  }),
  valueOf: fn({
    description: "Returns the primitive value of the Number object.",
    returns: "number"
  })
};

const stringMethods: Record<string, ApiEntry> = {
  length: val("number", "String length."),
  charAt: fn({
    params: [{ name: "index", type: "number" }],
    returns: "string"
  }),
  charCodeAt: fn({
    params: [{ name: "index", type: "number" }],
    returns: "number"
  }),
  concat: fn({
    params: [{ name: "...strings", type: "string[]" }],
    returns: "string"
  }),
  indexOf: fn({
    params: [
      { name: "search", type: "string" },
      { name: "from", type: "number", optional: true }
    ],
    returns: "number"
  }),
  lastIndexOf: fn({
    params: [
      { name: "search", type: "string" },
      { name: "from", type: "number", optional: true }
    ],
    returns: "number"
  }),
  match: fn({
    params: [{ name: "regexp", type: "RegExp | string" }],
    returns: "string[] | null"
  }),
  replace: fn({
    params: [
      { name: "pattern", type: "RegExp | string" },
      { name: "replacement", type: "string | function" }
    ],
    returns: "string"
  }),
  search: fn({
    params: [{ name: "regexp", type: "RegExp" }],
    returns: "number"
  }),
  slice: fn({
    params: [
      { name: "start", type: "number" },
      { name: "end", type: "number", optional: true }
    ],
    returns: "string"
  }),
  split: fn({
    params: [
      { name: "separator", type: "string | RegExp" },
      { name: "limit", type: "number", optional: true }
    ],
    returns: "string[]"
  }),
  substr: fn({
    params: [
      { name: "start", type: "number" },
      { name: "length", type: "number", optional: true }
    ],
    returns: "string"
  }),
  substring: fn({
    params: [
      { name: "start", type: "number" },
      { name: "end", type: "number", optional: true }
    ],
    returns: "string"
  }),
  toLowerCase: fn({ returns: "string" }),
  toUpperCase: fn({ returns: "string" }),
  trim: fn({ returns: "string" }),
  valueOf: fn({ returns: "string" })
};

const arrayMethods: Record<string, ApiEntry> = {
  length: val("number", "Array length."),
  concat: fn({
    params: [{ name: "...values", type: "any[]" }],
    returns: "any[]"
  }),
  every: fn({
    params: [{ name: "predicate", type: "(item, i, arr) => boolean" }],
    returns: "boolean"
  }),
  filter: fn({
    params: [{ name: "predicate", type: "(item, i, arr) => boolean" }],
    returns: "any[]"
  }),
  forEach: fn({
    params: [{ name: "fn", type: "(item, i, arr) => void" }],
    returns: "void"
  }),
  indexOf: fn({
    params: [
      { name: "value", type: "any" },
      { name: "from", type: "number", optional: true }
    ],
    returns: "number"
  }),
  join: fn({
    params: [{ name: "separator", type: "string", optional: true }],
    returns: "string"
  }),
  lastIndexOf: fn({
    params: [
      { name: "value", type: "any" },
      { name: "from", type: "number", optional: true }
    ],
    returns: "number"
  }),
  map: fn({
    params: [{ name: "fn", type: "(item, i, arr) => any" }],
    returns: "any[]"
  }),
  pop: fn({ returns: "any" }),
  push: fn({
    params: [{ name: "...values", type: "any[]" }],
    returns: "number"
  }),
  reduce: fn({
    params: [
      { name: "fn", type: "(acc, item, i, arr) => any" },
      { name: "initial", type: "any", optional: true }
    ],
    returns: "any"
  }),
  reduceRight: fn({
    params: [
      { name: "fn", type: "(acc, item, i, arr) => any" },
      { name: "initial", type: "any", optional: true }
    ],
    returns: "any"
  }),
  reverse: fn({ returns: "any[]" }),
  shift: fn({ returns: "any" }),
  slice: fn({
    params: [
      { name: "start", type: "number", optional: true },
      { name: "end", type: "number", optional: true }
    ],
    returns: "any[]"
  }),
  some: fn({
    params: [{ name: "predicate", type: "(item, i, arr) => boolean" }],
    returns: "boolean"
  }),
  sort: fn({
    params: [{ name: "compare", type: "(a, b) => number", optional: true }],
    returns: "any[]"
  }),
  splice: fn({
    params: [
      { name: "start", type: "number" },
      { name: "deleteCount", type: "number", optional: true },
      { name: "...items", type: "any[]" }
    ],
    returns: "any[]"
  }),
  unshift: fn({
    params: [{ name: "...values", type: "any[]" }],
    returns: "number"
  })
};

const dateMethods: Record<string, ApiEntry> = {
  getTime: fn({ returns: "number" }),
  getFullYear: fn({ returns: "number" }),
  getMonth: fn({ returns: "number" }),
  getDate: fn({ returns: "number" }),
  getDay: fn({ returns: "number" }),
  getHours: fn({ returns: "number" }),
  getMinutes: fn({ returns: "number" }),
  getSeconds: fn({ returns: "number" }),
  getMilliseconds: fn({ returns: "number" }),
  getTimezoneOffset: fn({ returns: "number" }),
  setTime: fn({
    params: [{ name: "ms", type: "number" }],
    returns: "number"
  }),
  toISOString: fn({ returns: "string" }),
  toJSON: fn({ returns: "string" }),
  toDateString: fn({ returns: "string" }),
  toTimeString: fn({ returns: "string" }),
  toString: fn({ returns: "string" }),
  valueOf: fn({ returns: "number" })
};

const regexpMethods: Record<string, ApiEntry> = {
  exec: fn({
    params: [{ name: "str", type: "string" }],
    returns: "string[] | null"
  }),
  test: fn({
    params: [{ name: "str", type: "string" }],
    returns: "boolean"
  }),
  source: val("string"),
  global: val("boolean"),
  ignoreCase: val("boolean"),
  multiline: val("boolean"),
  lastIndex: val("number")
};

const promiseInstanceMethods: Record<string, ApiEntry> = {
  then: fn({
    description: "Attaches success/failure callbacks. Returns a new Promise.",
    params: [
      { name: "onFulfilled", type: "(value) => any", optional: true },
      { name: "onRejected", type: "(error) => any", optional: true }
    ],
    returns: "Promise"
  }),
  catch: fn({
    description: "Attaches a rejection handler. Shorthand for .then(null, fn).",
    params: [{ name: "onRejected", type: "(error) => any" }],
    returns: "Promise"
  }),
  finally: fn({
    description: "Runs a callback regardless of fulfillment/rejection.",
    params: [{ name: "onFinally", type: "() => void" }],
    returns: "Promise"
  })
};

export const STANDARD_GLOBALS: Record<string, ApiEntry> = {
  Math: {
    kind: "object",
    description: "Standard JS Math object — constants and numeric helpers.",
    properties: {
      E: { kind: "value", valueType: "number", description: "Euler's number." },
      LN2: { kind: "value", valueType: "number" },
      LN10: { kind: "value", valueType: "number" },
      LOG2E: { kind: "value", valueType: "number" },
      LOG10E: { kind: "value", valueType: "number" },
      PI: { kind: "value", valueType: "number", description: "π." },
      SQRT1_2: { kind: "value", valueType: "number" },
      SQRT2: { kind: "value", valueType: "number" },
      abs: {
        kind: "function",
        params: [{ name: "x", type: "number" }],
        returns: "number"
      },
      acos: {
        kind: "function",
        params: [{ name: "x", type: "number" }],
        returns: "number"
      },
      asin: {
        kind: "function",
        params: [{ name: "x", type: "number" }],
        returns: "number"
      },
      atan: {
        kind: "function",
        params: [{ name: "x", type: "number" }],
        returns: "number"
      },
      atan2: {
        kind: "function",
        params: [
          { name: "y", type: "number" },
          { name: "x", type: "number" }
        ],
        returns: "number"
      },
      ceil: {
        kind: "function",
        params: [{ name: "x", type: "number" }],
        returns: "number"
      },
      cos: {
        kind: "function",
        params: [{ name: "x", type: "number" }],
        returns: "number"
      },
      exp: {
        kind: "function",
        params: [{ name: "x", type: "number" }],
        returns: "number"
      },
      floor: {
        kind: "function",
        params: [{ name: "x", type: "number" }],
        returns: "number"
      },
      log: {
        kind: "function",
        params: [{ name: "x", type: "number" }],
        returns: "number"
      },
      max: {
        kind: "function",
        params: [{ name: "...values", type: "number[]" }],
        returns: "number"
      },
      min: {
        kind: "function",
        params: [{ name: "...values", type: "number[]" }],
        returns: "number"
      },
      pow: {
        kind: "function",
        params: [
          { name: "base", type: "number" },
          { name: "exponent", type: "number" }
        ],
        returns: "number"
      },
      random: {
        kind: "function",
        description: "Returns a pseudo-random number in [0, 1).",
        returns: "number"
      },
      round: {
        kind: "function",
        params: [{ name: "x", type: "number" }],
        returns: "number"
      },
      sin: {
        kind: "function",
        params: [{ name: "x", type: "number" }],
        returns: "number"
      },
      sqrt: {
        kind: "function",
        params: [{ name: "x", type: "number" }],
        returns: "number"
      },
      tan: {
        kind: "function",
        params: [{ name: "x", type: "number" }],
        returns: "number"
      }
    }
  },

  JSON: {
    kind: "object",
    description: "JSON parsing and serialization.",
    properties: {
      parse: {
        kind: "function",
        description: "Parses a JSON string into a value.",
        params: [
          { name: "text", type: "string" },
          { name: "reviver", type: "(key, value) => any", optional: true }
        ],
        returns: "any"
      },
      stringify: {
        kind: "function",
        description: "Serializes a value to a JSON string.",
        params: [
          { name: "value", type: "any" },
          {
            name: "replacer",
            type: "((key, value) => any) | string[] | null",
            optional: true
          },
          { name: "space", type: "string | number", optional: true }
        ],
        returns: "string"
      }
    }
  },

  Promise: {
    kind: "class",
    description:
      "Promise constructor (polyfill). `new Promise(fn)` runs fn(resolve, reject).",
    constructorParams: [
      { name: "executor", type: "(resolve, reject) => void" }
    ],
    properties: promiseInstanceMethods,
    staticProperties: {
      resolve: {
        kind: "function",
        description: "Returns a Promise that fulfills with the given value.",
        params: [{ name: "value", type: "any", optional: true }],
        returns: "Promise"
      },
      reject: {
        kind: "function",
        description: "Returns a Promise rejected with the given reason.",
        params: [{ name: "reason", type: "any", optional: true }],
        returns: "Promise"
      },
      all: {
        kind: "function",
        description:
          "Waits for all input promises; resolves with array of values.",
        params: [{ name: "iterable", type: "Promise[]" }],
        returns: "Promise<any[]>"
      },
      race: {
        kind: "function",
        description:
          "Resolves/rejects as soon as the first input promise settles.",
        params: [{ name: "iterable", type: "Promise[]" }],
        returns: "Promise"
      }
    }
  },

  Array: {
    kind: "class",
    description: "Array constructor and helpers.",
    constructorParams: [{ name: "...items", type: "any[]" }],
    properties: arrayMethods,
    staticProperties: {
      isArray: {
        kind: "function",
        params: [{ name: "value", type: "any" }],
        returns: "boolean"
      }
    }
  },

  Object: {
    kind: "class",
    description: "Object constructor and ES5 reflection helpers.",
    constructorParams: [{ name: "value", type: "any", optional: true }],
    properties: {
      hasOwnProperty: fn({
        params: [{ name: "key", type: "string" }],
        returns: "boolean"
      }),
      isPrototypeOf: fn({
        params: [{ name: "obj", type: "object" }],
        returns: "boolean"
      }),
      propertyIsEnumerable: fn({
        params: [{ name: "key", type: "string" }],
        returns: "boolean"
      }),
      toString: fn({ returns: "string" }),
      valueOf: fn({ returns: "any" })
    },
    staticProperties: {
      create: {
        kind: "function",
        params: [
          { name: "proto", type: "object | null" },
          { name: "props", type: "object", optional: true }
        ],
        returns: "object"
      },
      defineProperty: {
        kind: "function",
        params: [
          { name: "obj", type: "object" },
          { name: "key", type: "string" },
          { name: "descriptor", type: "PropertyDescriptor" }
        ],
        returns: "object"
      },
      defineProperties: {
        kind: "function",
        params: [
          { name: "obj", type: "object" },
          { name: "descriptors", type: "object" }
        ],
        returns: "object"
      },
      freeze: {
        kind: "function",
        params: [{ name: "obj", type: "object" }],
        returns: "object"
      },
      getOwnPropertyDescriptor: {
        kind: "function",
        params: [
          { name: "obj", type: "object" },
          { name: "key", type: "string" }
        ],
        returns: "PropertyDescriptor | undefined"
      },
      getOwnPropertyNames: {
        kind: "function",
        params: [{ name: "obj", type: "object" }],
        returns: "string[]"
      },
      getPrototypeOf: {
        kind: "function",
        params: [{ name: "obj", type: "object" }],
        returns: "object | null"
      },
      isExtensible: {
        kind: "function",
        params: [{ name: "obj", type: "object" }],
        returns: "boolean"
      },
      isFrozen: {
        kind: "function",
        params: [{ name: "obj", type: "object" }],
        returns: "boolean"
      },
      isSealed: {
        kind: "function",
        params: [{ name: "obj", type: "object" }],
        returns: "boolean"
      },
      keys: {
        kind: "function",
        params: [{ name: "obj", type: "object" }],
        returns: "string[]"
      },
      preventExtensions: {
        kind: "function",
        params: [{ name: "obj", type: "object" }],
        returns: "object"
      },
      seal: {
        kind: "function",
        params: [{ name: "obj", type: "object" }],
        returns: "object"
      }
    }
  },

  String: {
    kind: "class",
    description: "String constructor and helpers.",
    constructorParams: [{ name: "value", type: "any", optional: true }],
    properties: stringMethods,
    staticProperties: {
      fromCharCode: {
        kind: "function",
        params: [{ name: "...codes", type: "number[]" }],
        returns: "string"
      }
    }
  },

  Number: {
    kind: "class",
    description: "Number constructor and constants.",
    constructorParams: [{ name: "value", type: "any", optional: true }],
    properties: numberMethods,
    staticProperties: {
      MAX_VALUE: { kind: "value", valueType: "number" },
      MIN_VALUE: { kind: "value", valueType: "number" },
      NaN: { kind: "value", valueType: "number" },
      NEGATIVE_INFINITY: { kind: "value", valueType: "number" },
      POSITIVE_INFINITY: { kind: "value", valueType: "number" }
    }
  },

  Boolean: {
    kind: "class",
    description: "Boolean constructor.",
    constructorParams: [{ name: "value", type: "any", optional: true }],
    properties: {
      toString: fn({ returns: "string" }),
      valueOf: fn({ returns: "boolean" })
    }
  },

  Date: {
    kind: "class",
    description: "Date constructor.",
    constructorParams: [
      {
        name: "value",
        type: "number | string | undefined",
        optional: true
      }
    ],
    properties: dateMethods,
    staticProperties: {
      now: {
        kind: "function",
        description: "Milliseconds since the Unix epoch.",
        returns: "number"
      },
      parse: {
        kind: "function",
        params: [{ name: "dateString", type: "string" }],
        returns: "number"
      },
      UTC: {
        kind: "function",
        params: [
          { name: "year", type: "number" },
          { name: "month", type: "number" },
          { name: "day", type: "number", optional: true },
          { name: "hour", type: "number", optional: true },
          { name: "minute", type: "number", optional: true },
          { name: "second", type: "number", optional: true },
          { name: "ms", type: "number", optional: true }
        ],
        returns: "number"
      }
    }
  },

  RegExp: {
    kind: "class",
    description: "RegExp constructor.",
    constructorParams: [
      { name: "pattern", type: "string | RegExp" },
      { name: "flags", type: "string", optional: true }
    ],
    properties: regexpMethods
  },

  Error: {
    kind: "class",
    description: "Error constructor.",
    constructorParams: [
      { name: "message", type: "string", optional: true }
    ],
    properties: {
      message: val("string"),
      name: val("string"),
      stack: val("string"),
      toString: fn({ returns: "string" })
    }
  },

  console: {
    kind: "object",
    description: "Spell console — output is routed to the in-game console.",
    properties: {
      log: {
        kind: "function",
        params: [{ name: "...args", type: "any[]" }],
        returns: "void"
      },
      error: {
        kind: "function",
        params: [{ name: "...args", type: "any[]" }],
        returns: "void"
      },
      warn: {
        kind: "function",
        params: [{ name: "...args", type: "any[]" }],
        returns: "void"
      },
      info: {
        kind: "function",
        params: [{ name: "...args", type: "any[]" }],
        returns: "void"
      },
      debug: {
        kind: "function",
        params: [{ name: "...args", type: "any[]" }],
        returns: "void"
      }
    }
  }
};
