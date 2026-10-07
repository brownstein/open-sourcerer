import { load } from "cheerio";
import type { AnyNode } from "domhandler";

import type { DocIndexChunk } from "../../../src/api/docs";

const HEADING_TAGS = new Set(["h1", "h2", "h3", "h4", "h5", "h6"]);
const CODE_TAGS = new Set(["code", "pre"]);

type ContentParts = {
  textParts: string[];
  codeParts: string[];
  rawParts: string[];
};

function joinAndCollapse(parts: string[]): string {
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

// Collects every descendant text node into a single concatenated string
// without inserting separators. Used for code subtrees so that syntax-
// highlighter span splits (one <span> per token) don't introduce spurious
// whitespace between adjacent tokens.
function concatDescendantText(node: AnyNode): string {
  const collected: string[] = [];
  function visit(current: AnyNode) {
    if (current.type === "text") {
      if (current.data) collected.push(current.data);
      return;
    }
    if (current.type !== "tag") return;
    for (const child of current.children) visit(child);
  }
  visit(node);
  return collected.join("");
}

function getHeadingText(node: AnyNode): string {
  const collected: string[] = [];
  function visit(current: AnyNode) {
    if (current.type === "text") {
      if (current.data) collected.push(current.data);
      return;
    }
    if (current.type !== "tag") return;
    for (const child of current.children) visit(child);
  }
  visit(node);
  return joinAndCollapse(collected);
}

function isTransparentWrapper(node: AnyNode): boolean {
  return (
    node.type === "tag" &&
    node.attribs !== undefined &&
    "data-doc-transparent" in node.attribs
  );
}

export function extractSearchChunks(
  html: string,
  docId: string,
  docTitle: string
): DocIndexChunk[] {
  const $ = load(html, null, false);
  const topLevelNodes = $.root().contents().toArray();

  const headingStack: { text: string; depth: number }[] = [];
  const chunks: DocIndexChunk[] = [];

  type ChunkAccumulator = {
    headerId: string;
    heading: string;
    headingPath: string[];
    parts: ContentParts;
  };
  let currentChunk: ChunkAccumulator | null = null;

  function flushCurrentChunk() {
    if (!currentChunk) return;
    chunks.push({
      chunkId: `${docId}#${currentChunk.headerId}`,
      headerId: currentChunk.headerId,
      docId,
      docTitle,
      heading: currentChunk.heading,
      headingPath: currentChunk.headingPath,
      textContent: joinAndCollapse(currentChunk.parts.textParts),
      codeContent: joinAndCollapse(currentChunk.parts.codeParts),
      rawContent: joinAndCollapse([
        currentChunk.heading,
        ...currentChunk.parts.rawParts
      ])
    });
  }

  // A heading is a chunk boundary only if every wrapper on its ancestor path
  // (up to the root) is marked transparent via `data-doc-transparent`. The
  // top-level call seeds `chainAllTransparent = true` (zero ancestors trivially
  // satisfies "all transparent"); each recursion ANDs in the current node's
  // transparency, so a single non-transparent ancestor disqualifies every
  // descendant heading, even ones inside deeper transparent wrappers.
  //
  // Text and code accumulate into the current chunk regardless of nesting,
  // matching the prior behavior.
  function visit(node: AnyNode, chainAllTransparent: boolean) {
    if (node.type === "tag" && HEADING_TAGS.has(node.tagName.toLowerCase())) {
      if (chainAllTransparent) {
        flushCurrentChunk();

        const headingText = getHeadingText(node);
        const headingDepth = Number(node.tagName[1]);

        while (
          headingStack.length > 0 &&
          headingStack[headingStack.length - 1].depth >= headingDepth
        ) {
          headingStack.pop();
        }
        headingStack.push({ text: headingText, depth: headingDepth });

        // Trust the id rehype-slug placed on the heading. Same library
        // (github-slugger) under the hood, so runtime DOM ids match.
        const headerId =
          $(node).attr("id") ??
          headingText.toLowerCase().replace(/[^a-z0-9]+/g, "-");

        currentChunk = {
          headerId,
          heading: headingText,
          headingPath: headingStack.map((entry) => entry.text),
          parts: { textParts: [], codeParts: [], rawParts: [] }
        };
        return;
      }
      // Non-boundary heading: fall through and treat it as a regular wrapper
      // so its text content still accumulates into whatever chunk is open.
    } else if (node.type === "text") {
      if (!currentChunk) return;
      const value = node.data;
      if (!value || value.length === 0) return;
      currentChunk.parts.textParts.push(value);
      currentChunk.parts.rawParts.push(value);
      return;
    } else if (node.type !== "tag") {
      return;
    } else if (CODE_TAGS.has(node.tagName.toLowerCase())) {
      if (!currentChunk) return;
      const codeText = concatDescendantText(node);
      if (codeText.length > 0) {
        currentChunk.parts.codeParts.push(codeText);
        currentChunk.parts.rawParts.push(codeText);
      }
      return;
    }

    const childChainAllTransparent =
      chainAllTransparent && isTransparentWrapper(node);
    for (const child of node.children) {
      visit(child, childChainAllTransparent);
    }
  }

  for (const node of topLevelNodes) visit(node, true);

  flushCurrentChunk();
  return chunks;
}
