import * as babel from "@babel/standalone";
import * as T from "@babel/types";

import { ValueCompletion } from "src/api/spells";

import { ApiEntry, ClassEntry, SpellApiManifests } from "./apiManifest";
import { JS_KEYWORDS } from "./jsKeywords";
import { SPELL_API_MANIFESTS } from "./spellApiManifests";
import { STANDARD_GLOBALS } from "./standardGlobals";

// ---------------------------------------------------------------------------
// Symbol table — maps variable names to what they hold
// ---------------------------------------------------------------------------
type SymbolEntry = {
  moduleName: string;
  /**
   * true  → variable holds an *instance* of the module's exported class
   *          (e.g. `var f = new fire(...)`)  → use `properties` for member lookup
   * false → variable holds the module export itself
   *          (e.g. `var fire = require("fire")`) → use `staticProperties` for
   *          class exports, `properties` for object/function exports
   */
  isInstance: boolean;
};

// ---------------------------------------------------------------------------
// Token chain extraction
// ---------------------------------------------------------------------------
// Scans the current line up to the cursor and returns a chain of dot-separated
// tokens. e.g. "f.blast" → ["f", "blast"], "f." → ["f", ""]
//
// Resets the chain on whitespace or non-dot operators so that only the
// immediately relevant chain is returned.
function extractTokenChain(line: string, col: number): string[] {
  const segment = line.slice(0, col);
  const chain: string[] = [];
  let tokenStart = 0;

  // NOTE: loop uses strict `< segment.length` so we never read past the end.
  // An `undefined` character (past end) must NOT reset the chain — that was
  // a bug that caused "fire." to return [""] instead of ["fire", ""].
  for (let i = 0; i < segment.length; i++) {
    const ch = segment[i];
    if (ch === ".") {
      chain.push(segment.slice(tokenStart, i));
      tokenStart = i + 1;
    } else if (
      ch === " " ||
      ch === "\t" ||
      ch === "," ||
      ch === ";" ||
      ch === "(" ||
      ch === ")" ||
      ch === "[" ||
      ch === "]" ||
      ch === "{" ||
      ch === "}" ||
      ch === "=" ||
      ch === "!" ||
      ch === "<" ||
      ch === ">"
    ) {
      // Reset chain on whitespace/operators
      chain.length = 0;
      tokenStart = i + 1;
    }
  }

  // Push the final partial token (what the user is currently typing)
  chain.push(segment.slice(tokenStart));

  return chain;
}

// ---------------------------------------------------------------------------
// Symbol table builder
// ---------------------------------------------------------------------------
function buildSymbolTable(
  ast: T.File,
  manifests: SpellApiManifests
): Record<string, SymbolEntry> {
  const symbols: Record<string, SymbolEntry> = {};

  const extractRequireModuleName = (
    node: T.Expression | null | undefined
  ): string | null => {
    if (!node) return null;
    if (
      node.type === "CallExpression" &&
      node.callee.type === "Identifier" &&
      node.callee.name === "require" &&
      node.arguments[0]?.type === "StringLiteral"
    ) {
      return node.arguments[0].value;
    }
    return null;
  };

  const extractNewExpressionModule = (
    node: T.Expression | null | undefined
  ): string | null => {
    if (!node || node.type !== "NewExpression") return null;
    const callee = node.callee;
    if (callee.type === "Identifier") {
      // new Fire(...) — look up Fire in already-built symbols
      return symbols[callee.name]?.moduleName ?? null;
    }
    if (
      callee.type === "MemberExpression" &&
      callee.object.type === "Identifier"
    ) {
      // new fire.Fireball(...) — look up fire
      return symbols[callee.object.name]?.moduleName ?? null;
    }
    return null;
  };

  const bindVariable = (name: string, init: T.Expression | null) => {
    if (!init) return;
    const moduleName = extractRequireModuleName(init);
    if (moduleName && manifests[moduleName]) {
      symbols[name] = { moduleName, isInstance: false };
      return;
    }
    const instanceModule = extractNewExpressionModule(init);
    if (instanceModule && manifests[instanceModule]) {
      symbols[name] = { moduleName: instanceModule, isInstance: true };
    }
  };

  // walkNode recurses into both statements AND expressions so that variables
  // declared inside function bodies (regular, expression, arrow) are seen.
  // The user may be editing inside a function passed to `new X({ ... })` or
  // inside an inline callback — we want their `var f = require(...)` to be
  // visible to autocomplete just like a top-level one.
  const walkNode = (node: T.Node | null | undefined) => {
    if (!node) return;
    switch (node.type) {
      case "File":
        walkNode(node.program);
        break;
      case "Program":
        for (const stmt of node.body) walkNode(stmt);
        break;
      case "VariableDeclaration":
        for (const decl of node.declarations) walkNode(decl);
        break;
      case "VariableDeclarator": {
        if (node.id.type === "Identifier" && node.init) {
          bindVariable(node.id.name, node.init);
        }
        if (node.init) walkNode(node.init);
        break;
      }
      case "ExpressionStatement":
        walkNode(node.expression);
        break;
      case "AssignmentExpression": {
        if (node.left.type === "Identifier") {
          bindVariable(node.left.name, node.right);
        }
        walkNode(node.right);
        break;
      }
      case "BlockStatement":
        for (const stmt of node.body) walkNode(stmt);
        break;
      case "IfStatement":
        walkNode(node.consequent);
        if (node.alternate) walkNode(node.alternate);
        break;
      case "WhileStatement":
      case "DoWhileStatement":
        walkNode(node.body);
        break;
      case "ForStatement":
        if (node.init) walkNode(node.init);
        if (node.body) walkNode(node.body);
        break;
      case "ForInStatement":
      case "ForOfStatement":
        walkNode(node.left);
        walkNode(node.body);
        break;
      case "SwitchStatement":
        for (const c of node.cases) {
          for (const s of c.consequent) walkNode(s);
        }
        break;
      case "TryStatement":
        walkNode(node.block);
        if (node.handler) walkNode(node.handler.body);
        if (node.finalizer) walkNode(node.finalizer);
        break;
      case "LabeledStatement":
        walkNode(node.body);
        break;
      case "ReturnStatement":
        if (node.argument) walkNode(node.argument);
        break;
      case "ThrowStatement":
        walkNode(node.argument);
        break;
      case "FunctionDeclaration":
      case "FunctionExpression":
      case "ArrowFunctionExpression":
      case "ObjectMethod":
      case "ClassMethod":
        walkNode(node.body);
        break;
      case "ClassDeclaration":
      case "ClassExpression":
        if (node.body && node.body.type === "ClassBody") {
          for (const member of node.body.body) walkNode(member);
        }
        break;
      case "CallExpression":
      case "NewExpression":
      case "OptionalCallExpression":
        for (const arg of node.arguments) walkNode(arg);
        break;
      case "ObjectExpression":
        for (const prop of node.properties) walkNode(prop);
        break;
      case "ObjectProperty":
        walkNode(node.value);
        break;
      case "ArrayExpression":
        for (const el of node.elements) walkNode(el);
        break;
      case "ConditionalExpression":
        walkNode(node.test);
        walkNode(node.consequent);
        walkNode(node.alternate);
        break;
      case "LogicalExpression":
      case "BinaryExpression":
        walkNode(node.left);
        walkNode(node.right);
        break;
      case "UnaryExpression":
      case "UpdateExpression":
      case "SpreadElement":
      case "AwaitExpression":
      case "YieldExpression":
        walkNode(node.argument);
        break;
      case "SequenceExpression":
        for (const e of node.expressions) walkNode(e);
        break;
      case "TemplateLiteral":
        for (const e of node.expressions) walkNode(e);
        break;
      case "TaggedTemplateExpression":
        walkNode(node.tag);
        walkNode(node.quasi);
        break;
      default:
        break;
    }
  };

  walkNode(ast);
  return symbols;
}

// ---------------------------------------------------------------------------
// Completion generation from manifest entries
// ---------------------------------------------------------------------------

/**
 * Returns the properties to complete against for an entry.
 *
 * @param isInstance true when the variable holds an *instance* of a class
 *   (e.g. `var f = new fire()`). In that case we expose instance `properties`.
 *   When false (the variable holds the export/class itself) we expose
 *   `staticProperties` for class exports (falling back to `properties`), and
 *   `properties` for object/function exports.
 */
function getEntryProperties(
  entry: ApiEntry,
  isInstance = false
): Record<string, ApiEntry> | undefined {
  if (entry.kind === "object") return entry.properties;
  if (entry.kind === "function") return entry.properties;
  if (entry.kind === "class") {
    if (isInstance) return entry.properties;
    return entry.staticProperties ?? entry.properties;
  }
  return undefined;
}

function entryToCompletion(name: string, entry: ApiEntry): ValueCompletion {
  const isCallable = entry.kind === "function" || entry.kind === "class";

  const docParts: string[] = [];
  if (entry.description) docParts.push(entry.description);

  if (entry.kind === "function") {
    if (entry.params?.length) {
      docParts.push(
        "Params: " +
          entry.params
            .map((p) => `${p.name}${p.optional ? "?" : ""}: ${p.type}`)
            .join(", ")
      );
    }
    if (entry.returns) docParts.push("Returns: " + entry.returns);
  } else if (entry.kind === "class") {
    if (entry.constructorParams?.length) {
      docParts.push(
        "Constructor: " +
          entry.constructorParams
            .map((p) => `${p.name}${p.optional ? "?" : ""}: ${p.type}`)
            .join(", ")
      );
    }
  } else if (entry.kind === "value") {
    docParts.push("Type: " + entry.valueType);
  }

  return {
    value: isCallable ? `${name}(` : name,
    score: 1000,
    meta: entry.kind,
    docText: docParts.join("\n") || name
  };
}

function constructorOptToCompletion(
  name: string,
  entry: ApiEntry
): ValueCompletion {
  const docParts: string[] = [];
  if (entry.description) docParts.push(entry.description);
  if (entry.kind === "value") docParts.push("Type: " + entry.valueType);

  return {
    value: name + ": ",
    score: 1000,
    meta: "opt",
    docText: docParts.join("\n") || name
  };
}

function getPropertyCompletions(
  entry: ApiEntry,
  prefix: string,
  isInstance = false
): ValueCompletion[] {
  const props = getEntryProperties(entry, isInstance);
  if (!props) return [];
  return Object.entries(props)
    .filter(([name]) => name.startsWith(prefix))
    .map(([name, child]) => entryToCompletion(name, child));
}

// ---------------------------------------------------------------------------
// Resolve a dot-separated class path against a manifest entry
// e.g. classPath=["Fireball"] starting from fire.export → Fireball ClassEntry
// ---------------------------------------------------------------------------
function resolveClassPath(
  root: ApiEntry,
  classPath: string[]
): { entry: ApiEntry; isInstance: false } | null {
  let current = root;
  for (const segment of classPath) {
    // When accessing a property on a class itself, use staticProperties first
    const props = getEntryProperties(current, false);
    if (!props?.[segment]) return null;
    current = props[segment];
  }
  return { entry: current, isInstance: false };
}

// ---------------------------------------------------------------------------
// Multi-line bracket-stack scanner
// ---------------------------------------------------------------------------
// Used to figure out where the cursor sits relative to nested ()/[]/{}.
// Returns the stack of open brackets at the cursor position, each entry
// recording its char and absolute index into `text`. Handles strings and
// comments so brackets inside them are ignored.
type OpenBracket = { char: "(" | "[" | "{"; pos: number };

function scanBracketStack(text: string): OpenBracket[] {
  const stack: OpenBracket[] = [];
  let inString: string | null = null;
  let escape = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inLineComment) {
      if (ch === "\n") inLineComment = false;
      continue;
    }
    if (inBlockComment) {
      if (ch === "*" && next === "/") {
        inBlockComment = false;
        i++;
      }
      continue;
    }
    if (inString) {
      if (escape) {
        escape = false;
      } else if (ch === "\\") {
        escape = true;
      } else if (ch === inString) {
        inString = null;
      }
      continue;
    }
    if (ch === "/" && next === "/") {
      inLineComment = true;
      i++;
      continue;
    }
    if (ch === "/" && next === "*") {
      inBlockComment = true;
      i++;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      inString = ch;
      continue;
    }
    if (ch === "(" || ch === "[" || ch === "{") {
      stack.push({ char: ch, pos: i });
    } else if (ch === ")" || ch === "]" || ch === "}") {
      stack.pop();
    }
  }
  return stack;
}

// If the cursor sits at the top level of an opts object inside
// `new IDENT(...IDENT.IDENT...)({` (allowing multi-line and whitespace),
// returns the dotted path and the position of the opening `{`. Otherwise null.
function findNewCtorOptsContext(
  text: string
): { path: string; openBracePos: number } | null {
  const stack = scanBracketStack(text);
  if (stack.length < 2) return null;
  const top = stack[stack.length - 1];
  if (top.char !== "{") return null;
  const parent = stack[stack.length - 2];
  if (parent.char !== "(") return null;

  // The `{` must be the first non-whitespace token inside the `(`
  // (no positional args before the opts object).
  const between = text.slice(parent.pos + 1, top.pos);
  if (between.trim() !== "") return null;

  // Walk backward from the `(` over whitespace, then a dotted identifier,
  // then whitespace, then "new" (as a whole word).
  let j = parent.pos - 1;
  while (j >= 0 && /\s/.test(text[j])) j--;
  const pathEnd = j + 1;
  while (j >= 0 && /[\w$.]/.test(text[j])) j--;
  const path = text.slice(j + 1, pathEnd);
  if (!path) return null;
  while (j >= 0 && /\s/.test(text[j])) j--;
  if (j < 2) return null;
  if (text.slice(j - 2, j + 1) !== "new") return null;
  if (j - 3 >= 0 && /[\w$]/.test(text[j - 3])) return null;

  return { path, openBracePos: top.pos };
}

// ---------------------------------------------------------------------------
// Top-level (chain.length === 1) static completion sources
// ---------------------------------------------------------------------------
function keywordCompletions(prefix: string): ValueCompletion[] {
  return JS_KEYWORDS.filter((kw) => kw.startsWith(prefix)).map((kw) => ({
    value: kw,
    score: 100,
    meta: "keyword",
    docText: kw
  }));
}

function standardGlobalCompletions(prefix: string): ValueCompletion[] {
  return Object.entries(STANDARD_GLOBALS)
    .filter(([name]) => name.startsWith(prefix))
    .map(([name, entry]) => {
      const isCallable = entry.kind === "function" || entry.kind === "class";
      return {
        value: isCallable ? `${name}(` : name,
        score: 300,
        meta: entry.kind === "class" ? "global class" : "global",
        docText: entry.description ?? name
      };
    });
}

// ---------------------------------------------------------------------------
// Main autocomplete function
// ---------------------------------------------------------------------------
export function computeAutocomplete(
  code: string,
  row: number,
  col: number,
  manifests: SpellApiManifests = SPELL_API_MANIFESTS
): ValueCompletion[] {
  const allLines = code.split("\n");
  const currentLine = allLines[row] ?? "";
  const beforeCursor = currentLine.slice(0, col);

  // Text from start of source up to (but not including) the cursor — used by
  // the bracket-stack scanner so multi-line `new X({` contexts work.
  const textBeforeCursor =
    allLines.slice(0, row).join("\n") +
    (row > 0 ? "\n" : "") +
    beforeCursor;

  // --- Parse code to build symbols ---
  // Use the full source with the current line blanked so the surrounding
  // context (e.g. a function's closing brace) is included, keeping the AST
  // valid even when the cursor is inside an incomplete block.
  const codeForParsing =
    allLines.map((line, i) => (i === row ? "" : line)).join("\n") || "//";
  let ast: T.File | null = null;
  try {
    const result = babel.transform(codeForParsing, {
      parserOpts: {
        errorRecovery: true,
        allowReturnOutsideFunction: true,
        allowSuperOutsideMethod: true,
        allowUndeclaredExports: true
      } as object,
      ast: true,
      code: false,
      plugins: [],
      presets: []
    });
    ast = result.ast ?? null;
  } catch {
    // parse completely failed; still try below with empty symbols
  }

  const symbols = ast ? buildSymbolTable(ast, manifests) : {};

  // --- Special case 1: completing inside require("...") ---
  const requireStringMatch = beforeCursor.match(
    /require\s*\(\s*["']([^"']*)$/
  );
  if (requireStringMatch) {
    const modulePrefix = requireStringMatch[1];
    return Object.entries(manifests)
      .filter(([name]) => name.startsWith(modulePrefix))
      .map(([name, manifest]) => ({
        value: name,
        score: 500,
        meta: "module",
        docText: manifest.description ?? `The ${name} spell module.`
      }));
  }

  // --- Special case 2: inside `new X({` constructor opts (multi-line) ---
  // The bracket-stack scanner finds an unmatched `{` that sits directly inside
  // an unmatched `(` preceded by `new IDENT.IDENT...`. Falls back gracefully
  // when not in that context.
  const ctorCtx = findNewCtorOptsContext(textBeforeCursor);
  if (ctorCtx) {
    const rawPath = ctorCtx.path.split(".");
    const headVar = rawPath[0];
    const restPath = rawPath.slice(1);

    const headEntry = symbols[headVar];
    const moduleName = headEntry?.moduleName ?? headVar;
    const manifest = manifests[moduleName];

    if (manifest) {
      const resolved = restPath.length
        ? resolveClassPath(manifest.export, restPath)
        : { entry: manifest.export, isInstance: false as const };

      if (resolved) {
        const classEntry = resolved.entry;
        const opts =
          classEntry.kind === "class"
            ? (classEntry as ClassEntry).constructorOpts
            : undefined;

        if (opts) {
          // Extract the partial opt-key prefix. Span everything inside the
          // opts brace up to the cursor, take the slice after the last `,`
          // (or `{`), and pull the leading word. If a `:` appears, the cursor
          // is in a value expression — bail to fall through to chain logic.
          const optsContent = textBeforeCursor.slice(ctorCtx.openBracePos + 1);
          const afterLastSep =
            optsContent.replace(/[\s\S]*[{,]/, "") || optsContent;
          if (!afterLastSep.includes(":")) {
            const prefix =
              afterLastSep.trimStart().match(/^[\w$]*/)?.[0] ?? "";
            return Object.entries(opts)
              .filter(([name]) => name.startsWith(prefix))
              .map(([name, entry]) => constructorOptToCompletion(name, entry));
          }
        }
      }
    }
    // No matching opts — fall through to chain resolution.
  }

  // --- Extract the token chain at the cursor ---
  const chain = extractTokenChain(currentLine, col);
  if (!chain.length || chain.every((t) => t === "")) return [];

  // --- chain.length === 1: top-level name completions ---
  if (chain.length === 1) {
    const prefix = chain[0];
    const results: ValueCompletion[] = [];

    // Variables in scope that match
    for (const [varName, entry] of Object.entries(symbols)) {
      if (!varName.startsWith(prefix)) continue;
      const manifest = manifests[entry.moduleName];
      results.push({
        value: varName,
        score: 900,
        meta: entry.isInstance ? "instance" : "import",
        docText:
          manifest?.description ?? `require("${entry.moduleName}") import.`
      });
    }

    // Standard JS globals (Math, Promise, JSON, console, etc.)
    results.push(...standardGlobalCompletions(prefix));

    // JS keywords (var, for, if, function, async, ...)
    results.push(...keywordCompletions(prefix));

    return results;
  }

  // --- chain.length >= 2: resolve head variable → walk chain ---
  const headVar = chain[0];
  const headEntry = symbols[headVar];

  // Resolve the head: user variable → standard global → bare module name.
  let currentEntry: ApiEntry;
  let currentIsInstance: boolean;
  if (headEntry) {
    const manifest = manifests[headEntry.moduleName];
    if (!manifest) return [];
    currentEntry = manifest.export;
    currentIsInstance = headEntry.isInstance;
  } else if (STANDARD_GLOBALS[headVar]) {
    currentEntry = STANDARD_GLOBALS[headVar];
    currentIsInstance = false;
  } else if (manifests[headVar]) {
    currentEntry = manifests[headVar].export;
    currentIsInstance = false;
  } else {
    return [];
  }

  // Walk through middle tokens (chain[1] .. chain[chain.length-2])
  for (let i = 1; i < chain.length - 1; i++) {
    const token = chain[i];
    const props = getEntryProperties(currentEntry, currentIsInstance);
    if (!props?.[token]) return [];
    currentEntry = props[token];
    // Once we've navigated into a property, we're no longer at the
    // "instance vs class" boundary — treat subsequent access as non-instance
    // (accessing a property on whatever was returned)
    currentIsInstance = false;
  }

  // The last element is the prefix to filter by
  const prefix = chain[chain.length - 1];
  return getPropertyCompletions(currentEntry, prefix, currentIsInstance);
}
