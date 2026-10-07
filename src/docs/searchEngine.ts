import {
  DocIndexChunk,
  DocsSearchResult,
  DocsSearchResultsGroupedByDoc
} from "src/api/docs";

import { allAvailableIndexedLocales, getDocIndex } from "./allDocIndexes";
import {
  SEARCHABLE_CHUNK_FIELDS,
  SEARCHABLE_CHUNK_FIELD_BOOSTS,
  SEARCH_FUZZY_FACTOR,
  SHOULD_SEARCH_PREFIX
} from "./configuration";
import { DocId, LocaleCode } from "./indexedDocs/docTypes";
import { PhraseSearch } from "./phraseSearch";

function buildEngineForLocale(locale: LocaleCode): PhraseSearch<DocIndexChunk> {
  const indexChunksForLocale = getDocIndex(locale);

  const phraseSearch = new PhraseSearch<DocIndexChunk>({
    idField: "chunkId",
    fields: [...SEARCHABLE_CHUNK_FIELDS],
    phraseSearchField: "rawContent",
    documentsToSearch: indexChunksForLocale,
    searchOptions: {
      prefix: SHOULD_SEARCH_PREFIX,
      fuzzy: SEARCH_FUZZY_FACTOR,
      boost: SEARCHABLE_CHUNK_FIELD_BOOSTS
    }
  });

  return phraseSearch;
}

const searchEngineByLocale = new Map<LocaleCode, PhraseSearch<DocIndexChunk>>();

for (const locale of allAvailableIndexedLocales) {
  searchEngineByLocale.set(locale, buildEngineForLocale(locale));
}

export function searchDocs(
  query: string,
  locale: LocaleCode
): DocsSearchResult[] {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) return [];

  const engineForLocale = searchEngineByLocale.get(locale);
  if (!engineForLocale) return [];

  const rawResults = engineForLocale.search(trimmedQuery);

  const results: DocsSearchResult[] = [];
  for (const result of rawResults) {
    const sourceText = result.sourceDocument.rawContent;
    const matchedPhraseStrings = result.matchedPhrases.map((range) =>
      sourceText.slice(range.startCharOffset, range.endCharOffset)
    );

    results.push({
      docId: result.sourceDocument.docId as DocId,
      headerId: result.sourceDocument.headerId,
      score: result.score,
      matchedPhrases: matchedPhraseStrings,
      rawIndexChunk: result.sourceDocument
    });
  }

  return results;
}

export function groupSearchResultsByDoc(
  results: DocsSearchResult[]
): DocsSearchResultsGroupedByDoc[] {
  const groupsByDocId = new Map<DocId, DocsSearchResultsGroupedByDoc>();

  for (const result of results) {
    let group = groupsByDocId.get(result.docId);
    if (!group) {
      group = {
        docId: result.docId,
        docTitle: result.rawIndexChunk.docTitle,
        results: []
      };
      groupsByDocId.set(result.docId, group);
    }

    group.results.push(result);
  }

  return Array.from(groupsByDocId.values());
}
