import { computeAutocomplete } from "./autocomplete";
import { SPELL_API_MANIFESTS } from "./spellApiManifests";

const someCode = `
const foo = require("fire");
function a() {
  foo
}
`;

describe("autocomplete", () => {
  test("provides basic autocomplete tokens for a stem", () => {
    const autocompleteResult = computeAutocomplete(someCode, 3, 4);
    expect(autocompleteResult).not.toBe(null);
    expect(autocompleteResult?.[0]?.docText).toBe(
      SPELL_API_MANIFESTS["fire"].description
    );
  });

  test("completes JS keywords from a top-level stem", () => {
    // Line 0 is empty, line 1 is `va` (typing `var`).
    const code = "\nva";
    const result = computeAutocomplete(code, 1, 2);
    const values = result.map((r) => r.value);
    expect(values).toContain("var");
    // Keywords come with the "keyword" meta tag.
    const varEntry = result.find((r) => r.value === "var");
    expect(varEntry?.meta).toBe("keyword");
  });

  test("includes ES6 keywords that the transpiler accepts", () => {
    const result = computeAutocomplete("\nasy", 1, 3);
    expect(result.map((r) => r.value)).toContain("async");
    const constResult = computeAutocomplete("\ncon", 1, 3);
    expect(constResult.map((r) => r.value)).toContain("const");
  });

  test("completes Math static members", () => {
    // Typing `Math.r` should surface `random` and `round`.
    const result = computeAutocomplete("\nMath.r", 1, 6);
    const values = result.map((r) => r.value);
    expect(values).toContain("random(");
    expect(values).toContain("round(");
  });

  test("completes Math constants alongside functions", () => {
    const result = computeAutocomplete("\nMath.P", 1, 6);
    expect(result.map((r) => r.value)).toContain("PI");
  });

  test("completes Promise static methods", () => {
    const result = computeAutocomplete("\nPromise.", 1, 8);
    const values = result.map((r) => r.value);
    expect(values).toContain("resolve(");
    expect(values).toContain("reject(");
    expect(values).toContain("all(");
  });

  test("does not expose ES6+ globals (Float32Array, Map, Symbol)", () => {
    const result = computeAutocomplete("\nFlo", 1, 3);
    expect(result.map((r) => r.value)).not.toContain("Float32Array(");
    const mapResult = computeAutocomplete("\nMa", 1, 2);
    const mapValues = mapResult.map((r) => r.value);
    expect(mapValues).not.toContain("Map(");
    expect(mapValues).not.toContain("WeakMap(");
    expect(mapValues).toContain("Math"); // sanity: Math still present
    const symResult = computeAutocomplete("\nSym", 1, 3);
    expect(symResult.map((r) => r.value)).not.toContain("Symbol(");
  });

  test("does not expose ES6 Math helpers (cbrt, sign, log2)", () => {
    const result = computeAutocomplete("\nMath.s", 1, 6);
    const values = result.map((r) => r.value);
    expect(values).not.toContain("sign(");
    expect(values).toContain("sin(");
    expect(values).toContain("sqrt(");
  });

  test("picks up variables declared inside function bodies", () => {
    // `var ice = require("ice")` inside a function — cursor on the next
    // line completes against `ice`.
    const code = [
      "function cast() {",
      "  var ice = require(\"ice\");",
      "  ice",
      "}"
    ].join("\n");
    const result = computeAutocomplete(code, 2, 5);
    const values = result.map((r) => r.value);
    expect(values).toContain("ice");
  });

  test("resolves chain access on a var declared in a function body", () => {
    const code = [
      "function cast() {",
      "  var f = require(\"fire\");",
      "  f.",
      "}"
    ].join("\n");
    const result = computeAutocomplete(code, 2, 4);
    const values = result.map((r) => r.value);
    // fire's static members include `blast` and `wave`.
    expect(values).toContain("blast(");
    expect(values).toContain("wave(");
  });

  test("multi-line `new X({` constructor opts", () => {
    const code = [
      "var f = require(\"fire\");",
      "new f({",
      "  ai",
      "});"
    ].join("\n");
    // Cursor at end of `  ai` (line 2, col 4).
    const result = computeAutocomplete(code, 2, 4);
    const values = result.map((r) => r.value);
    expect(values).toContain("aim: ");
  });

  test("multi-line ctor opts after an earlier comma-separated entry", () => {
    const code = [
      "var f = require(\"fire\");",
      "new f({",
      "  aim: true,",
      "  str",
      "});"
    ].join("\n");
    const result = computeAutocomplete(code, 3, 5);
    expect(result.map((r) => r.value)).toContain("strength: ");
  });

  test("keyword completions rank below user vars", () => {
    // `foo` from require + `for` keyword — `foo` should be scored higher.
    const code = ['var foo = require("fire");', "fo"].join("\n");
    const result = computeAutocomplete(code, 1, 2);
    const foo = result.find((r) => r.value === "foo");
    const forKw = result.find((r) => r.value === "for");
    expect(foo).toBeDefined();
    expect(forKw).toBeDefined();
    expect(foo!.score!).toBeGreaterThan(forKw!.score!);
  });
});
