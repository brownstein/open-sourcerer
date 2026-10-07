import { DocEntry, DocModule, DocsRegistry } from "src/api/docs";

import { getCategoriesForDocPath } from "./allDocCategories";
import { FALLBACK_LOCALE } from "./configuration";
import { DocId, LocaleCode } from "./indexedDocs/docTypes";
import { getDocIdForDocPath, getLocaleCodeForDocPath } from "./util";

const docModules = import.meta.glob<DocModule>("./content/*/**/*.mdx", {
  eager: true
});

const docEntriesByLocale: DocsRegistry = new Map();

for (const [path, module] of Object.entries(docModules)) {
  const localeCode = getLocaleCodeForDocPath(path);
  const docId = getDocIdForDocPath(path);

  if (!localeCode || !docId) continue;

  const categoriesForDoc = getCategoriesForDocPath(path);
  const docParentCategory = categoriesForDoc.at(-1);

  const meta = module.meta;

  let localizedDocEntriesMap = docEntriesByLocale.get(localeCode);
  if (!localizedDocEntriesMap) {
    localizedDocEntriesMap = new Map();
    docEntriesByLocale.set(localeCode, localizedDocEntriesMap);
  }

  localizedDocEntriesMap.set(docId, {
    component: module.default,
    meta: {
      title: meta?.title ?? "Missing Doc Title",
      subtitle: meta?.subtitle,
      iconName: meta?.iconName,
      blockSearchIndexing:
        meta?.blockSearchIndexing ??
        docParentCategory?.blockSearchIndexing ??
        false,
      isUnlockable:
        meta?.isUnlockable ?? docParentCategory?.isUnlockable ?? false,
      bannerImage: meta?.bannerImage ?? null,
      categories: categoriesForDoc
    }
  });
}

export function getDocNoFallback(
  docId: DocId,
  locale: LocaleCode
): DocEntry | undefined {
  return docEntriesByLocale.get(locale)?.get(docId);
}

export function getDoc(docId: DocId, locale: LocaleCode): DocEntry | undefined {
  return (
    docEntriesByLocale.get(locale)?.get(docId) ??
    docEntriesByLocale.get(FALLBACK_LOCALE)?.get(docId)
  );
}

export const allDocIds: DocId[] = Array.from(
  new Set(
    Array.from(docEntriesByLocale.values()).flatMap((localizedRegistry) =>
      Array.from(localizedRegistry.keys())
    )
  )
).sort();

export const allDocLocales: LocaleCode[] = Array.from(
  docEntriesByLocale.keys()
).sort();

export function isDocId(possibleDocId: string): possibleDocId is DocId {
  return allDocIds.includes(possibleDocId as DocId);
}

export function isTutorialReference(possibleTutorialReference: string) {
  return possibleTutorialReference.startsWith("@tutorial/");
}

export function extractTutorialReference(tutorialString: string) {
  return tutorialString.split("/").slice(1).join("/");
}