import { OrthographicCamera } from "three";

import { EntityLevelEvents, EntityLevelSnapshot } from "src/api/entity";
import {
  constrainCameraToSceneBBox,
  sizeCameraToCanvas
} from "src/components/viewport/util";
import { Level } from "src/engine/level/Level";
import { LevelLoader } from "src/engine/level/LevelLoader";
import { LevelDefinitionAPI } from "src/engine/level/LevelLoaderAPI";
import {
  CentralRenderer,
  ViewportRenderingContext
} from "src/engine/rendering/CentralRenderer";

export type RenderLevelScreenshotOptions = {
  width?: number;
  height?: number;
  devicePixelRatio?: number;
  snapshot?: EntityLevelSnapshot;
};

export async function renderLevelScreenshot(
  levelOrId: string | LevelDefinitionAPI,
  options: RenderLevelScreenshotOptions = {}
): Promise<Uint8Array> {
  const canvas = await renderLevelToCanvas(levelOrId, options);
  const blob = await canvas.convertToBlob({ type: "image/png" });
  return new Uint8Array(await blob.arrayBuffer());
}

export type RenderLevelScreenshotDataUrlOptions =
  RenderLevelScreenshotOptions & {
    /** Defaults to JPEG, which keeps previews small. */
    type?: "image/jpeg" | "image/png" | "image/webp";
    /** Encoder quality 0..1, for lossy types. */
    quality?: number;
  };

/** Render a level to a compact image data URL, for small previews. */
export async function renderLevelScreenshotDataUrl(
  levelOrId: string | LevelDefinitionAPI,
  options: RenderLevelScreenshotDataUrlOptions = {}
): Promise<string> {
  const canvas = await renderLevelToCanvas(levelOrId, options);
  const blob = await canvas.convertToBlob({
    type: options.type ?? "image/jpeg",
    quality: options.quality
  });
  return await blobToDataUrl(blob);
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function renderLevelToCanvas(
  levelOrId: string | LevelDefinitionAPI,
  options: RenderLevelScreenshotOptions = {}
): Promise<OffscreenCanvas> {
  const width = options.width ?? 1024;
  const height = options.height ?? 768;
  const devicePixelRatio = options.devicePixelRatio ?? 1;

  const isDef = typeof levelOrId !== "string";
  const levelId = isDef ? levelOrId.id : levelOrId;

  const loader = new LevelLoader(levelId);
  if (isDef) loader.setLevelDef(levelOrId);
  if (options.snapshot) loader.setSnapshot(options.snapshot);

  let level: Level | undefined;
  let renderingContext: ViewportRenderingContext | undefined;

  try {
    level = await loader.load();

    // Mirror GameController's preload sequence so collisions and the camera
    // bounds request resolve before we try to render.
    level.world.step();
    level.emit(EntityLevelEvents.PreloadComplete);
    level.fullyPreLoaded = true;

    // OffscreenCanvas + WebGLRenderer is the same pairing CentralRenderer uses
    // by default; the cast lets us reuse ViewportRenderingContext, which is
    // typed for HTMLCanvasElement but accepts either at runtime.
    const webglCanvas = new OffscreenCanvas(width, height);
    renderingContext = new ViewportRenderingContext(
      webglCanvas as unknown as HTMLCanvasElement,
      level.backgroundColor !== undefined
        ? { clearColor: level.backgroundColor }
        : undefined
    );
    renderingContext.resizeCanvas(width, height, devicePixelRatio);
    renderingContext.resizeCamera(width, height);

    const camera = new OrthographicCamera(-10, 10, 10, -10, 0, 128);
    camera.position.set(0, 0, 64);
    camera.lookAt(0, 0, -1);

    level.cameraDirector.attachViewportCamera(camera);
    const camProps = level.cameraDirector.resolveRequests();
    sizeCameraToCanvas(camProps, { width, height });
    constrainCameraToSceneBBox(camProps);

    camera.position.x = camProps.center.x;
    camera.position.y = camProps.center.y;
    camera.left = -camProps.size.x * 0.5;
    camera.right = camProps.size.x * 0.5;
    camera.top = camProps.size.y * 0.5;
    camera.bottom = -camProps.size.y * 0.5;
    camera.rotation.z = camProps.rotation;
    camera.updateProjectionMatrix();

    // Entities position their Object3Ds during the per-frame step/postStep
    // lifecycle, not at construction: DestructableTerrain only writes its
    // transform in postStep(), physics-driven entities sync their Object3D to
    // their rigid body in step(), and parallax layers place themselves relative
    // to the camera in postStep(). Without advancing a frame they render at the
    // origin / a stale pose. Mirror one GameController frame — after the camera
    // is finalized so camera-relative layers read the correct bounds — so the
    // screenshot matches what the game shows on load. Guarded so a single
    // misbehaving entity can't abort the whole screenshot.
    try {
      const fpsMs = 1000 / 120;
      level.step(fpsMs);
      level.postStep(fpsMs);
    } catch (err) {
      console.warn("Level step before screenshot render failed:", err);
    }

    renderingContext.render(level.scene, camera);

    // Hand the rendered frame off to a 2D canvas before encoding. Reading
    // directly from the WebGL canvas is unreliable because its drawing buffer
    // is not preserved across compositing.
    const bitmap = webglCanvas.transferToImageBitmap();
    const outputCanvas = new OffscreenCanvas(width, height);
    const ctx = outputCanvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      throw new Error("Failed to acquire 2D context for PNG encoding");
    }
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();

    return outputCanvas;
  } finally {
    renderingContext?.dispose();
    // ViewportRenderingContext does not expose its CentralRenderer publicly,
    // so reach in to release the WebGL context. Without this, repeated calls
    // exhaust the browser's WebGL context budget.
    const central = (
      renderingContext as unknown as { centralRenderer?: CentralRenderer }
    )?.centralRenderer;
    central?.renderer.dispose();
    level?.dispose();
  }
}
