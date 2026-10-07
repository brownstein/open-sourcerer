/**
 * wire-level-screenshots.ts
 *
 * For each `LevelDefinitionAPI` declared under src/levels/levels, if a
 * `<id>.png` file exists next to its source, ensure the source imports the
 * PNG and references it via `screenshotImage`. Idempotent: skips files that
 * already have the import + property.
 *
 * Usage:
 *   npm run scripts:compile && node scripts/ts/wire-level-screenshots.js
 */

import fs from "fs";
import path from "path";

import {
  Expression,
  Node,
  ObjectLiteralExpression,
  Project,
  SourceFile,
  VariableDeclaration
} from "ts-morph";

const LEVELS_DIR = path.resolve(__dirname, "../../src/levels/levels");
const TSCONFIG_PATH = path.resolve(__dirname, "../../tsconfig.json");

function resolveString(expr: Expression | undefined): string | undefined {
  if (!expr) return undefined;
  if (Node.isStringLiteral(expr) || Node.isNoSubstitutionTemplateLiteral(expr))
    return expr.getLiteralValue();
  if (Node.isIdentifier(expr)) {
    let symbol = expr.getSymbol();
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

function getLevelObjectLiteral(
  decl: VariableDeclaration
): ObjectLiteralExpression | undefined {
  const typeText = decl.getTypeNode()?.getText();
  if (typeText !== "LevelDefinitionAPI") return undefined;
  const init = decl.getInitializer();
  if (!init || !Node.isObjectLiteralExpression(init)) return undefined;
  return init;
}

function importNameFor(id: string): string {
  // Ids are letter/digit/underscore — already valid identifier chars.
  // Prefix to avoid colliding with anything else in the file.
  return `${id}Screenshot`;
}

function ensureScreenshotImport(
  file: SourceFile,
  importName: string,
  pngFileName: string
): boolean {
  const moduleSpecifier = `./${pngFileName}`;
  const existing = file
    .getImportDeclarations()
    .find((d) => d.getModuleSpecifierValue() === moduleSpecifier);
  if (existing) {
    if (existing.getDefaultImport()?.getText() === importName) return false;
    existing.setDefaultImport(importName);
    return true;
  }
  file.addImportDeclaration({
    defaultImport: importName,
    moduleSpecifier
  });
  return true;
}

function ensureScreenshotProperty(
  obj: ObjectLiteralExpression,
  importName: string
): boolean {
  const existing = obj.getProperty("screenshotImage");
  if (existing && Node.isPropertyAssignment(existing)) {
    const init = existing.getInitializer();
    if (init && init.getText() === importName) return false;
    existing.setInitializer(importName);
    return true;
  }
  // Insert after `id` so the field shows up near the top of the literal.
  const idProp = obj.getProperty("id");
  const idIndex = idProp ? obj.getProperties().indexOf(idProp) : -1;
  obj.insertPropertyAssignment(idIndex + 1, {
    name: "screenshotImage",
    initializer: importName
  });
  return true;
}

function main() {
  const project = new Project({ tsConfigFilePath: TSCONFIG_PATH });
  let updated = 0;
  let skippedNoPng = 0;
  let alreadyWired = 0;

  for (const file of project.getSourceFiles()) {
    const filePath = file.getFilePath();
    if (!filePath.startsWith(LEVELS_DIR + path.sep)) continue;

    let fileChanged = false;
    for (const decl of file.getVariableDeclarations()) {
      const obj = getLevelObjectLiteral(decl);
      if (!obj) continue;
      const idProp = obj.getProperty("id");
      if (!idProp || !Node.isPropertyAssignment(idProp)) continue;
      const id = resolveString(idProp.getInitializer());
      if (!id) continue;
      const pngPath = path.join(path.dirname(filePath), `${id}.png`);
      if (!fs.existsSync(pngPath)) {
        skippedNoPng++;
        continue;
      }
      const importName = importNameFor(id);
      const importChanged = ensureScreenshotImport(file, importName, `${id}.png`);
      const propChanged = ensureScreenshotProperty(obj, importName);
      if (importChanged || propChanged) {
        fileChanged = true;
        updated++;
        console.log(`wired  ${id}  (${path.relative(process.cwd(), filePath)})`);
      } else {
        alreadyWired++;
      }
    }
    if (fileChanged) file.saveSync();
  }

  console.log(
    `\nDone. updated=${updated}  alreadyWired=${alreadyWired}  noPng=${skippedNoPng}`
  );
}

main();
