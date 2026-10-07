// ES5 keywords plus the ES6+ tokens that survive transpile-to-ES5
// (see src/scripting/core/transpile.ts). `let`/`const` are rewritten by
// transformBlockScoping, `class`/`extends` by transformClasses, `async`/`await`
// by transformAsyncToPromises, `for...of` by transformForOf — so the user can
// still type them and we want autocomplete to surface them.
//
// Deliberately omitted: `yield` (generators aren't transpiled), `import`/
// `export` (module syntax not supported), `static` (only meaningful inside
// class bodies which transpile away).
export const JS_KEYWORDS: readonly string[] = [
  "async",
  "await",
  "break",
  "case",
  "catch",
  "class",
  "const",
  "continue",
  "default",
  "delete",
  "do",
  "else",
  "extends",
  "false",
  "finally",
  "for",
  "function",
  "if",
  "in",
  "instanceof",
  "let",
  "new",
  "null",
  "of",
  "return",
  "switch",
  "this",
  "throw",
  "true",
  "try",
  "typeof",
  "undefined",
  "var",
  "void",
  "while"
];
