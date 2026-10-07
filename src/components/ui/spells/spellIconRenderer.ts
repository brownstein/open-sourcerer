import { Color } from "three";

import { SpellIconSpec } from "src/api/spellIcons";

import { getIconDefByKey, spellIconDefs } from "./spellIconDefs";

const imageCache = new Map<string, HTMLImageElement>();
const imageLoadPromises = new Map<string, Promise<HTMLImageElement>>();

function loadImage(url: string): Promise<HTMLImageElement> {
  const cached = imageCache.get(url);
  if (cached) return Promise.resolve(cached);

  const existing = imageLoadPromises.get(url);
  if (existing) return existing;

  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      imageCache.set(url, img);
      resolve(img);
    };
    img.onerror = reject;
    img.src = url;
  });
  imageLoadPromises.set(url, promise);
  return promise;
}

/** Preload all icon images. Call early so they're cached by render time. */
export function preloadSpellIconImages(): Promise<HTMLImageElement[]> {
  if (typeof Image === "undefined") return Promise.resolve([]);
  return Promise.all(spellIconDefs.map((def) => loadImage(def.url)));
}

/**
 * Render a SpellIconSpec to an offscreen canvas.
 * Returns null if any required icon images aren't loaded yet.
 */
export function renderSpellIconToCanvas(
  spec: SpellIconSpec,
  size: number
): HTMLCanvasElement | null {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = false;

  // Background
  if (spec.backgroundColor !== undefined) {
    ctx.fillStyle = `#${new Color(spec.backgroundColor).getHexString()}`;
    ctx.fillRect(0, 0, size, size);
  }

  // Render each layer
  for (const layer of spec.layers) {
    const def = getIconDefByKey(layer.iconKey);
    if (!def) continue;

    const img = imageCache.get(def.url);
    if (!img) continue;

    // Create a temporary canvas to tint the icon
    const tintCanvas = document.createElement("canvas");
    tintCanvas.width = size;
    tintCanvas.height = size;
    const tintCtx = tintCanvas.getContext("2d");
    if (!tintCtx) continue;
    tintCtx.imageSmoothingEnabled = false;

    // Draw the icon centered, applying position/scale/rotation
    tintCtx.save();
    const offsetX = (layer.position.x / 100) * size;
    const offsetY = (layer.position.y / 100) * size;
    tintCtx.translate(size / 2 + offsetX, size / 2 + offsetY);
    tintCtx.scale(layer.scale, layer.scale);
    tintCtx.rotate(((layer.rotation ?? 0) * Math.PI) / 180);
    // Draw image centered at origin
    const drawSize = size * 0.8; // slight padding
    tintCtx.drawImage(img, -drawSize / 2, -drawSize / 2, drawSize, drawSize);
    tintCtx.restore();

    // Tint: fill with color, use source-in to mask to icon shape
    tintCtx.globalCompositeOperation = "source-in";
    tintCtx.fillStyle = `#${new Color(layer.color).getHexString()}`;
    tintCtx.fillRect(0, 0, size, size);

    // Composite tinted layer onto main canvas
    ctx.drawImage(tintCanvas, 0, 0);
  }

  return canvas;
}
