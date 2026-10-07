const { chromium } = require("playwright");

const FPS = 60;
const FRAME_INTERVAL_MS = 1000 / FPS;
const SCREENSHOT_DIR = "screenshots/earth-destroy";
const LEVEL_URL =
  "http://localhost:3000/?__developer__=1&__demoMode__=1&level=TwoPlatforms";

// How long to wait for the BFS growth animation to finish before shattering.
const GROWTH_WAIT_MS = 30000;

// Maximum time to keep recording after shatter before giving up.
const MAX_DESTROY_WAIT_MS = 10000;

// The full polygon shape data traced from proto.webp (269 outer points,
// 3 holes with 38 + 25 + 11 points). Five connected components are bridged
// into a single polygon via thin 0.02-unit strips.
const SHAPE = [[3.1497,1.489],[2.8976,0.6655],[2.8808,0.6655],[2.8808,0.6151],[2.8304,0.5311],[2.8136,0.3966],[2.7968,0.3966],[2.7968,0.3462],[2.7799,0.3462],[2.6791,-0.0068],[2.6119,-0.1244],[2.5951,-0.2084],[2.2589,-0.3261],[2.2589,-0.3429],[2.2085,-0.3429],[2.1749,-0.3765],[1.9564,-0.4437],[1.822,-0.511],[1.7715,-0.511],[1.2841,-0.7126],[1.1329,-0.7967],[1.1517,-0.7899],[1.2189,-0.9747],[1.2001,-0.9815],[1.2841,-0.9647],[1.469,-0.8639],[1.5194,-0.8639],[1.5531,-0.8303],[1.6875,-0.7967],[1.8052,-0.7294],[2.6119,-0.4269],[2.9312,-0.3429],[3.0993,-0.3597],[3.1329,-0.4101],[3.1329,-0.511],[3.032,-0.7462],[2.7968,-1.0824],[2.4942,-1.4185],[2.4774,-1.4353],[2.2757,-1.637],[2.2421,-1.637],[2.1245,-1.7715],[2.0909,-1.7715],[2.0236,-1.8555],[1.99,-1.8555],[1.9396,-1.9227],[1.906,-1.9227],[1.8556,-1.9899],[1.0825,-2.511],[0.7463,-2.6454],[0.1413,-2.7462],[0.6119,-2.2757],[1.0657,-1.9227],[1.1497,-1.8051],[1.2169,-1.637],[1.6203,-1.4521],[1.2505,-1.4689],[1.2505,-1.1832],[1.1833,-0.9983],[1.1813,-0.9883],[1.1141,-0.8035],[1.1329,-0.7967],[1.0993,-0.7967],[1.032,-0.7462],[0.9312,-0.6286],[0.7463,-0.4941],[0.5615,-0.4269],[0.4942,-0.4269],[0.5142,-0.4281],[0.4974,-0.697],[0.4774,-0.6958],[0.4774,-0.7126],[0.5278,-0.7126],[0.5615,-0.7462],[0.6119,-0.7462],[0.6287,-0.7799],[0.6959,-0.7967],[0.864,-0.9647],[0.8808,-1.032],[0.9144,-1.0488],[0.9816,-1.3345],[0.9816,-1.3513],[0.9648,-1.5194],[0.864,-1.7378],[0.6959,-1.9059],[0.6287,-1.9227],[0.6119,-1.9563],[0.5615,-1.9563],[0.4774,-2.0068],[0.3766,-2.0068],[0.3766,-2.0236],[0.1413,-2.0068],[0.1413,-1.9899],[0.0909,-1.9899],[0.0909,-1.9731],[0.0068,-1.9563],[-0.01,-1.9227],[-0.0772,-1.9059],[-0.2453,-1.7378],[-0.2621,-1.6706],[-0.2957,-1.6538],[-0.3629,-1.4185],[-0.3461,-1.2],[-0.2285,-0.9479],[-0.0436,-0.7799],[0.0236,-0.7631],[0.0909,-0.7126],[0.2589,-0.679],[0.4574,-0.6946],[0.4742,-0.4257],[0.4942,-0.4269],[0.4942,-0.4101],[0.3598,-0.4101],[0.2757,-0.3597],[0.2757,-0.3261],[0.1077,-0.158],[0.0909,-0.1076],[-0.1948,0.1781],[-0.2453,0.1949],[-0.3125,0.279],[-0.3965,0.3294],[-0.4469,0.3966],[-0.4806,0.3966],[-0.531,0.4638],[-0.5646,0.4638],[-0.6654,0.5647],[-0.699,0.5647],[-0.8503,0.6991],[-0.8839,0.6991],[-1.1192,0.8504],[-1.1864,0.9176],[-1.6738,1.1697],[-1.6546,1.1641],[-1.7723,0.7608],[-1.7915,0.7664],[-1.7747,0.7327],[-1.7075,0.7159],[-1.657,0.6655],[-1.6234,0.6655],[-1.4385,0.5311],[-1.3545,0.4975],[-1.3377,0.4638],[-1.3041,0.4638],[-1.2873,0.4302],[-1.2032,0.3966],[-1.1696,0.3462],[-1.136,0.3462],[-1.052,0.2622],[-1.0016,0.2454],[-0.968,0.1949],[-0.9343,0.1949],[-0.8839,0.1277],[-0.8503,0.1277],[-0.7999,0.0605],[-0.7495,0.0437],[-0.6318,-0.0908],[-0.5814,-0.1076],[-0.4469,-0.242],[-0.4301,-0.2925],[-0.2789,-0.4269],[-0.2789,-0.4605],[-0.1948,-0.5278],[-0.4806,-0.8135],[-0.5646,-0.9647],[-0.5982,-1.0992],[-0.615,-1.116],[-0.6318,-1.5194],[-0.5982,-1.6538],[-0.4638,-1.9059],[-0.2621,-2.1244],[-0.2532,-2.1065],[-0.1187,-2.1737],[-0.1276,-2.1916],[-0.01,-2.2589],[0.0573,-2.2589],[0.0573,-2.2757],[0.1245,-2.2757],[0.1245,-2.2925],[0.3934,-2.2925],[0.1749,-2.511],[0.1749,-2.511],[-0.0772,-2.7631],[-0.531,-2.7967],[-0.7159,-2.7799],[-0.1365,-2.2095],[-0.271,-2.1423],[-0.2621,-2.1244],[-0.9343,-2.7967],[-1.0856,-2.7967],[-1.1024,-2.8135],[-1.6066,-2.8135],[-2.3629,-2.7462],[-2.8839,-2.6622],[-3.3377,-2.5278],[-3.3377,-2.511],[-3.3713,-2.511],[-3.2705,-2.3429],[-3.6738,-2.3429],[-3.8083,-2.2589],[-3.8419,-2.2084],[-3.8755,-2.2084],[-3.9427,-2.158],[-4.1444,-1.9563],[-4.178,-1.9563],[-4.2117,-1.9227],[-4.4469,-1.6202],[-4.4974,-1.4857],[-4.4806,-1.2336],[-4.4133,-1.0656],[-4.2117,-0.7631],[-3.9764,-0.4941],[-3.6402,-0.158],[-3.5898,-0.1412],[-3.4217,0.0437],[-3.3881,0.0437],[-3.2705,0.1781],[-3.2369,0.1781],[-3.0688,0.3462],[-3.0352,0.3462],[-2.9848,0.4134],[-2.9511,0.4134],[-2.9175,0.4638],[-2.7159,0.6151],[-2.6318,0.6487],[-2.615,0.6823],[-2.531,0.7159],[-2.4638,0.7832],[-2.178,0.9512],[-1.8107,0.772],[-1.693,1.1753],[-1.6738,1.1697],[-1.6402,1.2033],[-1.3377,1.3042],[-0.4806,1.4722],[-0.178,1.758],[-0.1108,1.7916],[-0.0604,1.8588],[0.0573,1.926],[0.1077,1.9932],[0.1581,2.0101],[0.2253,2.0941],[0.3766,2.1949],[0.427,2.2622],[0.4606,2.2622],[0.511,2.3294],[0.5446,2.3294],[0.6119,2.4134],[0.6455,2.4134],[0.6959,2.4806],[0.7295,2.4806],[0.7799,2.5479],[0.8136,2.5479],[0.864,2.6151],[0.9984,2.6991],[1.032,2.7496],[1.2169,2.8672],[1.2505,2.9176],[1.822,3.3378],[2.3766,3.7075],[3.0152,4.0773],[3.0993,4.1109],[3.2505,4.1109],[3.385,4.0101],[3.469,3.8084],[3.469,3.7243],[3.5026,3.6235],[3.5026,3.1193],[3.385,2.363],[3.1497,1.489]];
const HOLES = [[[2.1077,1.489],[2.0573,1.3042],[2.0236,1.2706],[2.0236,1.2201],[2.0068,1.2201],[1.99,1.1361],[1.9396,1.0521],[2.1581,0.8336],[2.1413,0.8336],[2.1245,0.6823],[2.1077,0.6823],[2.0909,0.5983],[2.0404,0.5479],[2.0404,0.5143],[1.99,0.4806],[1.99,0.447],[1.9564,0.4302],[1.9396,0.3798],[1.8388,0.2958],[1.8388,0.2622],[1.7715,0.1949],[1.5194,0.0101],[1.3178,-0.074],[0.7463,0.1781],[0.7295,0.1613],[0.8472,0.6151],[0.8808,0.8672],[0.8808,1.6739],[0.8304,2.0437],[1.2337,2.447],[1.2841,2.4638],[2.3094,3.489],[1.6035,1.7916],[1.9228,1.9764],[2.0909,2.0269],[2.0909,2.0101],[2.1245,2.0101],[2.1077,1.5059]],[[-1.7747,-0.4101],[-2.0268,-0.6622],[-2.0604,-0.6622],[-2.094,-0.7126],[-2.2453,-0.7967],[-2.3461,-0.7967],[-2.3461,-0.7799],[-2.4133,-0.7631],[-2.4301,-0.7126],[-2.4638,-0.6958],[-2.4638,-0.5446],[-2.3965,-0.4101],[-2.3629,-0.3933],[-2.3629,-0.3597],[-2.178,-0.158],[-2.1444,-0.158],[-2.1276,-0.1244],[-2.0268,-0.074],[-1.8251,-0.0572],[-1.8251,-0.074],[-1.7747,-0.074],[-1.7075,-0.1412],[-1.6906,-0.2589],[-1.7243,-0.3429],[-1.7747,-0.3933]],[[-4.0436,-1.4689],[-3.9932,-1.5362],[-3.9932,-1.5698],[-4.0268,-1.6034],[-4.094,-1.5866],[-4.2621,-1.4185],[-4.2789,-1.3513],[-4.0772,-1.1496],[-4.01,-1.1496],[-3.9932,-1.2168],[-4.1108,-1.3513]]];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const fs = require("fs");
  const path = require("path");

  // Ensure output directory exists
  const outDir = path.resolve(SCREENSHOT_DIR);
  fs.mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: { width: 800, height: 450 },
  });
  const page = await context.newPage();

  console.log("Navigating to level...");
  await page.goto(LEVEL_URL);

  // Wait for loading to finish
  await page.waitForFunction(
    () => !document.querySelector("body")?.innerText?.includes("LOADING"),
    { timeout: 15000 }
  );
  // Extra settle time for rendering
  await sleep(2000);

  // Get the game viewport element for clipped screenshots.
  const gameCanvas = await page.$("canvas");

  // --- Background capture loop ---
  // Runs continuously at 60fps in the background. The main flow signals it
  // via the `recording` flag and resolves `stopPromise` when done.
  let frame = 0;
  let recording = true;
  let stopResolve;
  const stopPromise = new Promise((r) => { stopResolve = r; });

  const captureLoop = (async () => {
    while (recording) {
      const frameNum = String(frame).padStart(4, "0");
      const filepath = path.join(outDir, `frame_${frameNum}.png`);
      const captureStart = Date.now();

      if (gameCanvas) {
        await gameCanvas.screenshot({ path: filepath, type: "png" });
      } else {
        await page.screenshot({ path: filepath, type: "png" });
      }

      frame++;

      // Sleep for the remainder of the frame interval, accounting for the
      // time the screenshot itself took.
      const elapsed = Date.now() - captureStart;
      const sleep = Math.max(0, FRAME_INTERVAL_MS - elapsed);
      if (sleep > 0) {
        await sleep(sleep);
      }
    }
    stopResolve();
  })();

  // Give the capture loop a few frames of the empty scene.
  console.log("Recording empty scene...");
  await sleep(250);

  // --- Spawn ---
  console.log("Setting up mana...");
  await page.evaluate(() => {
    const store = window.__controller__.getStore();
    store.dispatch({ type: "status/setMaxMana", payload: 10000 });
  });

  // NOTE: We intentionally do NOT call spawnFullGrown() here. The shape must
  // go through the normal BFS growth process (terrain anchoring -> seed cells
  // -> frontier expansion) so that the internal cell grid is populated. The
  // cell grid is required for the shatter/crumble destroy effect to work:
  //
  //   - shatter() calls EarthShapeBehavior.shatterAll(), which iterates over
  //     filledCells to break the shape into subdivided chunks that fall apart.
  //   - spawnFullGrown() bypasses the entire growth pipeline and never builds
  //     the cell grid, so filledCells is empty and shatterAll() has nothing
  //     to break apart — the shape just silently disappears instead of
  //     crumbling.
  //
  // The trade-off is that we need to wait for the growth animation to finish
  // before calling shatter(). The shape must overlap existing terrain for
  // growth to anchor; here it's positioned so its lower edge intersects the
  // TwoPlatforms platform (top surface at y ≈ 2.0).
  console.log("Spawning earth spell...");
  const earthBlockId = await page.evaluate(
    ({ shape, holes }) => {
      return window.__level__
        .constructEntityAfterPreload("EarthBlock", {
          // Position so the shape's bottom edge (center_y - 2.81) overlaps
          // the platform whose top surface sits at y ≈ 2.0.
          position: { x: 10, y: 4 },
          shape,
          holes,
        })
        .then((earthBlock) => {
          window.__level__.addEntity(earthBlock);
          return earthBlock.id;
        });
    },
    { shape: SHAPE, holes: HOLES }
  );

  console.log(`Earth block spawned: ${earthBlockId}. Waiting for growth...`);

  // --- Wait for growth (capture loop keeps running in background) ---
  const growthStart = Date.now();
  let stable = false;
  while (Date.now() - growthStart < GROWTH_WAIT_MS) {
    await sleep(200);

    const lifecycle = await page.evaluate((id) => {
      const e = window.__level__?.getEntity(id);
      return e?.lifeycleStage ?? "gone";
    }, earthBlockId);

    if (lifecycle === "Stable") {
      stable = true;
      console.log(`  Growth complete at frame ~${frame} (${Date.now() - growthStart}ms)`);
      break;
    }
    if (
      lifecycle === "Error" ||
      lifecycle === "TerrainNotFound" ||
      lifecycle === "gone"
    ) {
      console.error(`Earth block failed: ${lifecycle}. Exiting.`);
      recording = false;
      await stopPromise;
      await browser.close();
      process.exit(1);
    }
  }

  if (!stable) {
    console.error("Earth block did not reach Stable state. Exiting.");
    recording = false;
    await stopPromise;
    await browser.close();
    process.exit(1);
  }

  // Let the fully-grown shape sit for ~0.5s.
  await sleep(500);

  // --- Shatter ---
  // shatter() -> EarthShapeBehavior.shatterAll() breaks the cell grid into
  // subdivided chunks that fall with physics. This only works because we let
  // the shape grow normally — the cell grid must be populated for the
  // crumble effect.
  console.log(`Calling shatter() at frame ~${frame}...`);
  await page.evaluate((id) => {
    const entity = window.__level__.getEntity(id);
    if (entity) {
      entity.shatter();
    }
  }, earthBlockId);

  // --- Wait for destruction to finish ---
  const destroyStart = Date.now();
  while (Date.now() - destroyStart < MAX_DESTROY_WAIT_MS) {
    await sleep(200);

    const remaining = await page.evaluate(() => {
      let count = 0;
      for (const [, e] of window.__level__.getEntities()) {
        if (e.type === "EarthBlock" || e.type === "EarthShardsJuice") {
          count++;
        }
      }
      return count;
    });

    if (frame % 60 === 0) {
      console.log(`  Frame ~${frame}, remaining earth entities: ${remaining}`);
    }

    if (remaining === 0) {
      break;
    }
  }

  // --- Stop the capture loop ---
  recording = false;
  await stopPromise;

  console.log(`Done! ${frame} frames saved to ${outDir}/`);
  console.log(
    `To assemble into a video: ffmpeg -framerate ${FPS} -i ${outDir}/frame_%04d.png -c:v libx264 -pix_fmt yuv420p ${outDir}/earth_destroy.mp4`
  );

  await browser.close();
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
