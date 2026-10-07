#!/usr/bin/env node
/**
 * Automated sword hitbox visual test using Puppeteer.
 *
 * Loads the game with the physics debug overlay enabled, equips the sword,
 * triggers attacks via mouse click, and captures a frame sequence showing the
 * convex-hull polygon hitbox colliders rendered by the PhysicsDebugger.
 *
 * Prerequisites:
 *   npm install puppeteer  (or use the puppeteer bundled with your project)
 *   Dev server running on PORT (default 3000)
 *
 * Usage:
 *   node scripts/test-sword-hitboxes.mjs [--port 3000] [--level shrine_1] [--out ./hitbox-frames]
 */

import puppeteer from "puppeteer";
import { mkdirSync, existsSync } from "fs";
import { resolve } from "path";

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
function flag(name, fallback) {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : fallback;
}

const PORT = flag("port", "3000");
const LEVEL = flag("level", "shrine_1");
const OUT_DIR = resolve(flag("out", "./hitbox-frames"));

if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Walk React fiber tree to find the Redux store. */
const FIND_STORE_JS = `(() => {
  const root = document.getElementById("root");
  if (!root) return null;
  const key = Object.keys(root).find(k => k.startsWith("__reactContainer"));
  if (!key) return null;
  const queue = [root[key]];
  const visited = new Set();
  while (queue.length) {
    const f = queue.shift();
    if (!f || visited.has(f)) continue;
    visited.add(f);
    if (f.memoizedProps?.store?.getState) {
      window.__STORE__ = f.memoizedProps.store;
      return true;
    }
    if (f.child) queue.push(f.child);
    if (f.sibling) queue.push(f.sibling);
    if (f.return) queue.push(f.return);
  }
  return false;
})()`;

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log(`Launching browser – level=${LEVEL}, port=${PORT}`);

  const browser = await puppeteer.launch({
    headless: false, // set true for CI
    defaultViewport: { width: 1280, height: 900 },
    args: ["--no-sandbox"]
  });

  const page = await browser.newPage();

  const url = `http://localhost:${PORT}/?__demoMode__=1&__devOverlay__=1&level=${LEVEL}`;
  console.log(`Navigating to ${url}`);
  await page.goto(url, { waitUntil: "domcontentloaded" });

  // Wait for the game to finish loading (canvas appears and level is ready).
  console.log("Waiting for canvas...");
  await page.waitForSelector("canvas", { timeout: 30_000 });

  // Give the level time to fully initialise (entity spawning, resource loads).
  await sleep(8000);

  // Dismiss webpack-dev-server error overlay if present.
  await page.evaluate(() => {
    document.getElementById("webpack-dev-server-client-overlay")?.remove();
  });

  // ------------------------------------------------------------------
  // Equip sword via Redux
  // ------------------------------------------------------------------
  console.log("Equipping sword...");
  const foundStore = await page.evaluate(FIND_STORE_JS);
  if (!foundStore) {
    console.error("Could not find Redux store – aborting.");
    await browser.close();
    process.exit(1);
  }

  await page.evaluate(() => {
    const store = window.__STORE__;
    store.dispatch({
      type: "inventory/addQuestItem",
      payload: { itemType: "Sword", hotKey: true }
    });
    store.dispatch({ type: "inventory/equipWeapon", payload: "Sword" });
  });

  // Wait for sword unsheathe animation.
  await sleep(2500);

  // ------------------------------------------------------------------
  // Attack via mouse click and capture frames
  // ------------------------------------------------------------------
  const canvasBox = await page.evaluate(() => {
    const c = document.querySelector("canvas");
    const r = c.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  });

  const cx = canvasBox.x + canvasBox.w / 2;
  const cy = canvasBox.y + canvasBox.h / 2;

  // Compute clip region centered on the player.
  const clip = {
    x: Math.max(0, cx - 300),
    y: Math.max(0, cy - 200),
    width: 600,
    height: 400
  };

  // --- Swing 1 ---
  console.log("Swing 1 – clicking canvas to attack...");
  await page.mouse.click(cx, cy);

  for (let i = 0; i < 40; i++) {
    await page.screenshot({
      path: `${OUT_DIR}/swing1-${String(i).padStart(2, "0")}.png`,
      type: "png",
      clip
    });
  }
  console.log("  Captured 40 frames for swing 1.");

  // --- Swing 2 ---
  // Wait for swing to finish, then reload to get another clean first-click.
  // (The dev panel intercepts subsequent clicks; reloading is the most
  // reliable way to get a second capture.)
  console.log("Reloading for swing 2 capture...");
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("canvas", { timeout: 30_000 });
  await sleep(8000);
  await page.evaluate(() => {
    document.getElementById("webpack-dev-server-client-overlay")?.remove();
  });
  const foundStore2 = await page.evaluate(FIND_STORE_JS);
  if (foundStore2) {
    await page.evaluate(() => {
      const store = window.__STORE__;
      store.dispatch({
        type: "inventory/addQuestItem",
        payload: { itemType: "Sword", hotKey: true }
      });
      store.dispatch({ type: "inventory/equipWeapon", payload: "Sword" });
    });
  }
  await sleep(2500);

  console.log("Swing 2 – clicking canvas to attack...");
  await page.mouse.click(cx, cy);

  for (let i = 0; i < 40; i++) {
    await page.screenshot({
      path: `${OUT_DIR}/swing2-${String(i).padStart(2, "0")}.png`,
      type: "png",
      clip
    });
  }
  console.log("  Captured 40 frames for swing 2.");

  // ------------------------------------------------------------------
  // Assemble video (optional – requires ffmpeg)
  // ------------------------------------------------------------------
  console.log("\nTo assemble a video from the frames:");
  console.log(
    `  ffmpeg -y -framerate 15 -i "${OUT_DIR}/swing1-%02d.png" ` +
      `-vf "scale=1200:-1" -c:v libx264 -pix_fmt yuv420p -crf 18 ` +
      `${OUT_DIR}/sword-hitbox-demo.mp4`
  );

  // ------------------------------------------------------------------
  // Done
  // ------------------------------------------------------------------
  console.log(`\nFrames saved to ${OUT_DIR}/`);
  console.log(
    "Look for red/orange polygon shapes in frames ~12-20 of each swing."
  );

  await browser.close();
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
