import { DocCategoryMeta, DocCategoryModule } from "src/api/docs";

import {
  CATEGORY_FILE_NAME,
  DOC_EXTENSION,
  DOC_PATH_PREFIX,
  INDEX_DOC_FILENAME
} from "./configuration";
import { LocaleCode } from "./indexedDocs/docTypes";
import { getDocIdForDocPath } from "./util";

const categoryModules = import.meta.glob<DocCategoryModule>(
  "./content/*/**/_category.json",
  { eager: true }
);

const categoryByDirectoryPath = new Map<string, DocCategoryMeta>();

for (const [path, module] of Object.entries(categoryModules)) {
  if (!path.startsWith(DOC_PATH_PREFIX) || !path.endsWith(CATEGORY_FILE_NAME))
    continue;

  const categoryParentDirectoryPath = path.slice(0, -CATEGORY_FILE_NAME.length);

  const categoryIndexDocPath = categoryParentDirectoryPath + INDEX_DOC_FILENAME;
  const categoryIndexDocId = getDocIdForDocPath(categoryIndexDocPath);

  const meta = module.default;

  categoryByDirectoryPath.set(categoryParentDirectoryPath, {
    label: meta.label ?? "Missing Category Label",
    isUnlockable: meta.isUnlockable,
    blockSearchIndexing: meta.blockSearchIndexing,
    indexDocId: categoryIndexDocId ?? "index"
  });
}

function resolveCategories(
  categories: DocCategoryMeta[]
): Required<DocCategoryMeta>[] {
  const resolveCategory = (
    currentCategory: DocCategoryMeta,
    prevCategory?: DocCategoryMeta
  ): Required<DocCategoryMeta> => {
    return {
      label: currentCategory.label,
      blockSearchIndexing:
        currentCategory.blockSearchIndexing ??
        prevCategory?.blockSearchIndexing ??
        false,
      isUnlockable:
        currentCategory.isUnlockable ?? prevCategory?.isUnlockable ?? false,
      indexDocId: currentCategory.indexDocId
    };
  };

  const resolvedCategories: Required<DocCategoryMeta>[] = [];
  for (const category of categories) {
    const previousResolvedCategory = resolvedCategories.at(-1);
    const newResolvedCategory = resolveCategory(
      category,
      previousResolvedCategory
    );
    resolvedCategories.push(newResolvedCategory);
  }

  return resolvedCategories;
}

export function getCategoriesForDocPath(
  docPath: string
): Required<DocCategoryMeta>[] {
  if (!docPath.startsWith(DOC_PATH_PREFIX) || !docPath.endsWith(DOC_EXTENSION))
    return [];

  const cleanedDocPath = docPath.slice(DOC_PATH_PREFIX.length);
  const delimitedDocPath = cleanedDocPath.split("/");
  const categoryParentDirectories = delimitedDocPath.slice(0, -1); // drop filename

  const unresolvedDocCategories: DocCategoryMeta[] = [];

  let currentExploredPath = DOC_PATH_PREFIX;
  for (const categoryDirectory of categoryParentDirectories) {
    currentExploredPath += categoryDirectory + "/";

    const category = categoryByDirectoryPath.get(currentExploredPath);
    if (category) unresolvedDocCategories.push(category);
  }

  return resolveCategories(unresolvedDocCategories);
}

export function getAllCategoriesForLocale(
  locale: LocaleCode
): DocCategoryMeta[] {
  const pathPrefixForLocale = DOC_PATH_PREFIX + locale + "/";

  const categories: DocCategoryMeta[] = [];

  for (const [path, category] of categoryByDirectoryPath) {
    if (!path.startsWith(pathPrefixForLocale)) continue;

    categories.push(category);
  }

  return categories;
}
