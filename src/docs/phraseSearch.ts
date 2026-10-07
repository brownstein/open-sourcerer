/*
 * TODO: THERE ARE MANY ENGLISH ASSUMPTIONS BAKED IN THAT WON'T GET THE SAME QUALITY
 * SEARCH ACROSS LOCALES. FIX LATER
 */
import MiniSearch, { Options, SearchOptions, SearchResult } from "minisearch";

import {
  SEARCH_MAX_PHRASE_WINDOW_RANGE_FACTOR,
  SEARCH_MAX_RESULTS,
  SEARCH_PROCESS_TERM_FN,
  SEARCH_TOKENIZE_FN
} from "./configuration";

type DocumentType = Record<string, unknown>;
type DocumentPhraseSearchFieldType<T extends DocumentType> = {
  [K in keyof T]: T[K] extends string ? K : never;
}[keyof T];
type PhraseSearchOptions = Omit<
  SearchOptions,
  "combineWith" | "tokenize" | "processTerm"
>;

type PhraseSearchProps<T extends DocumentType> = Omit<
  Options<T>,
  "searchOptions" | "idField" | "tokenize" | "processTerm"
> & {
  searchOptions: PhraseSearchOptions;
  idField: keyof T;
  phraseSearchField: DocumentPhraseSearchFieldType<T>;
} & {
  documentsToSearch: T[];
};

type JumbleSearchResult<T extends DocumentType> = {
  id: any;
  queryToMatchedTermsMap: Map<string, string[]>;
  score: number;
  sourceDocument: T;
};

export type PositionedContentToken = {
  value: string;
  startChar: number;
  endChar: number;
};

export type MatchedPhraseSearchWindow = {
  startCharOffset: number;
  endCharOffset: number;
  tokenLength: number;
};

export type PhraseSearchResult<T extends DocumentType> =
  JumbleSearchResult<T> & {
    matchedPhrases: MatchedPhraseSearchWindow[];
  };

type IdOf<T extends DocumentType> = T[keyof T];

export class PhraseSearch<T extends DocumentType> {
  private readonly miniSearchInstance: MiniSearch<T>;
  private readonly idToDocumentMap: Map<IdOf<T>, T> = new Map();
  private readonly phraseSearchField: DocumentPhraseSearchFieldType<T>;

  constructor(options: PhraseSearchProps<T>) {
    const givenSearchOptions = options.searchOptions;

    this.miniSearchInstance = new MiniSearch<T>({
      ...options,
      idField: options.idField as string,
      tokenize: SEARCH_TOKENIZE_FN,
      processTerm: SEARCH_PROCESS_TERM_FN,
      searchOptions: {
        ...givenSearchOptions,
        combineWith: "AND",
        tokenize: SEARCH_TOKENIZE_FN,
        processTerm: SEARCH_PROCESS_TERM_FN
      }
    });
    this.miniSearchInstance.addAll(options.documentsToSearch);

    this.phraseSearchField = options.phraseSearchField;

    for (const document of options.documentsToSearch) {
      const documentId = document[options.idField];
      this.idToDocumentMap.set(documentId, document);
    }
  }

  static tokenizeString(stringToTokenize: string): string[] {
    return PhraseSearch.positionalTokenizeString(stringToTokenize).map(
      (token) => token.value
    );
  }

  static positionalTokenizeString(
    sourceText: string
  ): PositionedContentToken[] {
    const rawTokens = SEARCH_TOKENIZE_FN(sourceText);
    const positionedTokens: PositionedContentToken[] = [];
    let scanCursor = 0;

    for (const rawToken of rawTokens) {
      if (!rawToken) continue;
      const tokenStart = sourceText.indexOf(rawToken, scanCursor);
      if (tokenStart === -1) continue;
      const tokenEnd = tokenStart + rawToken.length;

      const processed = SEARCH_PROCESS_TERM_FN(rawToken);
      const processedValues = Array.isArray(processed)
        ? processed
        : typeof processed === "string"
          ? [processed]
          : [];

      for (const value of processedValues) {
        if (!value) continue;
        positionedTokens.push({
          value,
          startChar: tokenStart,
          endChar: tokenEnd
        });
      }

      scanCursor = tokenEnd;
    }

    return positionedTokens;
  }

  static findPhraseSearchWindows(
    positionedTokens: PositionedContentToken[],
    queryToMatchedTermsMap: Map<string, string[]>,
    maxPhraseWindowRange: number
  ): MatchedPhraseSearchWindow[] {
    const numberOfQueryTokens = queryToMatchedTermsMap.size;
    if (numberOfQueryTokens === 0) return [];

    const matchedTermsLookupByQueryToken = new Map<string, Set<string>>();
    for (const [queryToken, matchedTerms] of queryToMatchedTermsMap) {
      matchedTermsLookupByQueryToken.set(queryToken, new Set(matchedTerms));
    }

    const matchedQueryTokens: { token: string; tokenIndex: number }[] = [];
    const matchedQueryTokenCountsMap = new Map<string, number>();
    const matchedPhraseRanges: MatchedPhraseSearchWindow[] = [];

    for (
      let contentTokenIndex = 0;
      contentTokenIndex < positionedTokens.length;
      contentTokenIndex++
    ) {
      const contentToken = positionedTokens[contentTokenIndex];

      for (const [
        queryToken,
        matchedTermsLookup
      ] of matchedTermsLookupByQueryToken) {
        if (!matchedTermsLookup.has(contentToken.value)) continue;

        matchedQueryTokens.push({
          token: queryToken,
          tokenIndex: contentTokenIndex
        });

        const previousCount = matchedQueryTokenCountsMap.get(queryToken) ?? 0;
        matchedQueryTokenCountsMap.set(queryToken, previousCount + 1);
      }

      while (matchedQueryTokenCountsMap.size === numberOfQueryTokens) {
        const startingMatch = matchedQueryTokens.at(0);
        const endingMatch = matchedQueryTokens.at(-1);
        if (!startingMatch || !endingMatch) break;

        const currentPhraseTokenLength =
          endingMatch.tokenIndex - startingMatch.tokenIndex + 1;

        if (currentPhraseTokenLength > maxPhraseWindowRange) {
          const droppedMatch = matchedQueryTokens.shift();
          if (!droppedMatch) break;

          const droppedQueryToken = droppedMatch.token;
          const previousCount =
            matchedQueryTokenCountsMap.get(droppedQueryToken);
          if (!previousCount) break;

          const newCount = previousCount - 1;
          matchedQueryTokenCountsMap.set(droppedQueryToken, newCount);
          if (newCount === 0)
            matchedQueryTokenCountsMap.delete(droppedQueryToken);

          continue;
        }

        matchedPhraseRanges.push({
          startCharOffset: positionedTokens[startingMatch.tokenIndex].startChar,
          endCharOffset: positionedTokens[endingMatch.tokenIndex].endChar,
          tokenLength: currentPhraseTokenLength
        });

        matchedQueryTokens.length = 0;
        matchedQueryTokenCountsMap.clear();
      }
    }

    return matchedPhraseRanges;
  }

  search(query: string): PhraseSearchResult<T>[] {
    const jumbleOfWordsSearchResults = this._searchByJumbleOfWords(query);
    const phraseSearchResults = this._resolveJumbleOfWordsSearchToPhraseSearch(
      jumbleOfWordsSearchResults
    );

    phraseSearchResults.sort(
      (leftResult, rightResult) => rightResult.score - leftResult.score
    );

    phraseSearchResults.length = Math.min(
      phraseSearchResults.length,
      SEARCH_MAX_RESULTS
    );

    return phraseSearchResults;
  }

  private _searchByJumbleOfWords(query: string): JumbleSearchResult<T>[] {
    const tokenziedQuery = PhraseSearch.tokenizeString(query);
    const dedupedTokenizedQuery = Array.from(new Set(tokenziedQuery));

    const queryTokenToSearchResultsMap = new Map<
      (typeof dedupedTokenizedQuery)[number],
      Map<IdOf<T>, SearchResult>
    >();

    const documentsThatMatchEachQueryToken = new Set<IdOf<T>>();
    let isDoingFirstPassOfDocuments = true;

    for (const queryToken of dedupedTokenizedQuery) {
      const resultsForQueryToken = this.miniSearchInstance.search(queryToken, {
        filter: (result) => {
          if (isDoingFirstPassOfDocuments) return true;

          const docId = result.id;
          if (!documentsThatMatchEachQueryToken.has(docId)) return false;

          return true;
        }
      });

      isDoingFirstPassOfDocuments = false;
      documentsThatMatchEachQueryToken.clear();

      const idToSearchResultMap = new Map<IdOf<T>, SearchResult>();
      for (const result of resultsForQueryToken) {
        documentsThatMatchEachQueryToken.add(result.id);
        idToSearchResultMap.set(result.id, result);
      }

      queryTokenToSearchResultsMap.set(queryToken, idToSearchResultMap);
    }

    const results: JumbleSearchResult<T>[] = [];
    for (const survivedDocId of documentsThatMatchEachQueryToken) {
      const sourceDocument = this.idToDocumentMap.get(survivedDocId);
      if (!sourceDocument) continue;

      const resolvedPhraseSearchResult: JumbleSearchResult<T> = {
        id: survivedDocId,
        queryToMatchedTermsMap: new Map(),
        score: 0,
        sourceDocument: sourceDocument
      };

      for (const queryToken of dedupedTokenizedQuery) {
        const searchResultsForQueryToken =
          queryTokenToSearchResultsMap.get(queryToken);
        if (!searchResultsForQueryToken) continue;

        const survivedDocSearchResult =
          searchResultsForQueryToken.get(survivedDocId);
        if (!survivedDocSearchResult) continue;

        resolvedPhraseSearchResult.queryToMatchedTermsMap.set(
          queryToken,
          survivedDocSearchResult.terms
        );
        resolvedPhraseSearchResult.score += survivedDocSearchResult.score;
      }

      results.push(resolvedPhraseSearchResult);
    }

    return results;
  }

  private _resolveJumbleOfWordsSearchToPhraseSearch(
    jumbleOfWordsSearchResult: JumbleSearchResult<T>[]
  ): PhraseSearchResult<T>[] {
    const results: PhraseSearchResult<T>[] = [];

    for (const rawResult of jumbleOfWordsSearchResult) {
      const documentPhraseSearchContent = rawResult.sourceDocument[
        this.phraseSearchField
      ] as string;

      const positionedTokens = PhraseSearch.positionalTokenizeString(
        documentPhraseSearchContent
      );

      const numberOfQueryTokens = rawResult.queryToMatchedTermsMap.size;
      const maxPhraseWindowRange =
        numberOfQueryTokens * SEARCH_MAX_PHRASE_WINDOW_RANGE_FACTOR;

      const matchedPhrases = PhraseSearch.findPhraseSearchWindows(
        positionedTokens,
        rawResult.queryToMatchedTermsMap,
        maxPhraseWindowRange
      );

      if (matchedPhrases.length <= 0) continue;

      const finalScore = matchedPhrases.reduce((score, phrase) => {
        const phraseLengthExcess = phrase.tokenLength - numberOfQueryTokens;
        return score - phraseLengthExcess;
      }, rawResult.score);

      results.push({
        id: rawResult.id,
        queryToMatchedTermsMap: rawResult.queryToMatchedTermsMap,
        score: finalScore,
        matchedPhrases,
        sourceDocument: rawResult.sourceDocument
      });
    }

    return results;
  }
}
