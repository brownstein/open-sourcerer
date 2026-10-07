/**
 * screenshot-levels.ts
 *
 * Walks src/levels/levels for level definitions and captures a 512x512 PNG
 * screenshot of each via the dev server's `?screenshot=<level_id>` hook,
 * placing the PNG next to its source file. Skips levels whose PNG already
 * exists.
 *
 * Prereq: the dev server must be running (`npm start`).
 *
 * Usage:
 *   npm run scripts:compile && node scripts/ts/screenshot-levels.js
 */

import fs from "fs";
import path from "path";

import { Browser, BrowserContext, chromium } from "playwright";
import { Expression, Node, Project, SourceFile } from "ts-morph";

const DEV_SERVER_URL =
  process.env.SCREENSHOT_DEV_SERVER_URL ?? "http://localhost:3000";
const LEVELS_DIR = path.resolve(__dirname, "../../src/levels/levels");
const TSCONFIG_PATH = path.resolve(__dirname, "../../tsconfig.json");
const PER_LEVEL_TIMEOUT_MS = 5000;

type LevelEntry = { id: string; sourceFile: string };

// Resolves an Expression to a string. Handles:
//   - "literal" string
//   - `template` with no substitutions
//   - identifiers (including imported ones) that resolve to a string-valued const
function resolveString(expr: Expression | undefined): string | undefined {
  if (!expr) return undefined;
  if (Node.isStringLiteral(expr) || Node.isNoSubstitutionTemplateLiteral(expr))
    return expr.getLiteralValue();
  if (Node.isIdentifier(expr)) {
    let symbol = expr.getSymbol();
    // Cross-file imports surface as alias symbols; follow them to the real decl.
    if (symbol) {
      try {
        symbol = symbol.getAliasedSymbol() ?? symbol;
      } catch {
        // not an alias
      }
    }
    for (const decl of symbol?.getDeclarations() ?? []) {
      if (Node.isVariableDeclaration(decl)) {
        const resolved = resolveString(decl.getInitializer());
        if (resolved !== undefined) return resolved;
      }
    }
  }
  return undefined;
}

// Walks the property assignments of an object literal looking for `id`,
// returning the resolved string if present.
function extractIdFromObject(expr: Expression): string | undefined {
  if (!Node.isObjectLiteralExpression(expr)) return undefined;
  const idProp = expr.getProperty("id");
  if (!idProp || !Node.isPropertyAssignment(idProp)) return undefined;
  return resolveString(idProp.getInitializer());
}

function extractLevelIdsFromFile(file: SourceFile): string[] {
  const ids: string[] = [];
  for (const decl of file.getVariableDeclarations()) {
    const typeText = decl.getTypeNode()?.getText();
    if (typeText !== "LevelDefinitionAPI" && typeText !== "LevelDefinitionAPI[]")
      continue;
    const init = decl.getInitializer();
    if (!init) continue;
    if (Node.isObjectLiteralExpression(init)) {
      const id = extractIdFromObject(init);
      if (id) ids.push(id);
      continue;
    }
    if (Node.isArrayLiteralExpression(init)) {
      for (const el of init.getElements()) {
        const id = extractIdFromObject(el);
        if (id) ids.push(id);
      }
    }
    // Other initializers (e.g. `challenges.map(...)`) cannot be resolved
    // statically and are skipped.
  }
  return ids;
}

function findLevelDefinitions(): LevelEntry[] {
  const project = new Project({ tsConfigFilePath: TSCONFIG_PATH });
  const entries: LevelEntry[] = [];
  const seen = new Set<string>();

  for (const file of project.getSourceFiles()) {
    const filePath = file.getFilePath();
    if (!filePath.startsWith(LEVELS_DIR + path.sep)) continue;
    const base = path.basename(filePath);
    if (base === "allLevels.ts" || base === "levelAdjacencies.ts") continue;

    for (const id of extractLevelIdsFromFile(file)) {
      if (seen.has(id)) continue;
      seen.add(id);
      entries.push({ id, sourceFile: filePath });
    }
  }

  entries.sort((a, b) => a.id.localeCompare(b.id));
  return entries;
}

async function devServerIsRunning(): Promise<boolean> {
  try {
    const res = await fetch(DEV_SERVER_URL);
    return res.ok || res.status < 500;
  } catch {
    return false;
  }
}

async function captureScreenshot(
  context: BrowserContext,
  levelId: string,
  savePath: string
): Promise<void> {
  const page = await context.newPage();
  const errors: string[] = [];

  // Abort the download wait as soon as a page-level error fires. Without this
  // a broken level burns the full timeout before we move on.
  let rejectAbort: ((err: Error) => void) | undefined;
  const abortPromise = new Promise<never>((_, reject) => {
    rejectAbort = reject;
  });
  const recordError = (msg: string) => {
    errors.push(msg);
    rejectAbort?.(new Error(`page error: ${msg}`));
    rejectAbort = undefined;
  };
  page.on("pageerror", (err) => recordError(err.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") recordError(msg.text());
  });

  try {
    const downloadPromise = page.waitForEvent("download", {
      timeout: PER_LEVEL_TIMEOUT_MS
    });
    await page.goto(
      `${DEV_SERVER_URL}/?screenshot=${encodeURIComponent(levelId)}`,
      { waitUntil: "load", timeout: PER_LEVEL_TIMEOUT_MS }
    );
    const download = await Promise.race([downloadPromise, abortPromise]);
    await download.saveAs(savePath);
  } catch (err) {
    const detail = errors.length ? `\n  page errors: ${errors.join(" | ")}` : "";
    throw new Error(`${(err as Error).message}${detail}`);
  } finally {
    await page.close();
  }
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  if (dryRun) {
    const definitions = findLevelDefinitions();
    console.log(`Found ${definitions.length} level definitions:`);
    for (const { id, sourceFile } of definitions) {
      console.log(`  ${id}\t${path.relative(process.cwd(), sourceFile)}`);
    }
    return;
  }

  if (!(await devServerIsRunning())) {
    console.error(
      `Dev server not reachable at ${DEV_SERVER_URL}. Start it with \`npm start\` and rerun.`
    );
    process.exit(1);
  }

  const definitions = findLevelDefinitions();
  console.log(`Found ${definitions.length} level definitions.`);

  let browser: Browser | undefined;
  let context: BrowserContext | undefined;
  let captured = 0;
  let skipped = 0;
  let failed = 0;

  try {
    browser = await chromium.launch({
      args: [
        "--use-gl=angle"
      ]
    });
    context = await browser.newContext({ acceptDownloads: true });

    for (const { id, sourceFile } of definitions) {
      const savePath = path.join(path.dirname(sourceFile), `${id}.png`);
      const rel = path.relative(process.cwd(), savePath);

      if (fs.existsSync(savePath)) {
        skipped++;
        console.log(`skip   ${id}  (${rel} exists)`);
        continue;
      }

      console.log(`start  ${id}`);
      try {
        await captureScreenshot(context, id, savePath);
        captured++;
        console.log(`saved  ${id}  -> ${rel}`);
      } catch (err) {
        failed++;
        console.error(`fail   ${id}: ${(err as Error).message}`);
      }
    }
  } finally {
    await context?.close();
    await browser?.close();
  }

  console.log(
    `\nDone. captured=${captured}  skipped=${skipped}  failed=${failed}`
  );
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
