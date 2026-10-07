/**
 * Build the allEntities test harness using Vite.
 *
 * Replaces the former webpack-based build-test-harness.js. Vite
 * automatically resolves vite.config.ts from the project root, so all
 * plugins (gameAssetsPlugin, wasm, etc.) and resolve aliases are
 * inherited.
 */

import path from "path";
import { fileURLToPath } from "url";
import { build } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

await build({
  root,
  build: {
    outDir: "build/test",
    emptyOutDir: true,
    // Skip minification and source maps — the test harness only needs to
    // run, not ship. This also avoids OOM on CI runners with limited heap.
    minify: false,
    sourcemap: false,
    rollupOptions: {
      input: path.resolve(
        root,
        "src/entities/__tests__/allEntities.harness.html"
      )
    }
  },
  logLevel: "info"
});
