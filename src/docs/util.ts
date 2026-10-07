import { DOC_EXTENSION, DOC_PATH_PREFIX } from "./configuration";
import { DocAnchor, DocId, LocaleCode } from "./indexedDocs/docTypes";

export function getLocaleCodeForDocPath(docPath: string): LocaleCode | null {
  if (!docPath.startsWith(DOC_PATH_PREFIX) || !docPath.endsWith(DOC_EXTENSION))
    return null;

  const cleanedDocPath = docPath.slice(DOC_PATH_PREFIX.length);

  const [localeCode, ..._restOfDelimitedPath] = cleanedDocPath.split("/");
  if (!localeCode) return null;

  return localeCode as LocaleCode;
}

export function getDocIdForDocPath(docPath: string): DocId | null {
  if (!docPath.startsWith(DOC_PATH_PREFIX) || !docPath.endsWith(DOC_EXTENSION))
    return null;

  const cleanedDocPath = docPath.slice(
    DOC_PATH_PREFIX.length,
    -DOC_EXTENSION.length
  );

  const [_localeCode, ...restOfDelimitedPath] = cleanedDocPath.split("/");
  if (restOfDelimitedPath.length === 0) return null;

  const docId = restOfDelimitedPath.join("/");

  return docId as DocId;
}

export function getDocFilenameForId(docId: DocId): string | null {
  const splitId = docId.split("/");

  const docFilename = splitId.at(-1);
  if (!docFilename) return null;

  return docFilename;
}

export function validateDocId(docId: DocId): DocId {
  return docId;
}

export function validateDocAnchor<TDocId extends DocId>(
  _docId: TDocId,
  anchorId: DocAnchor<TDocId>
): DocAnchor<TDocId> {
  return anchorId;
}
