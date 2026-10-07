import {
  DocIndexChunk,
  DocsIndexRegistry,
  LocalizedDocIndex
} from "src/api/docs";

import { DOC_INDEX_EXTENSION, DOC_INDEX_PATH_PREFIX } from "./configuration";
import { LocaleCode } from "./indexedDocs/docTypes";

const docIndexModules = import.meta.glob<{ default: LocalizedDocIndex }>(
  "./indexedDocs/*.json",
  { eager: true }
);

const docIndexByLocale: DocsIndexRegistry = new Map();

for (const [path, module] of Object.entries(docIndexModules)) {
  if (
    !path.startsWith(DOC_INDEX_PATH_PREFIX) ||
    !path.endsWith(DOC_INDEX_EXTENSION)
  )
    continue;

  const localeCode = path.slice(
    DOC_INDEX_PATH_PREFIX.length,
    -DOC_INDEX_EXTENSION.length
  );
  if (!localeCode) continue;

  const typedLocaleCode = localeCode as LocaleCode;
  docIndexByLocale.set(typedLocaleCode, module.default);
}

export function getDocIndex(locale: LocaleCode): DocIndexChunk[] {
  return docIndexByLocale.get(locale) ?? [];
}

export const allAvailableIndexedLocales: LocaleCode[] = Array.from(
  docIndexByLocale.keys()
).sort();
