import { MDXContent } from "mdx/types";

import { DocAnchor, DocId, LocaleCode } from "../docs/indexedDocs/docTypes";
import { IconName } from "src/components/ui/icons/Icon";

export type DocCategoryMeta = {
  label: string;
  blockSearchIndexing?: boolean;
  isUnlockable?: boolean;

  indexDocId: DocId;
};

export type DocCategoryModule = {
  default: Partial<Omit<DocCategoryMeta, "indexDocId">>;
};

export type DocMeta = {
  title: string;
  subtitle?: string;
  iconName?: IconName;
  blockSearchIndexing: boolean;
  isUnlockable: boolean;
  bannerImage: string | null;

  // WARN: do not manually define this.
  categories: Required<DocCategoryMeta>[];
  // expand later if we need to
};

export type DocModule = {
  default: MDXContent;
  meta?: Partial<Omit<DocMeta, "categories">>;
};

export type DocEntry = {
  component: MDXContent;
  meta: DocMeta;
};

export type LocalizedDocRegistry = Map<DocId, DocEntry>;
export type DocsRegistry = Map<LocaleCode, LocalizedDocRegistry>;

export type DocIndexChunk = {
  chunkId: string;
  headerId: string;
  docId: string;
  docTitle: string;
  heading: string;
  headingPath: string[];
  textContent: string;
  codeContent: string;
  rawContent: string;
};

export type DocIndexChunkField = keyof DocIndexChunk;

export type LocalizedDocIndex = DocIndexChunk[];
export type DocsIndexRegistry = Map<LocaleCode, LocalizedDocIndex>;

export type DocLocation<TDoc extends DocId> = {
  docId: TDoc;
  anchorId?: DocAnchor<TDoc>;
  shouldHighlight?: boolean;
};

export type DocsSearchResult = {
  docId: DocId;
  headerId: string;
  score: number;
  matchedPhrases: string[];
  rawIndexChunk: DocIndexChunk;
};

export type DocsSearchResultsGroupedByDoc = {
  docId: DocId;
  docTitle: string;
  results: DocsSearchResult[];
};
