import { DocEntry } from "src/api/docs";

import { getDoc } from "./allDocs";
import { DEFINITION_DOC_ID_PREFIX } from "./configuration";
import { DocId, LocaleCode } from "./indexedDocs/docTypes";

type DefinitionDocIdPrefixType = typeof DEFINITION_DOC_ID_PREFIX;

// this is cool :)
type ExtractDefinitionDocIds<T> =
  T extends `${DefinitionDocIdPrefixType}${infer Id}` ? Id : never;
export type DefinitionDocId = ExtractDefinitionDocIds<DocId>;

export function getDefinitionDoc(
  definitionDocId: DefinitionDocId,
  locale: LocaleCode
): DocEntry | undefined {
  const docId = `${DEFINITION_DOC_ID_PREFIX}${definitionDocId}` as DocId;

  return getDoc(docId, locale);
}
