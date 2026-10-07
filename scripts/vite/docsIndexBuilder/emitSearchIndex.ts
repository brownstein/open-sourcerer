import fs from "fs";
import path from "path";

import type { DocIndexChunk } from "../../../src/api/docs";
import { DOC_INDEX_EXTENSION } from "../../../src/docs/configuration";

const LOCALE_FILE_EXTENSION = DOC_INDEX_EXTENSION;
const DOC_TYPES_FILE_NAME = "docTypes.ts";

export function emitSearchIndexForLocale(
  outputDir: string,
  localeCode: string,
  chunks: DocIndexChunk[]
): void {
  fs.mkdirSync(outputDir, { recursive: true });
  const filePath = path.join(
    outputDir,
    `${localeCode}${LOCALE_FILE_EXTENSION}`
  );
  fs.writeFileSync(filePath, JSON.stringify(chunks, null, 2), "utf8");
}

export function removeObsoleteLocaleFiles(
  outputDir: string,
  presentLocaleCodes: string[]
): void {
  if (!fs.existsSync(outputDir)) return;
  const presentSet = new Set(presentLocaleCodes);
  for (const entry of fs.readdirSync(outputDir, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    if (entry.name === DOC_TYPES_FILE_NAME) continue;
    if (!entry.name.endsWith(LOCALE_FILE_EXTENSION)) continue;
    const locale = entry.name.slice(0, -LOCALE_FILE_EXTENSION.length);
    if (presentSet.has(locale)) continue;
    fs.rmSync(path.join(outputDir, entry.name));
  }
}
