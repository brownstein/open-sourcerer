/* Rebuild entry for the docs search index + DocAnchor<DocId> type.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * MAINTENANCE NOTE FOR FUTURE CLAUDE AGENTS
 * This script is rarely touched by humans; this header is the primary
 * onboarding doc for anyone (you) modifying it. If you change the pipeline
 * steps, the TRACKED_INDEXER_COMPONENTS contract, the emitted outputs, or
 * the "Adding a new indexer feature" procedure, UPDATE THIS HEADER in the
 * same edit so the next agent inherits accurate guidance. Treat the
 * header as code that must stay in sync with behavior — not as decoration.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Called by the Vite docs-index plugin whenever an MDX doc, the doc registry,
 * the MDX components map, or the indexable-store snapshot changes. Per call:
 *
 *   1. Invalidate the registry modules so SSR re-evaluates them.
 *   2. For each (locale, docId):
 *        renderDocWithCapture(doc, components, locale, snapshot, tracked)
 *          → { html, invocations }
 *        extractSearchChunks(html)        → search chunks (text/code/raw)
 *        filter invocations by name       → component-driven outputs
 *                                            (currently: Anchor.id → anchor list)
 *   3. emitDocTypes      → docTypes.ts (DocId, LocaleCode, DocAnchor<T>)
 *      emitSearchIndexForLocale → src/docs/indexedDocs/<locale>.json
 *
 * Adding a new indexer feature:
 *   - If it only needs the rendered DOM (e.g. count headings, walk
 *     `[data-doc-…]` attributes): operate on `html` after the render call.
 *     No component tracking needed.
 *   - If it needs a component's render-time props (e.g. collect every
 *     <Definition term=…>, build a <DocLink> cross-ref table):
 *       1. Add the component's name to TRACKED_INDEXER_COMPONENTS below.
 *       2. After renderDocWithCapture returns, filter `invocations` by that
 *          name and feed the result into a new aggregate / emit step.
 *     Wrapping is opt-in for a reason — see the wrapping-invariant note in
 *     renderDocWithCapture.ts before adding entries.
 */
import type { MDXComponents } from "mdx/types";
import path from "path";
import type { ViteDevServer } from "vite";

import type { DocEntry } from "../../../src/api/docs";
import type { LocaleCode } from "../../../src/docs/indexedDocs/docTypes";
import { DocBuildCache } from "./cache";
import { type DocAnchorMapping, emitDocTypes } from "./emitDocTypes";
import {
  emitSearchIndexForLocale,
  removeObsoleteLocaleFiles
} from "./emitSearchIndex";
import { extractSearchChunks } from "./extractSearchChunks";
import {
  type BuildIndexableStoreSnapshot,
  renderDocWithCapture
} from "./renderDocWithCapture";

const ALL_DOCS_MODULE = "/src/docs/allDocs.ts";
const ALL_CATEGORIES_MODULE = "/src/docs/allDocCategories.ts";
const MDX_COMPONENTS_MODULE = "/src/docs/mdxComponents.tsx";
const BUILD_INDEXABLE_STORE_SNAPSHOT_MODULE =
  "/src/docs/buildIndexableStoreSnapshot.ts";

const REGISTRY_FILES_TO_INVALIDATE = [
  "src/docs/allDocs.ts",
  "src/docs/allDocCategories.ts",
  "src/docs/mdxComponents.tsx",
  "src/docs/buildIndexableStoreSnapshot.ts"
];

// Each name listed here causes renderDocWithCapture to wrap that MDX
// component with an invocation-tracking proxy. Entries must be paired with a
// downstream filter on `invocations` below that consumes the captured props.
// Current entries:
//   "Anchor" → Anchor.id values feed `anchorIds` → DocAnchor<DocId> type.
const TRACKED_INDEXER_COMPONENTS: ReadonlySet<string> = new Set(["Anchor"]);

type AllDocsExports = {
  allDocIds: readonly string[];
  allDocLocales: readonly string[];
  getDocNoFallback: (docId: string, locale: string) => DocEntry | undefined;
};

type MdxComponentsExports = {
  mdxComponents: MDXComponents;
};

type BuildIndexableStoreSnapshotExports = {
  buildIndexableStoreSnapshot: BuildIndexableStoreSnapshot;
};

export type RebuildOptions = {
  outputDir: string;
};

function invalidateRegistryModules(
  server: ViteDevServer,
  projectRoot: string
): void {
  for (const relativePath of REGISTRY_FILES_TO_INVALIDATE) {
    const absolutePath = path.resolve(projectRoot, relativePath);
    const modules = server.moduleGraph.getModulesByFile(absolutePath);
    if (!modules) continue;
    for (const moduleNode of modules) {
      server.moduleGraph.invalidateModule(moduleNode);
    }
  }
}

export async function runRebuild(
  server: ViteDevServer,
  projectRoot: string,
  cache: DocBuildCache,
  options: RebuildOptions
): Promise<void> {
  invalidateRegistryModules(server, projectRoot);

  const [allDocsModule, mdxComponentsModule, , buildSnapshotModule] =
    (await Promise.all([
      server.ssrLoadModule(ALL_DOCS_MODULE),
      server.ssrLoadModule(MDX_COMPONENTS_MODULE),
      // allDocCategories is a transitive dep of allDocs. Loading it explicitly
      // so its invalidation takes effect before allDocs re-evaluates.
      server.ssrLoadModule(ALL_CATEGORIES_MODULE),
      server.ssrLoadModule(BUILD_INDEXABLE_STORE_SNAPSHOT_MODULE)
    ])) as [
      AllDocsExports,
      MdxComponentsExports,
      unknown,
      BuildIndexableStoreSnapshotExports
    ];

  const { allDocIds, allDocLocales, getDocNoFallback } = allDocsModule;
  const { mdxComponents } = mdxComponentsModule;
  const { buildIndexableStoreSnapshot } = buildSnapshotModule;

  const reachableKeys = new Set<string>();
  const anchorIdsByDocId = new Map<string, Set<string>>();
  const chunksByLocale = new Map<
    string,
    ReturnType<typeof extractSearchChunks>
  >(allDocLocales.map((locale) => [locale, []]));

  await Promise.all(
    allDocLocales.map(async (locale) => {
      const localeChunks = chunksByLocale.get(locale);
      if (!localeChunks) return;

      for (const docId of allDocIds) {
        const entry = getDocNoFallback(docId, locale);
        if (!entry) continue;

        reachableKeys.add(`${locale}:${docId}`);

        let cached = cache.get(locale, docId);
        if (!cached) {
          const { html, invocations } = renderDocWithCapture(
            entry.component,
            mdxComponents,
            locale as LocaleCode,
            buildIndexableStoreSnapshot,
            TRACKED_INDEXER_COMPONENTS
          );

          const anchorIds = Array.from(
            new Set(
              invocations
                .filter(
                  (invocation) =>
                    invocation.name === "Anchor" &&
                    typeof invocation.props.id === "string" &&
                    invocation.props.id.length > 0
                )
                .map((invocation) => invocation.props.id as string)
            )
          );

          const chunks = entry.meta.blockSearchIndexing
            ? []
            : extractSearchChunks(html, docId, entry.meta.title);

          cached = { anchorIds, chunks };
          cache.set(locale, docId, cached);
        }

        let anchorSet = anchorIdsByDocId.get(docId);
        if (!anchorSet) {
          anchorSet = new Set();
          anchorIdsByDocId.set(docId, anchorSet);
        }
        for (const anchorId of cached.anchorIds) {
          anchorSet.add(anchorId);
        }

        for (const chunk of cached.chunks) {
          localeChunks.push(chunk);
        }
      }
    })
  );

  for (const cacheKey of Array.from(cache.keys())) {
    if (!reachableKeys.has(cacheKey)) {
      cache.deleteByKey(cacheKey);
    }
  }

  const anchorMappings: DocAnchorMapping[] = Array.from(
    anchorIdsByDocId.entries()
  ).map(([docId, anchorSet]) => ({
    docId,
    anchorIds: Array.from(anchorSet).sort()
  }));

  emitDocTypes(
    path.join(options.outputDir, "docTypes.ts"),
    [...allDocIds].sort(),
    [...allDocLocales].sort(),
    anchorMappings
  );

  for (const locale of allDocLocales) {
    emitSearchIndexForLocale(
      options.outputDir,
      locale,
      chunksByLocale.get(locale) ?? []
    );
  }

  removeObsoleteLocaleFiles(options.outputDir, [...allDocLocales]);
}
