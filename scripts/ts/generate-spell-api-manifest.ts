/**
 * generate-spell-api-manifest.ts
 *
 * Reads SPELL_API_MANIFESTS from src/scripting/core/spellApiManifests.ts and
 * generates a TypeScript declaration file (.d.ts) documenting the full spell
 * module API surface. The output serves as human-readable docs and as a
 * ready-to-use artifact for future Monaco/LSP integrations.
 *
 * Usage:
 *   npm run scripts:compile
 *   node scripts/ts/generate-spell-api-manifest.js [--output <path>]
 *
 * Default output: src/scripting/generated/spellTypes.d.ts
 */

import fs from "fs";
import path from "path";

// ---------------------------------------------------------------------------
// Inline the manifest types so this script is self-contained after compilation
// ---------------------------------------------------------------------------
type ApiParam = {
  name: string;
  type: string;
  description?: string;
  optional?: boolean;
};

type FunctionEntry = {
  kind: "function";
  description?: string;
  params?: ApiParam[];
  returns?: string;
  properties?: Record<string, ApiEntry>;
};

type ObjectEntry = {
  kind: "object";
  description?: string;
  properties: Record<string, ApiEntry>;
};

type ClassEntry = {
  kind: "class";
  description?: string;
  constructorParams?: ApiParam[];
  properties: Record<string, ApiEntry>;
  staticProperties?: Record<string, ApiEntry>;
};

type ValueEntry = {
  kind: "value";
  description?: string;
  valueType: string;
};

type ApiEntry = FunctionEntry | ObjectEntry | ClassEntry | ValueEntry;

type ModuleManifest = {
  description?: string;
  export: ApiEntry;
};

// ---------------------------------------------------------------------------
// Load the manifests at runtime (compiled JS from the same tsconfig)
// ---------------------------------------------------------------------------
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { SPELL_API_MANIFESTS } = require("../../src/scripting/core/spellApiManifests") as {
  SPELL_API_MANIFESTS: Record<string, ModuleManifest>;
};

// ---------------------------------------------------------------------------
// Output path
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
const outputArgIndex = args.indexOf("--output");
const DEFAULT_OUTPUT = path.resolve(
  __dirname,
  "../../src/scripting/generated/spellTypes.d.ts"
);
const outputPath =
  outputArgIndex !== -1 && args[outputArgIndex + 1]
    ? path.resolve(args[outputArgIndex + 1])
    : DEFAULT_OUTPUT;

// ---------------------------------------------------------------------------
// .d.ts generation helpers
// ---------------------------------------------------------------------------
function indent(str: string, n = 2): string {
  return str
    .split("\n")
    .map((line) => " ".repeat(n) + line)
    .join("\n");
}

function docComment(lines: string[]): string {
  if (!lines.length) return "";
  return ["/**", ...lines.map((l) => ` * ${l}`), " */"].join("\n");
}

/**
 * Manifest types are hand-authored, human-readable strings that are mostly
 * valid TypeScript — except callbacks are written in pseudo-syntax like
 * `function(coords: Vector)` or a bare `function`. Convert those to real TS
 * function types so the emitted .d.ts compiles.
 */
function normalizeType(type: string): string {
  const t = type.trim();
  if (t === "function") return "(...args: any[]) => any";
  const m = /^function\s*\(([\s\S]*)\)\s*(?::\s*([\s\S]+))?$/.exec(t);
  if (m) {
    const params = m[1].trim();
    const ret = m[2] ? m[2].trim() : "void";
    return `(${params}) => ${ret}`;
  }
  return type;
}

/**
 * Insert a member modifier (e.g. `static `) after a leading doc comment so we
 * emit `/** … *\/ static foo()` rather than the invalid `static /** … *\/ foo()`.
 */
function prefixModifier(decl: string, modifier: string): string {
  if (decl.startsWith("/**")) {
    const end = decl.indexOf("*/\n");
    if (end !== -1) {
      return decl.slice(0, end + 3) + modifier + decl.slice(end + 3);
    }
  }
  return modifier + decl;
}

/**
 * Emit a property of a function/namespace (e.g. `wait.async`) as a namespace
 * declaration. Reuses the top-level form and swaps `declare` for `export`,
 * since namespace bodies require declarations, not interface-style members.
 */
function namespaceMember(name: string, entry: ApiEntry): string {
  return entryToDeclaration(name, entry, true).replace(
    /(^|\n)declare /g,
    "$1export "
  );
}

function paramTypeStr(params: ApiParam[] | undefined): string {
  if (!params?.length) return "";
  return params
    .map((p) => `${p.name}${p.optional ? "?" : ""}: ${normalizeType(p.type)}`)
    .join(", ");
}

function entryToDeclaration(
  name: string,
  entry: ApiEntry,
  topLevel = false
): string {
  const doc: string[] = [];
  if (entry.description) doc.push(entry.description);

  switch (entry.kind) {
    case "value": {
      const comment = doc.length ? docComment(doc) + "\n" : "";
      return `${comment}${name}: ${normalizeType(entry.valueType)};`;
    }

    case "function": {
      if (entry.params?.length) {
        doc.push(
          `@param ${entry.params.map((p) => `${p.name} — ${p.description ?? p.type}`).join(", ")}`
        );
      }
      if (entry.returns) doc.push(`@returns ${entry.returns}`);
      const comment = doc.length ? docComment(doc) + "\n" : "";
      const params = paramTypeStr(entry.params);
      const ret = entry.returns ? normalizeType(entry.returns) : "void";

      // Properties on the function itself (e.g. wait.async) — emitted as
      // namespace declarations alongside the function.
      const extraProps = entry.properties
        ? Object.entries(entry.properties)
            .map(([k, v]) => namespaceMember(k, v))
            .join("\n")
        : "";

      if (topLevel) {
        // Module-level export — emit as a callable namespace
        const lines: string[] = [
          `${comment}declare function ${name}(${params}): ${ret};`,
          extraProps
            ? `declare namespace ${name} {\n${indent(extraProps)}\n}`
            : ""
        ].filter(Boolean);
        return lines.join("\n");
      }

      return `${comment}${name}(${params}): ${ret};`;
    }

    case "object": {
      const comment = doc.length ? docComment(doc) + "\n" : "";
      const members = Object.entries(entry.properties)
        .map(([k, v]) => entryToDeclaration(k, v))
        .join("\n");

      if (topLevel) {
        return `${comment}declare const ${name}: {\n${indent(members)}\n};`;
      }
      return `${comment}${name}: {\n${indent(members)}\n};`;
    }

    case "class": {
      const comment = doc.length ? docComment(doc) + "\n" : "";
      const ctorParams = paramTypeStr(entry.constructorParams);
      const instanceMembers = Object.entries(entry.properties)
        .map(([k, v]) => entryToDeclaration(k, v))
        .join("\n");

      if (topLevel) {
        // A real class declaration: static members keep the `static` modifier,
        // placed after any doc comment.
        const staticMembers = entry.staticProperties
          ? Object.entries(entry.staticProperties)
              .map(([k, v]) => prefixModifier(entryToDeclaration(k, v), "static "))
              .join("\n")
          : "";
        const allMembers = [instanceMembers, staticMembers]
          .filter(Boolean)
          .join("\n");
        return (
          `${comment}declare class ${name} {\n` +
          `  constructor(${ctorParams});\n` +
          (allMembers ? indent(allMembers) + "\n" : "") +
          `}`
        );
      }

      // Member context (a class value held as a property of an object/class,
      // e.g. heal.Heal or the fire.Fireball self-reference). The value is a
      // constructor object, so emit it as a property with a construct
      // signature plus its static members (no `static` keyword inside an
      // object type literal).
      const staticMembers = entry.staticProperties
        ? Object.entries(entry.staticProperties)
            .map(([k, v]) => entryToDeclaration(k, v))
            .join("\n")
        : "";
      const instanceShape = instanceMembers
        ? `{\n${indent(instanceMembers)}\n}`
        : "any";
      const ctorObjMembers = [
        `new (${ctorParams}): ${instanceShape};`,
        staticMembers
      ]
        .filter(Boolean)
        .join("\n");
      return `${comment}${name}: {\n${indent(ctorObjMembers)}\n};`;
    }
  }
}

function moduleToDeclarations(
  moduleName: string,
  manifest: ModuleManifest
): string {
  const entry = manifest.export;
  const topLevelName = moduleName.replace(/-/g, "_");

  const moduleDoc = manifest.description
    ? docComment([manifest.description]) + "\n"
    : "";
  const declaration = entryToDeclaration(topLevelName, entry, true);

  return (
    moduleDoc +
    `declare module "${moduleName}" {\n` +
    indent(declaration) +
    `\n  export = ${topLevelName};\n` +
    `}`
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const header = [
  "// AUTO-GENERATED by scripts/ts/generate-spell-api-manifest.ts",
  "// Do not edit manually. Run: npm run generate-spell-apis",
  "// This file documents the full spell module API surface.",
  ""
].join("\n");

const modules = Object.entries(SPELL_API_MANIFESTS)
  .map(([name, manifest]) => moduleToDeclarations(name, manifest))
  .join("\n\n");

const output = header + modules + "\n";

// Ensure output directory exists
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, output, "utf-8");

console.log(`Generated spell type declarations → ${outputPath}`);
console.log(`  Documented ${Object.keys(SPELL_API_MANIFESTS).length} modules.`);
