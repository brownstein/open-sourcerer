/**
 * generate-auto-module-bindings.ts
 *
 * Scans every `*.native.ts` file in src/scripting/modules/auto and emits the
 * generated binding files that bridge the RPC handler logic across the
 * main-thread / web-worker boundary:
 *
 *   src/scripting/modules/autoNativeBindings.ts
 *     Runs on the MAIN THREAD. Maps each native module class's static `name`
 *     to a factory:
 *       (ctx: SpellRuntimeModuleCtxAPI) => SpellRuntimeModuleInstanceNative
 *     Each factory instantiates the handler and wraps it with the automatic
 *     RPC dispatcher.
 *
 *   src/scripting/modules/autoPseudoBindings.ts
 *     Runs in the WEB WORKER. Exports a function that takes a JSRunnerAPI and
 *     builds the matching map of RPC-call proxies. It NEVER imports a native
 *     class at runtime (only `import type`), so main-thread dependencies
 *     (Three.js, entities, the Level) never leak into the worker bundle. The
 *     method names that drive each proxy are baked in as string literals
 *     extracted from the class source at build time.
 *
 * The two files share the same set of keys (the class static names) so a
 * pseudo-side proxy lines up with its native-side handler.
 *
 * Usage:
 *   npm run scripts:compile
 *   node scripts/ts/generate-auto-module-bindings.js
 *   # or: npm run generate-auto-module-bindings
 */

import fs from "fs";
import path from "path";

import { Project, Scope, SyntaxKind } from "ts-morph";

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------
const REPO_ROOT = path.resolve(__dirname, "../..");
const AUTO_DIR = path.resolve(REPO_ROOT, "src/scripting/modules/auto");
const NATIVE_OUTPUT = path.resolve(
  REPO_ROOT,
  "src/scripting/modules/autoNativeBindings.ts"
);
const PSEUDO_OUTPUT = path.resolve(
  REPO_ROOT,
  "src/scripting/modules/autoPseudoBindings.ts"
);
const MANIFEST_OUTPUT = path.resolve(
  REPO_ROOT,
  "src/scripting/modules/autoSpellApiManifests.ts"
);

// Module specifiers for the generated imports (extension-less, `src/` alias).
const RPC_CONTRACT_MODULE =
  "src/scripting/modules/shared/rpcContract";
const RUNTIME_API_MODULE = "src/scripting/runtime/SpellRuntimeAPI";
const WORKER_API_MODULE = "src/scripting/runtime/SpellWorkerModuleAPI";
const JS_RUNNER_MODULE = "src/scripting/core/api";
// The manifest file is pulled into scripts-tsconfig (via spellApiManifests.ts),
// which uses nodenext resolution and doesn't honor the `src/*` alias — so this
// one import is emitted relative to src/scripting/modules/ instead.
const API_MANIFEST_MODULE = "../core/apiManifest";

// ---------------------------------------------------------------------------
// Scan model
// ---------------------------------------------------------------------------
type NativeModuleInfo = {
  /** Static class name — the key shared by both generated files. */
  className: string;
  /** Optional static `nickname` — an extra alias key on the pseudo side. */
  nickname?: string;
  /** Module specifier to import the default export from. */
  importSpecifier: string;
  /** Public instance method names that become RPCs. */
  methodNames: string[];
  /**
   * The `require("...")` key, read from the sibling `*.pseudo.ts`'s default
   * export `name`. Undefined when there is no pseudo sibling (the module can't
   * be required, so it gets no autocomplete manifest entry).
   */
  requireKey?: string;
  /**
   * Optional `manifest` from the sibling `*.pseudo.ts`'s default export,
   * captured as raw source text so the literal can be inlined into the
   * generated manifest file without importing any module code at runtime.
   * `description`/`export` are the two fields we merge over the inferred stub.
   */
  manifestDescriptionText?: string;
  manifestExportText?: string;
};

type PseudoModuleInfo = {
  /** `require("...")` key from the default export's `name`. */
  requireKey?: string;
  /** Raw text of the default export's `manifest.description`, for inlining. */
  manifestDescriptionText?: string;
  /** Raw text of the default export's `manifest.export`, for inlining. */
  manifestExportText?: string;
};

/**
 * Read the default-export object literal of a `*.pseudo.ts`: its `name` (the
 * require() key) and its optional `manifest` ({ description, export }). The
 * manifest lives on the pseudo definition because it documents the
 * require()-able surface; we capture it as raw text so the generated manifest
 * file inlines the literal without importing any module code at runtime.
 */
function readPseudoModuleInfo(
  project: Project,
  pseudoFile: string
): PseudoModuleInfo {
  if (!fs.existsSync(pseudoFile)) return {};
  const source = project.addSourceFileAtPath(pseudoFile);
  try {
    const exportAssign = source
      .getExportAssignments()
      .find((e) => !e.isExportEquals());
    let expr = exportAssign?.getExpression();
    // Unwrap `... satisfies T` / `... as T` wrappers around the object literal.
    const satisfies = expr?.asKind(SyntaxKind.SatisfiesExpression);
    if (satisfies) expr = satisfies.getExpression();
    const asExpr = expr?.asKind(SyntaxKind.AsExpression);
    if (asExpr) expr = asExpr.getExpression();
    const obj = expr?.asKind(SyntaxKind.ObjectLiteralExpression);

    const requireKey = obj
      ?.getProperty("name")
      ?.asKind(SyntaxKind.PropertyAssignment)
      ?.getInitializer()
      ?.asKind(SyntaxKind.StringLiteral)
      ?.getLiteralValue();

    const manifestObj = obj
      ?.getProperty("manifest")
      ?.asKind(SyntaxKind.PropertyAssignment)
      ?.getInitializer()
      ?.asKind(SyntaxKind.ObjectLiteralExpression);
    const manifestDescriptionText = manifestObj
      ?.getProperty("description")
      ?.asKind(SyntaxKind.PropertyAssignment)
      ?.getInitializer()
      ?.getText();
    const manifestExportText = manifestObj
      ?.getProperty("export")
      ?.asKind(SyntaxKind.PropertyAssignment)
      ?.getInitializer()
      ?.getText();

    return { requireKey, manifestDescriptionText, manifestExportText };
  } finally {
    project.removeSourceFile(source);
  }
}

/** Resolve `Foo.native.ts` → `src/scripting/modules/auto/Foo.native`. */
function toImportSpecifier(absFile: string): string {
  const rel = path
    .relative(REPO_ROOT, absFile)
    .replace(/\\/g, "/")
    .replace(/\.ts$/, "");
  return rel; // already rooted at `src/...`
}

function scanNativeModules(): NativeModuleInfo[] {
  if (!fs.existsSync(AUTO_DIR)) {
    throw new Error(`Auto module directory not found: ${AUTO_DIR}`);
  }

  const files = fs
    .readdirSync(AUTO_DIR)
    .filter((f) => f.endsWith(".native.ts"))
    .map((f) => path.join(AUTO_DIR, f))
    .sort();

  // ts-morph project just for parsing — no emit, no type-checking deps.
  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    compilerOptions: { allowJs: false }
  });

  const seen = new Map<string, string>();
  const infos: NativeModuleInfo[] = [];

  for (const file of files) {
    const source = project.addSourceFileAtPath(file);

    // Find the default-exported class declaration.
    const classes = source.getClasses();
    const defaultClass = classes.find((c) => c.isDefaultExport());
    if (!defaultClass) {
      console.warn(
        `  skipping ${path.basename(file)} — no default-exported class found.`
      );
      continue;
    }

    const className = defaultClass.getName();
    if (!className) {
      console.warn(
        `  skipping ${path.basename(file)} — default-exported class is anonymous.`
      );
      continue;
    }

    if (seen.has(className)) {
      throw new Error(
        `Duplicate native module class name "${className}" in ${path.basename(
          file
        )} and ${path.basename(seen.get(className)!)}. Class names must be unique.`
      );
    }
    seen.set(className, file);

    // Optional static `nickname` string literal — exposed as an alias key on
    // the pseudo side in addition to the class name.
    const nickname = defaultClass
      .getStaticProperty("nickname")
      ?.asKind(SyntaxKind.PropertyDeclaration)
      ?.getInitializer()
      ?.asKind(SyntaxKind.StringLiteral)
      ?.getLiteralValue();

    // Public instance methods become RPCs. Constructor, statics, private /
    // protected members, and accessors are excluded — they aren't callable
    // over the RPC bridge.
    const methodNames = defaultClass
      .getInstanceMethods()
      .filter((m) => {
        const scope = m.getScope();
        return scope !== Scope.Private && scope !== Scope.Protected;
      })
      .filter((m) => !m.hasModifier(SyntaxKind.PrivateKeyword))
      .map((m) => m.getName())
      // `#private` methods are not represented as instance methods, but guard
      // against any name that isn't a plain identifier just in case.
      .filter((name) => /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name))
      .sort();

    // The require() key AND the autocomplete manifest both come from the
    // sibling `*.pseudo.ts`'s default export. The manifest lives there (not on
    // the native class) because it documents the require()-able surface.
    const pseudoFile = file.replace(/\.native\.ts$/, ".pseudo.ts");
    const { requireKey, manifestDescriptionText, manifestExportText } =
      readPseudoModuleInfo(project, pseudoFile);
    if (!requireKey) {
      console.warn(
        `  ${path.basename(file)} — no requirable name found in a sibling ` +
          `.pseudo.ts; it will get bindings but no autocomplete manifest entry.`
      );
    }

    infos.push({
      className,
      nickname,
      importSpecifier: toImportSpecifier(file),
      methodNames,
      requireKey,
      manifestDescriptionText,
      manifestExportText
    });

    project.removeSourceFile(source);
  }

  infos.sort((a, b) => a.className.localeCompare(b.className));
  return infos;
}

type PseudoOnlyModuleInfo = {
  requireKey?: string;
  manifestDescriptionText?: string;
  manifestExportText?: string;
};

/**
 * Scan `*.pseudo.ts` files that have NO `*.native.ts` sibling — pure-pseudo
 * modules with no RPC handler (e.g. vector, self, wait). They get no native /
 * pseudo bindings, but their `manifest` still flows into the autocomplete
 * manifest so `require("...")` completion works.
 */
function scanPseudoOnlyModules(): PseudoOnlyModuleInfo[] {
  if (!fs.existsSync(AUTO_DIR)) return [];
  const files = fs
    .readdirSync(AUTO_DIR)
    .filter((f) => f.endsWith(".pseudo.ts"))
    .filter(
      (f) =>
        !fs.existsSync(
          path.join(AUTO_DIR, f.replace(/\.pseudo\.ts$/, ".native.ts"))
        )
    )
    .map((f) => path.join(AUTO_DIR, f))
    .sort();

  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    compilerOptions: { allowJs: false }
  });

  const infos: PseudoOnlyModuleInfo[] = [];
  for (const file of files) {
    const { requireKey, manifestDescriptionText, manifestExportText } =
      readPseudoModuleInfo(project, file);
    if (!requireKey) {
      console.warn(
        `  ${path.basename(file)} — pseudo-only module with no requirable ` +
          `name; skipping manifest entry.`
      );
      continue;
    }
    infos.push({ requireKey, manifestDescriptionText, manifestExportText });
  }
  return infos;
}

// ---------------------------------------------------------------------------
// Emit
// ---------------------------------------------------------------------------
const HEADER = [
  "// AUTO-GENERATED by scripts/ts/generate-auto-module-bindings.ts",
  "// Do not edit manually. Run: npm run generate-auto-module-bindings",
  ""
].join("\n");

function emitNativeBindings(infos: NativeModuleInfo[]): string {
  const imports = infos
    .map((i) => `import ${i.className} from "${i.importSpecifier}";`)
    .join("\n");

  const entries = infos
    .map((i) => {
      // Only wire a teardown when the handler actually defines one — otherwise
      // referencing handler.teardown would be a type error.
      const hasTeardown = i.methodNames.includes("teardown");
      return [
        `  ${i.className}: (ctx) => {`,
        `    const handler = new ${i.className}(ctx);`,
        `    return {`,
        `      handleDataRPC: getAutomaticRPCHandler(handler)${
          hasTeardown ? "," : ""
        }`,
        ...(hasTeardown ? [`      teardown: () => handler.teardown()`] : []),
        `    };`,
        `  }`
      ].join("\n");
    })
    .join(",\n");

  return (
    HEADER +
    "\n" +
    `import { getAutomaticRPCHandler } from "${RPC_CONTRACT_MODULE}";\n` +
    `import {\n` +
    `  SpellRuntimeModuleCtxAPI,\n` +
    `  SpellRuntimeModuleInstanceNative\n` +
    `} from "${RUNTIME_API_MODULE}";\n` +
    (imports ? imports + "\n" : "") +
    "\n" +
    "/**\n" +
    " * Main-thread RPC handler factories, keyed by native module class name.\n" +
    " * Each instantiates the handler and wraps it with the auto RPC dispatcher.\n" +
    " */\n" +
    "export const autoNativeBindings: Record<\n" +
    "  string,\n" +
    "  (ctx: SpellRuntimeModuleCtxAPI) => SpellRuntimeModuleInstanceNative\n" +
    "> = {\n" +
    entries +
    (entries ? "\n" : "") +
    "};\n"
  );
}

/** Emit an object/type key, quoting it when it isn't a bare identifier. */
function keyLiteral(key: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? key : JSON.stringify(key);
}

/** Emit a member access: `.foo` for identifiers, `["foo-bar"]` otherwise. */
function memberAccess(key: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key)
    ? `.${key}`
    : `[${JSON.stringify(key)}]`;
}

function emitPseudoBindings(infos: NativeModuleInfo[]): string {
  // Each module is exposed under its class name and, when present, its static
  // `nickname` — both pointing at the same proxy. Guard against collisions.
  const keyOwner = new Map<string, string>();
  const keysFor = (i: NativeModuleInfo): string[] => {
    const keys = [i.className];
    if (i.nickname && i.nickname !== i.className) keys.push(i.nickname);
    for (const key of keys) {
      const owner = keyOwner.get(key);
      if (owner && owner !== i.className) {
        throw new Error(
          `Pseudo binding key "${key}" is claimed by both ${owner} and ${i.className}. ` +
            `Class names and nicknames must not collide.`
        );
      }
      keyOwner.set(key, i.className);
    }
    return keys;
  };

  // Type-only imports so the worker bundle never pulls in native code.
  const typeImports = infos
    .map((i) => `import type ${i.className} from "${i.importSpecifier}";`)
    .join("\n");

  const typeEntries = infos
    .flatMap((i) =>
      keysFor(i).map(
        (key) =>
          `  ${keyLiteral(key)}: GetPromisedRPCTypeSignaturesForClazz<${i.className}>;`
      )
    )
    .join("\n");

  const buildEntries = infos
    .map((i) => {
      const names = i.methodNames.map((n) => `"${n}"`).join(", ");
      const local = `${i.className}Rpcs`;
      const decl = `  const ${local} = bindMethodNamesAsRPCs<GetPromisedRPCTypeSignaturesForClazz<${i.className}>>(rpcFor("${i.className}"), [${names}]);`;
      const assigns = keysFor(i)
        .map((key) => `  bindings${memberAccess(key)} = ${local};`)
        .join("\n");
      return [decl, assigns].join("\n");
    })
    .join("\n");

  return (
    HEADER +
    "\n" +
    `import {\n` +
    `  GetPromisedRPCTypeSignaturesForClazz,\n` +
    `  bindMethodNamesAsRPCs\n` +
    `} from "${RPC_CONTRACT_MODULE}";\n` +
    `import { moduleAPIFromRunner } from "${WORKER_API_MODULE}";\n` +
    `import type { JSRunnerAPI } from "${JS_RUNNER_MODULE}";\n` +
    (typeImports ? typeImports + "\n" : "") +
    "\n" +
    "/**\n" +
    " * The pseudo-side RPC-proxy map, keyed identically to autoNativeBindings.\n" +
    " * Each value forwards calls to the matching native handler over nativeRPC.\n" +
    " */\n" +
    "export type AutoPseudoBindings = {\n" +
    typeEntries +
    (typeEntries ? "\n" : "") +
    "};\n" +
    "\n" +
    "export function buildAutoPseudoBindings(\n" +
    "  runner: JSRunnerAPI\n" +
    "): AutoPseudoBindings {\n" +
    "  const rpcFor =\n" +
    "    (moduleName: string) =>\n" +
    "    (data: unknown): Promise<unknown> => {\n" +
    "      const moduleAPI = moduleAPIFromRunner(runner);\n" +
    "      if (!moduleAPI) {\n" +
    "        throw new Error(\n" +
    '          "Cannot dispatch native RPC: module API not attached to this runner."\n' +
    "        );\n" +
    "      }\n" +
    "      return moduleAPI.nativeRPC(moduleName, data);\n" +
    "    };\n" +
    "  const bindings = {} as AutoPseudoBindings;\n" +
    buildEntries +
    (buildEntries ? "\n" : "") +
    "  return bindings;\n" +
    "}\n"
  );
}

/**
 * Emit the require()-autocomplete manifest entries for auto modules. The entry
 * for each module is the inferred stub merged (at build time) with the optional
 * pseudo-side `manifest` — manifest fields win. The result is pure data, so
 * the generated file imports no module code (safe for the worker bundle too).
 */
type ManifestInfo = {
  requireKey?: string;
  manifestDescriptionText?: string;
  manifestExportText?: string;
};

function emitManifests(infos: ManifestInfo[]): string {
  const requirable = infos.filter((i) => i.requireKey);

  const entries = requirable
    .map((i) => {
      const key = i.requireKey!;
      const description =
        i.manifestDescriptionText ??
        JSON.stringify(`The ${key} spell module.`);
      // Inferred stub export — only used when the pseudo defines no manifest.
      const exportEntry =
        i.manifestExportText ??
        `{ kind: "object", description: ${JSON.stringify(
          `require("${key}") import.`
        )}, properties: {} }`;
      return (
        `  ${keyLiteral(key)}: {\n` +
        `    description: ${description},\n` +
        `    export: ${exportEntry}\n` +
        `  }`
      );
    })
    .join(",\n");

  return (
    HEADER +
    "\n" +
    `import type { SpellApiManifests } from "${API_MANIFEST_MODULE}";\n` +
    "\n" +
    "/**\n" +
    " * require()-autocomplete metadata for the auto modules. Spread into\n" +
    " * SPELL_API_MANIFESTS so each module appears in `require(\"...\")`\n" +
    " * completion. Inferred stub ⊕ each pseudo module's optional `manifest`.\n" +
    " */\n" +
    "export const AUTO_SPELL_API_MANIFESTS: SpellApiManifests = {\n" +
    entries +
    (entries ? "\n" : "") +
    "};\n"
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const infos = scanNativeModules();
const pseudoOnlyInfos = scanPseudoOnlyModules();

fs.writeFileSync(NATIVE_OUTPUT, emitNativeBindings(infos), "utf-8");
fs.writeFileSync(PSEUDO_OUTPUT, emitPseudoBindings(infos), "utf-8");
fs.writeFileSync(
  MANIFEST_OUTPUT,
  emitManifests([...infos, ...pseudoOnlyInfos]),
  "utf-8"
);

console.log(
  `Generated auto module bindings for ${infos.length} native module(s):`
);
for (const i of infos) {
  const key = i.requireKey ? `require("${i.requireKey}")` : "(not requirable)";
  const override = i.manifestExportText ? " +manifest-override" : "";
  console.log(`  ${i.className} → [${i.methodNames.join(", ")}] ${key}${override}`);
}
for (const i of pseudoOnlyInfos) {
  console.log(`  (pseudo-only) → require("${i.requireKey}")`);
}
console.log(`  → ${path.relative(REPO_ROOT, NATIVE_OUTPUT)}`);
console.log(`  → ${path.relative(REPO_ROOT, PSEUDO_OUTPUT)}`);
console.log(`  → ${path.relative(REPO_ROOT, MANIFEST_OUTPUT)}`);
