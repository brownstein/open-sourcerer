import mdx from "@mdx-js/rollup";
import rehypeShiki from "@shikijs/rehype";
import react from "@vitejs/plugin-react-swc";
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import rehypeSlug from "rehype-slug";
import remarkGfm from "remark-gfm";
import { type Plugin, defineConfig } from "vite";
import checker from "vite-plugin-checker";
import wasm from "vite-plugin-wasm";

import { docsIndexBuilderPlugin } from "./scripts/vite/docsIndexBuilder";

// ---------------------------------------------------------------------------
// Custom plugin: serve game assets the same way webpack's loaders did, so
// that zero source-level import changes are needed.
// ---------------------------------------------------------------------------
function gameAssetsPlugin(): Plugin {
  // Extensions served as raw text strings (replaces webpack asset/source).
  const rawTextExtensions = [".glsl", ".frag", ".vert", ".md", ".txt"];

  // Extensions served as JSON (replaces webpack json-loader).
  const jsonExtensions = [".tmj", ".tsj"];

  return {
    name: "game-assets",
    enforce: "pre",

    resolveId(source) {
      // Handle webpack file-loader prefix syntax:
      //   "file-loader?name=...!actual/module/path"
      // Strip the prefix and resolve the actual module as an asset URL.
      if (source.startsWith("file-loader")) {
        const actualPath = source.split("!").pop()!;
        return { id: `\0file-asset:${actualPath}`, external: false };
      }
      return undefined;
    },

    load(id) {
      // file-loader compat — resolve the npm package file as a static asset.
      if (id.startsWith("\0file-asset:")) {
        const modulePath = id.slice("\0file-asset:".length);
        // Use Vite's ?url import to get the served asset URL.
        return `import assetUrl from ${JSON.stringify(modulePath + "?url")};\nexport default assetUrl;`;
      }

      // .raw.js files — spell script source served as raw text strings.
      if (id.endsWith(".raw.js")) {
        const content = fs.readFileSync(id, "utf-8");
        return `export default ${JSON.stringify(content)};`;
      }

      const ext = path.extname(id);

      if (rawTextExtensions.includes(ext)) {
        const content = fs.readFileSync(id, "utf-8");
        return `export default ${JSON.stringify(content)};`;
      }

      if (jsonExtensions.includes(ext)) {
        const content = fs.readFileSync(id, "utf-8");
        return `export default ${content};`;
      }

      return undefined;
    }
  };
}

// ---------------------------------------------------------------------------
// esbuild plugin for the dep scanner — prevents esbuild from parsing
// .raw.js spell scripts as JavaScript modules (they contain require("fire")
// etc. which are spell runtime modules, not npm packages).
// ---------------------------------------------------------------------------
function gameEsbuildPlugins() {
  return [
    {
      name: "raw-js-loader",
      setup(build: any) {
        build.onLoad(
          { filter: /\.raw\.js$/ },
          async (args: { path: string }) => ({
            contents: `export default ${JSON.stringify(
              await fs.promises.readFile(args.path, "utf-8")
            )}`,
            loader: "js" as const
          })
        );
      }
    }
  ];
}

// ---------------------------------------------------------------------------
// Rewrites the dynamic require in babel-plugin-transform-async-to-promises
// to a static require so Rollup's commonjs plugin (and Vite's resolve alias)
// can resolve it. The original code does:
//   require(isNewBabel ? "@babel/core" : "babylon").parse(...)
// which Rollup can't analyze statically. We replace it with a direct
// require("@babel/core") which the resolve alias maps to our browser shim.
// ---------------------------------------------------------------------------
function babelDynamicRequireFix(): Plugin {
  return {
    name: "babel-dynamic-require-fix",
    enforce: "pre",
    transform(code, id) {
      if (!id.includes("babel-plugin-transform-async-to-promises")) return;
      if (!code.includes("require(isNewBabel")) return;
      return code.replace(
        /require\(isNewBabel\s*\?\s*"@babel\/core"\s*:\s*"babylon"\)/g,
        'require("@babel/core")'
      );
    }
  };
}

// ---------------------------------------------------------------------------
// Adds { type: "module" } to Worker constructor calls that use import.meta.url
// so they load as ES modules in Vite's dev server. Without this, the browser
// parses them as classic scripts and fails on `import` statements.
// ---------------------------------------------------------------------------
function workerModulePlugin(): Plugin {
  return {
    name: "worker-module-type",
    enforce: "pre",
    transform(code, id) {
      if (id.includes("node_modules")) return undefined;
      let modified = false;
      let result = code;

      // Add { type: "module" } to Worker constructor calls.
      if (code.includes("new Worker(")) {
        result = result.replace(
          /new Worker\(\s*(new URL\([^)]+\))\s*,\s*\{([^}]*)\}\s*\)/g,
          (match, urlExpr, opts) => {
            if (opts.includes("type")) return match;
            modified = true;
            return `new Worker(${urlExpr}, {${opts}, type: "module" })`;
          }
        );
      }

      // Replace Node.js `global` with `globalThis` in worker files and
      // any source file that uses the Node-style global object reference.
      if (code.includes("global.self") || code.includes("global.")) {
        result = result.replace(/\bglobal\b(?=\.)/g, (match) => {
          modified = true;
          return "globalThis";
        });
      }

      return modified ? result : undefined;
    }
  };
}

// ---------------------------------------------------------------------------
// Build identity: git hash (+ -dirty) so collaborating designers can tell
// whether they're on the same code. Works the same for dev servers and
// deploys; falls back to "unknown" outside a git checkout.
// ---------------------------------------------------------------------------
function computeBuildId(): string {
  try {
    const hash = execSync("git rev-parse --short HEAD", {
      encoding: "utf-8"
    }).trim();
    const dirty =
      execSync("git status --porcelain", { encoding: "utf-8" }).trim() !== "";
    return dirty ? `${hash}-dirty` : hash;
  } catch {
    return "unknown";
  }
}

// ---------------------------------------------------------------------------
// Electron builds ship as a desktop app served from a local app:// origin —
// Google Tag Manager is both undesirable and blocked by CSP there, so strip
// the snippet from index.html when ELECTRON_BUILD is set.
// ---------------------------------------------------------------------------
function stripGtmForElectronPlugin(): Plugin {
  return {
    name: "strip-gtm-for-electron",
    transformIndexHtml(html) {
      if (!process.env.ELECTRON_BUILD) return html;
      return html
        .replace(
          /<!-- Google Tag Manager -->[\s\S]*?<!-- End Google Tag Manager -->/,
          ""
        )
        .replace(
          /<!-- Google Tag Manager \(noscript\) -->[\s\S]*?<!-- End Google Tag Manager \(noscript\) -->/,
          ""
        );
    }
  };
}

/** Emit version.json alongside the bundle so deploys expose their build id. */
function versionJsonPlugin(buildId: string, builtAt: string): Plugin {
  return {
    name: "version-json",
    apply: "build",
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "version.json",
        source: JSON.stringify({ buildId, builtAt }, null, 2)
      });
    }
  };
}

// ---------------------------------------------------------------------------
// Main config
// ---------------------------------------------------------------------------
export default defineConfig(async ({ mode }) => {
  const base = process.env.VITE_BASE_PATH || "/";
  const buildId = computeBuildId();
  const builtAt = new Date().toISOString();
  const { default: remarkFlexibleMarkers } = await import(
    "remark-flexible-markers"
  );
  return {
    base,

    plugins: [
      gameAssetsPlugin(),
      babelDynamicRequireFix(),
      workerModulePlugin(),
      wasm(),
      docsIndexBuilderPlugin(),
      mdx({
        remarkPlugins: [remarkGfm, remarkFlexibleMarkers],
        rehypePlugins: [rehypeSlug, [rehypeShiki, { theme: "github-dark" }]]
      }),
      react({ tsDecorators: true }),
      checker({ typescript: true }),
      stripGtmForElectronPlugin(),
      versionJsonPlugin(buildId, builtAt)
    ],

    resolve: {
      alias: {
        src: path.resolve(__dirname, "src"),
        // Resolve ~ prefix in Less @imports (webpack less-loader convention).
        "~src": path.resolve(__dirname, "src"),
        // Shim @babel/core for browser — babel-plugin-transform-async-to-promises
        // conditionally requires it, and the full package pulls in Node.js APIs.
        "@babel/core": path.resolve(__dirname, "babel-core-browser-shim.js")
      },
      extensions: [".mts", ".ts", ".tsx", ".mjs", ".js", ".jsx", ".json"]
    },

    define: {
      "process.env.NODE_ENV": JSON.stringify(mode),
      "process.env.PUBLIC_URL": JSON.stringify(base === "/" ? "" : base),
      __BUILD_ID__: JSON.stringify(buildId),
      // Shim Node.js global to globalThis (used by AutocompleteWorker).
      global: "globalThis"
    },

    optimizeDeps: {
      // harfbuzzjs loads its sibling harfbuzz.wasm at runtime via
      // `new URL("harfbuzz.wasm", import.meta.url)`. When pre-bundled into
      // .vite/deps the wasm is not copied alongside it, so that URL resolves to
      // a nonexistent path and the dev server's SPA fallback returns index.html
      // (causing "expected magic word 00 61 73 6d, found 3c 21 44 4f"). Excluding
      // it serves the lib from its real location so the wasm URL resolves.
      exclude: ["harfbuzzjs"],
      // Pre-bundle large and worker-loaded deps upfront. Without this, Vite
      // discovers spell worker deps (babel plugins, shim sub-packages) at
      // runtime, triggering a re-optimization that forces a full page reload.
      include: [
        "three",
        "@babel/standalone",
        "react",
        "react-dom",
        // Spell transpiler deps (loaded in web worker, not discoverable by scanner)
        "@babel/plugin-transform-arrow-functions",
        "@babel/plugin-transform-block-scoping",
        "@babel/plugin-transform-classes",
        "@babel/plugin-transform-destructuring",
        "@babel/plugin-transform-for-of",
        "@babel/plugin-transform-shorthand-properties",
        "babel-plugin-transform-async-to-promises",
        "acorn",
        "js-interpreter",
        // babel-core shim sub-packages (transitive from babel plugins)
        "@babel/types",
        "@babel/template",
        "@babel/traverse",
        "@babel/parser",
        // Transitive deps discovered late by Vite, causing a dev server restart
        "vlq",
        "tinyqueue"
      ],
      esbuildOptions: {
        // Replace process.env references at pre-bundle time so the output
        // doesn't reference Node.js globals. This is critical for deps loaded
        // inside web workers where Vite's runtime define doesn't apply.
        define: {
          "process.env.NODE_ENV": JSON.stringify(mode),
          "process.env": JSON.stringify({ NODE_ENV: mode })
        },
        plugins: gameEsbuildPlugins()
      }
    },

    worker: {
      // Workers are loaded as module workers (workerModulePlugin injects
      // `type: "module"`), so the output must be ES, not the default "iife".
      // ES is also required because transitive deps (harfbuzzjs) use top-level
      // await, which iife cannot represent.
      format: "es",
      plugins: () => [gameAssetsPlugin(), babelDynamicRequireFix(), wasm()]
    },

    server: {
      port: 3000
    },

    // Treat custom binary formats as static assets (replaces webpack file-loader).
    assetsInclude: [
      "**/*.prs",
      "**/*.prsg",
      "**/*.fnt",
      "**/*.atlas",
      "**/*.skel",
      "**/*.opus"
    ],

    build: {
      outDir: "build",
      sourcemap: true,
      // Match tsconfig's ES2022 target. Vite's default ("modules" → es2020/
      // chrome87/safari14) predates top-level await, which harfbuzzjs's worker
      // bundle requires (it calls `init(await createHarfBuzz())` at module top
      // level). The app already requires a modern browser for WebGL2 + WASM.
      target: "es2022"
    }
  };
});
