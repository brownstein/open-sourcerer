/**
 * @jest-environment jest-environment-puppeteer
 */

import { execSync } from "child_process";
import http from "http";
import path from "path";
import fs from "fs";
import "jest-puppeteer";

const TEST_PORT = 9123;
const BUILD_DIR = path.resolve(__dirname, "../../build/test");

type EntityTestResult = {
  type: string;
  passed: boolean;
  error?: string;
};

let server: http.Server;

beforeAll(async () => {
  // Build the test harness bundle
  execSync("node scripts/build-test-harness.mjs", {
    cwd: path.resolve(__dirname, "../.."),
    stdio: "inherit"
  });

  // Serve the built files
  server = http.createServer((req, res) => {
    const rawUrl =
      req.url === "/"
        ? "/src/entities/__tests__/allEntities.harness.html"
        : req.url || "/src/entities/__tests__/allEntities.harness.html";
    // Strip query string and percent-decode so paths with spaces resolve on disk.
    const url = decodeURIComponent(rawUrl.split("?")[0]);
    const filePath = path.join(BUILD_DIR, url);
    const ext = path.extname(filePath);
    const mimeTypes: Record<string, string> = {
      ".html": "text/html",
      ".js": "application/javascript",
      ".css": "text/css",
      ".json": "application/json",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".gif": "image/gif",
      ".svg": "image/svg+xml",
      ".wasm": "application/wasm"
    };
    const contentType = mimeTypes[ext] || "application/octet-stream";

    fs.readFile(filePath, (err, content) => {
      if (err) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }
      res.writeHead(200, { "Content-Type": contentType });
      res.end(content);
    });
  });
  await new Promise<void>((resolve) => server.listen(TEST_PORT, resolve));

  // Navigate puppeteer to the test harness
  await page.goto(`http://localhost:${TEST_PORT}`, {
    waitUntil: "networkidle0",
    timeout: 60000
  });

  // Wait for the harness to finish
  await page.waitForFunction("window.__TEST_RESULTS__ !== undefined", {
    timeout: 120000
  });
}, 300000);

afterAll(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
});

it("all entities can be instantiated and added to a Level", async () => {
  const results: EntityTestResult[] = await page.evaluate(
    () => (window as any).__TEST_RESULTS__
  );

  expect(results.length).toBeGreaterThan(0);

  const failures = results.filter((r) => !r.passed);
  if (failures.length > 0) {
    const summary = failures.map((f) => `  ${f.type}: ${f.error}`).join("\n");
    throw new Error(
      `${failures.length}/${results.length} entities failed:\n${summary}`
    );
  }
});
