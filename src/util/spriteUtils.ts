import { ProtoSpriteThree } from "protosprite-three";
import { CanvasTexture, ShaderMaterial, Texture } from "three";

type SafeString<T extends string | void> = T extends void ? never : T;

export function extractTextureFromLayer<TLayers extends string | void = string>(
  sprite: ProtoSpriteThree<TLayers>,
  layerName: SafeString<TLayers>,
  frame: number = 0
): Texture | null {
  const spriteData = sprite.protoSpriteInstance.sprite;

  const layerData = spriteData.maps.layerNameMap.get(layerName);
  if (!layerData) return null;

  const frameData = spriteData.data.frames[frame];
  if (!frameData) return null;

  const layerFrameData = frameData.layers.find(
    (layer) => layer.layerIndex === layerData.index
  );
  if (!layerFrameData) return null;
  const { x, y } = layerFrameData.sheetPosition;
  const { width, height } = layerFrameData.size;

  const material = sprite.mesh.material;
  if (Array.isArray(material) || !(material instanceof ShaderMaterial))
    return null;

  const sourceTexture = material.uniforms.map.value as Texture;
  const sourceImage = sourceTexture.image;

  const cropCanvas = document.createElement("canvas");
  cropCanvas.width = layerFrameData.size.width;
  cropCanvas.height = layerFrameData.size.height;
  const ctx = cropCanvas.getContext("2d");
  if (!ctx) return null;

  ctx.translate(0, height);
  ctx.scale(1, -1);
  ctx.drawImage(sourceImage, x, y, width, height, 0, 0, width, height);

  return new CanvasTexture(cropCanvas);
}

export function isolateLayer<TLayers extends string | void = string>(
  sprite: ProtoSpriteThree<TLayers>,
  layerName: SafeString<TLayers>
): void {
  for (const layer of sprite.protoSpriteInstance.sprite.maps.layerNameMap.keys()) {
    sprite.hideLayers(layer as SafeString<TLayers>);
  }

  sprite.showLayers(layerName);
}

export function showAllLayers(sprite: ProtoSpriteThree): void {
  for (const layer of sprite.protoSpriteInstance.sprite.maps.layerNameMap.keys()) {
    sprite.showLayers(layer);
  }
}
