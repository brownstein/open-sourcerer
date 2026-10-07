import path from "path";
import {
  type Plugin,
  type ViteDevServer,
  createServer as createViteServer
} from "vite";

import {
  CATEGORY_FILE_NAME,
  DOC_EXTENSION
} from "../../../src/docs/configuration";
import { DocBuildCache } from "./cache";

const FILE_EVENT_DEBOUNCE_MS = 80;

// Guards against the plugin re-instantiating itself inside the transient SSR
// server we spin up for `vite build`. The flag is set before createServer is
// called and cleared after the inner server closes, so the inner instance of
// the plugin returns a noop and never recurses.
let isNestedSession = false;

function debounce<TArgs extends unknown[]>(
  fn: (...args: TArgs) => void | Promise<void>,
  delayMs: number
): (...args: TArgs) => void {
  let timer: NodeJS.Timeout | null = null;
  let queuedArgs: TArgs | null = null;
  return (...args: TArgs) => {
    queuedArgs = args;
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      const argsToInvoke = queuedArgs;
      queuedArgs = null;
      if (argsToInvoke) {
        Promise.resolve(fn(...argsToInvoke)).catch((error) => {
          console.error("[docs-index-builder] debounced rebuild error:", error);
        });
      }
    }, delayMs);
  };
}

function deriveDocCoordsFromPath(
  filePath: string,
  contentDir: string
): { locale: string; docId: string } | null {
  if (!filePath.startsWith(contentDir + path.sep)) return null;
  if (!filePath.endsWith(DOC_EXTENSION)) return null;

  const relativePath = filePath.slice(contentDir.length + 1);
  const segments = relativePath.split(path.sep);
  if (segments.length < 2) return null;

  const [locale, ...rest] = segments;
  if (!locale) return null;

  const docIdWithExt = rest.join("/");
  const docId = docIdWithExt.endsWith(DOC_EXTENSION)
    ? docIdWithExt.slice(0, -DOC_EXTENSION.length)
    : docIdWithExt;
  if (!docId) return null;

  return { locale, docId };
}

export function docsIndexBuilderPlugin(): Plugin {
  if (isNestedSession) {
    return { name: "docs-index-builder-noop" };
  }

  const projectRoot = path.resolve(__dirname, "../../..");
  const contentDir = path.resolve(projectRoot, "src/docs/content");
  const outputDir = path.resolve(projectRoot, "src/docs/indexedDocs");
  const cache = new DocBuildCache();

  let activeServer: ViteDevServer | null = null;

  async function rebuild({ throwOnError = false } = {}): Promise<void> {
    if (!activeServer) return;
    try {
      // Imported lazily (not at module top) so the transitive react /
      // react-dom / react-redux load happens only when rebuild actually runs.
      // At build time that is inside the transient session below, under the
      // NODE_ENV=development we set there — never at Vite config-load time,
      // when `vite build` has NODE_ENV=production and would permanently lock
      // React core to its production build. See configResolved for the full
      // rationale and why dev/prod must stay internally consistent.
      const { runRebuild } = await import("./buildDocsIndex");
      await runRebuild(activeServer, projectRoot, cache, { outputDir });
    } catch (error) {
      console.error("[docs-index-builder] rebuild failed:", error);
      // In the dev server a failed rebuild is non-fatal — it leaves the
      // previous index in place and logs, so a bad in-progress doc edit does
      // not kill `npm start`. During `vite build` the opposite is required:
      // the committed search index would ship stale/broken (the build still
      // exits 0 otherwise), so we rethrow to abort with a non-zero exit. The
      // usual cause is a doc component reading redux state that
      // buildIndexableStoreSnapshot.ts does not define — extend that snapshot
      // (see its header), do not special-case the renderer.
      if (throwOnError) {
        throw new Error(
          "[docs-index-builder] docs search index rebuild failed during " +
            "`vite build`; the shipped index would be stale. See the error " +
            "logged above.",
          { cause: error }
        );
      }
    }
  }

  const debouncedRebuild = debounce(rebuild, FILE_EVENT_DEBOUNCE_MS);

  return {
    name: "docs-index-builder",

    async configResolved(config) {
      if (config.command !== "build") return;

      // Spin up a transient dev-mode server so we can use ssrLoadModule
      // during a build. The flag prevents the inner Vite instance from
      // re-running this plugin (and recursing).
      //
      // `vite build` sets process.env.NODE_ENV=production for the whole process.
      // But this transient server is a dev (command === "serve") server, and in
      // serve mode @vitejs/plugin-react-swc compiles every .tsx with the dev
      // automatic JSX runtime (development: true, hardcoded — even for SSR
      // transforms), and @mdx-js/rollup does the same for .mdx in dev mode.
      // That emits jsxDEV() calls, which only exist in React's *development*
      // jsx-dev-runtime. Under NODE_ENV=production, ssrLoadModule instead
      // resolves the production runtime, where jsxDEV is `void 0` — so every
      // doc render throws "jsxDEV is not a function".
      //
      // The transforms are locked to the dev runtime, so React itself must be
      // its development build too (mixing dev jsx-dev-runtime with prod React
      // core fails differently: "dispatcher.getOwner is not a function", since
      // owner tracking is dev-only). We therefore force NODE_ENV=development for
      // the transient server's lifetime, restored in finally before the outer
      // production build proceeds. This is only sound because rebuild() defers
      // its react-loading import (see above) until after this assignment — so
      // React core first loads here as development, not at config-load time.
      const priorNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "development";
      isNestedSession = true;
      let transientServer: ViteDevServer | null = null;
      try {
        transientServer = await createViteServer({
          configFile: config.configFile ?? undefined,
          server: { middlewareMode: true, hmr: false, watch: null },
          appType: "custom",
          logLevel: "warn"
        });
        activeServer = transientServer;
        // Fail the build (non-zero exit) if the index cannot be rebuilt, rather
        // than silently shipping a stale index.
        await rebuild({ throwOnError: true });
      } finally {
        activeServer = null;
        if (transientServer) await transientServer.close();
        isNestedSession = false;
        process.env.NODE_ENV = priorNodeEnv;
      }
    },

    configureServer(server) {
      activeServer = server;

      const handleFileEvent = (filePath: string): void => {
        if (!filePath.startsWith(contentDir + path.sep)) return;

        if (filePath.endsWith(DOC_EXTENSION)) {
          const coords = deriveDocCoordsFromPath(filePath, contentDir);
          if (coords) cache.invalidate(coords.locale, coords.docId);
          debouncedRebuild();
          return;
        }

        if (path.basename(filePath) === CATEGORY_FILE_NAME) {
          // Category meta cascades to every descendant doc, so a category
          // change requires a full re-render.
          cache.clear();
          debouncedRebuild();
        }
      };

      server.watcher.on("add", handleFileEvent);
      server.watcher.on("change", handleFileEvent);
      server.watcher.on("unlink", handleFileEvent);

      // Initial build when the dev server boots.
      debouncedRebuild();
    }
  };
}
