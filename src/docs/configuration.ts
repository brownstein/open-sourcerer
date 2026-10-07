import { DocIndexChunkField } from "../api/docs";
import { LocaleCode } from "./indexedDocs/docTypes";

export const DOC_PATH_PREFIX = "./content/";
export const DOC_EXTENSION = ".mdx";

export const DOC_INDEX_PATH_PREFIX = "./indexedDocs/";
export const DOC_INDEX_EXTENSION = ".json";

export const INDEX_DOC_BASE_FILENAME = "index";
export const INDEX_DOC_FILENAME = INDEX_DOC_BASE_FILENAME + DOC_EXTENSION;

export const DEFINITION_DOC_ID_PREFIX = "definitions/";

export const CATEGORY_FILE_NAME = "_category.json";

export const FALLBACK_LOCALE: LocaleCode = "en";

export const SEARCHABLE_CHUNK_FIELDS = [
  "heading",
  "textContent",
  "codeContent"
] as const satisfies readonly DocIndexChunkField[];
export type SearchableChunkField = (typeof SEARCHABLE_CHUNK_FIELDS)[number];

export const SEARCHABLE_CHUNK_FIELD_BOOSTS: Record<
  SearchableChunkField,
  number
> = {
  heading: 1.6,
  textContent: 1.0,
  codeContent: 0.7
};

export const SEARCH_FUZZY_FACTOR = (term: string) =>
  term.length >= 3 ? 0.25 : 0;
export const SHOULD_SEARCH_PREFIX = (term: string) => term.length >= 3;
export const SEARCH_MAX_RESULTS = 20;

// claude provided tokenizer and term processor that has best UX. i.e., apostrophes not needed to match "we're"

// Apostrophes (ASCII + typographic) and hyphens/dashes (ASCII + Unicode dash
// block). When these sit between letter/number runs we keep them inside a
// single token so contractions ("we're") and compounds ("state-of-the-art")
// don't shatter at indexing time. Listed as a regex character class fragment
// so it can be reused in the tokenizer regex and the processTerm cleanup.
const INTRA_WORD_CONNECTOR_PATTERN =
  "[\\u0027\\u2018-\\u201B\\u002D\\u2010-\\u2015]";

// Word-like runs: \p{L} letters, \p{N} numbers, \p{M} combining marks (so an
// accented character matched as base+combining doesn't get split). Allows the
// connectors above as long as they sit between two letter/number runs. Works
// across any whitespace-separated alphabetic script (Latin, Cyrillic, Greek,
// Arabic, Hebrew, ...). Does NOT segment CJK / Thai / Lao / Khmer — those
// scripts have no spaces and need ICU segmentation; flagged in phraseSearch.ts.
const TOKEN_REGEX = new RegExp(
  `[\\p{L}\\p{N}\\p{M}]+(?:${INTRA_WORD_CONNECTOR_PATTERN}[\\p{L}\\p{N}\\p{M}]+)*`,
  "gu"
);
const INTRA_WORD_CONNECTOR_REGEX = new RegExp(
  INTRA_WORD_CONNECTOR_PATTERN,
  "gu"
);
const COMBINING_MARK_REGEX = /\p{M}/gu;

export const SEARCH_TOKENIZE_FN = (text: string): string[] => {
  return text.match(TOKEN_REGEX) ?? [];
};

// Normalizes a single token for matching:
//   1. NFD decompose so precomposed and base+combining forms unify.
//   2. Strip combining marks so "café" matches "cafe", "naïve" matches "naive".
//      (Diacritic-distinguishing locales like Vietnamese will lose precision
//      here; locale-aware override is a follow-up.)
//   3. toLowerCase via Unicode case folding tables.
// Then emit:
//   - The connector-collapsed form ("we're" -> "were", "state-of-the-art" ->
//     "stateoftheart") for direct matching.
//   - Plus each part split on connectors, so a query like "well known" can
//     match indexed "well-known" via AND-combined per-part hits.
// Returning an array is supported by minisearch — every emitted string is
// indexed (or, at search time, AND-ed against the index).
export const SEARCH_PROCESS_TERM_FN = (term: string): string | string[] => {
  const normalizedTerm = term
    .normalize("NFD")
    .replace(COMBINING_MARK_REGEX, "")
    .toLowerCase();

  const connectorCollapsedTerm = normalizedTerm.replace(
    INTRA_WORD_CONNECTOR_REGEX,
    ""
  );
  const splitParts = normalizedTerm
    .split(INTRA_WORD_CONNECTOR_REGEX)
    .filter(Boolean);

  if (splitParts.length <= 1) return connectorCollapsedTerm;
  return [connectorCollapsedTerm, ...splitParts];
};

export const SEARCH_MAX_PHRASE_WINDOW_RANGE_FACTOR = 2;
