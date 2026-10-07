import {
  Box2,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Mesh,
  Object3D,
  ShaderMaterial,
  Texture,
  Vector2,
  Vector3
} from "three";
import {
  AsepriteJSON,
  AsepriteJSONFrame,
  AsepriteJSONLayer
} from "three-aseprite";

import { RenderLayers } from "src/engine/constants/renderLayers";

import fragmentShader from "./threeAsepriteBackgroundFrag.glsl";
import vertexShader from "./threeAsepriteBackgroundVert.glsl";

export type ThreeAsepriteBackgroundProps = {
  texture: Texture;
  sourceJSON: AsepriteJSON;
  frameName: ({ layerName }: { layerName: string }) => string;
  scale?: Vector3;
  minDepth?: number;
  maxDepth?: number;
  layerExtensions?: Record<string, LayerExtension>;
  layerOffsets?: Record<string, Vector2>;
  layerFadeColor?: Color;
  layerFadeAmounts?: Record<string, number>;
  layerParallax?: Record<string, Vector2>;
};

// Internal bookkeeping for layer groups.
type LayerGrouping = {
  [key: string]: string[];
};

type LayerExtension = {
  tileUp?: boolean;
  tileDown?: boolean;
  extendUp?: boolean;
  extendDown?: boolean;
};

class ThreeAsepriteBackgroundSegment {
  public layerName: string;
  public mesh: Mesh;
  public geometry: BufferGeometry;
  public extensions: LayerExtension;
  public fadeColor = new Color();
  public fadeAmount = 0;

  private frame: AsepriteJSONFrame;
  private parent: ThreeAsepriteBackground;
  private parallaxFactor = new Vector2();
  private origin = new Vector2();

  private quadCount: number;
  private vtxIndex: Uint16Array;
  private vtxPos: Float32Array;
  private vtxUV: Float32Array;
  private vtxOpacity: Float32Array;
  private vtxFade: Float32Array;

  constructor(
    parent: ThreeAsepriteBackground,
    layerName: string,
    frame: AsepriteJSONFrame,
    extensions?: LayerExtension,
    fadeColor?: Color,
    fadeAmount?: number,
    parallaxFactor?: Vector2,
    origin?: Vector2
  ) {
    this.parent = parent;
    this.layerName = layerName;
    this.frame = frame;
    this.extensions = extensions ?? {};
    if (fadeColor !== undefined) this.fadeColor = fadeColor;
    if (fadeAmount !== undefined) this.fadeAmount = fadeAmount;
    if (parallaxFactor !== undefined) this.parallaxFactor.copy(parallaxFactor);
    if (origin !== undefined) this.origin.copy(origin);

    this.geometry = new BufferGeometry();
    this.quadCount = 1;
    this.vtxIndex = new Uint16Array(6 * this.quadCount);
    this.vtxPos = new Float32Array(12 * this.quadCount);
    this.vtxUV = new Float32Array(8 * this.quadCount);
    this.vtxOpacity = new Float32Array(4 * this.quadCount);
    this.vtxFade = new Float32Array(16 * this.quadCount);
    this.geometry.setAttribute("position", new BufferAttribute(this.vtxPos, 3));
    this.geometry.setAttribute("uv", new BufferAttribute(this.vtxUV, 2));
    this.geometry.setAttribute(
      "vtxOpacity",
      new BufferAttribute(this.vtxOpacity, 1)
    );
    this.geometry.setAttribute("vtxFade", new BufferAttribute(this.vtxFade, 4));
    this.geometry.setIndex(new BufferAttribute(this.vtxIndex, 1));
    this.vtxOpacity.fill(1);
    for (let qi = 0; qi < this.quadCount; qi++) {
      const qi6 = qi * 6;
      const qi4 = qi * 4;
      this.vtxIndex[qi6 + 0] = qi4 + 0;
      this.vtxIndex[qi6 + 1] = qi4 + 1;
      this.vtxIndex[qi6 + 2] = qi4 + 2;
      this.vtxIndex[qi6 + 3] = qi4 + 2;
      this.vtxIndex[qi6 + 4] = qi4 + 3;
      this.vtxIndex[qi6 + 5] = qi4 + 0;
    }

    this.mesh = new Mesh(this.geometry, this.parent.material);
    this.mesh.layers.set(RenderLayers.default);

    this.update();
  }
  update() {
    const { extensions } = this;
    const { textureWidth, textureHeight } = this.parent;
    const { viewportBounds } = this.parent;
    const { x, y, w, h } = this.frame.frame;
    const { x: sx, y: sy } = this.frame.spriteSourceSize;
    const { w: sw, h: sh } = this.frame.sourceSize;
    const { x: scaleX, y: scaleY } = this.parent.scale;

    const invWidth = 1 / textureWidth;
    const invHeight = 1 / textureHeight;

    const swScaled = sw * scaleX;

    // Get size of this component.
    const frameBounds = new Box2();
    frameBounds.expandByPoint(
      new Vector2(w * 0 + sx - sw * 0.5, h * 0 + sy - sh * 0.5).multiply(
        new Vector2(scaleX, scaleY)
      )
    );
    frameBounds.expandByPoint(
      new Vector2(w * 1 + sx - sw * 0.5, h * 1 + sy - sh * 0.5).multiply(
        new Vector2(scaleX, scaleY)
      )
    );
    const boundsSize = new Vector2();
    frameBounds.getSize(boundsSize);

    // Get viewport size and center.
    const viewportSize = new Vector2();
    const viewportCenter = new Vector2();
    viewportBounds.getSize(viewportSize);
    viewportBounds.getCenter(viewportCenter);

    // Identify center based on parallax.
    const centerParallax = viewportCenter.clone().multiply(this.parallaxFactor);
    centerParallax.add(this.origin);

    const viewportXMinRelative =
      viewportBounds.min.x + swScaled * 0.5 - centerParallax.x;
    const viewportXMaxRelative =
      viewportBounds.max.x + swScaled * 0.5 - centerParallax.x;
    const viewportShiftXRelative =
      Math.floor(viewportXMinRelative / swScaled) * swScaled;
    const viewportRepeatX = Math.ceil(
      (viewportXMaxRelative - viewportShiftXRelative) / swScaled
    );

    const xOffsetBase = (viewportShiftXRelative + centerParallax.x) / scaleX;
    const yOffset = centerParallax.y / scaleY;

    let upCount = Math.max(
      0,
      Math.ceil(
        (viewportBounds.max.y - frameBounds.max.y - centerParallax.y) /
          boundsSize.y
      )
    );
    let downCount = Math.max(
      0,
      Math.ceil(
        -(viewportBounds.min.y - frameBounds.min.y - centerParallax.y) /
          boundsSize.y
      )
    );
    let quadCount = 1;

    if (this.extensions.extendUp) {
      if (upCount > 0) {
        quadCount++;
        upCount++;
      }
    }
    if (this.extensions.extendDown) {
      if (downCount > 0) {
        quadCount++;
        downCount++;
      }
    }
    if (this.extensions.tileUp) {
      quadCount += upCount;
    }
    if (this.extensions.tileDown) {
      quadCount += downCount;
    }

    // Multiply times the number of X repeats.
    quadCount *= viewportRepeatX;

    // If the quad count changed, we need new arrays to fit the right number of verts.
    if (quadCount !== this.quadCount) {
      this.quadCount = quadCount;
      this.vtxIndex = new Uint16Array(6 * quadCount);
      this.vtxPos = new Float32Array(12 * quadCount);
      this.vtxUV = new Float32Array(8 * quadCount);
      this.vtxOpacity = new Float32Array(4 * quadCount);
      this.vtxFade = new Float32Array(16 * quadCount);
      this.geometry.setAttribute(
        "position",
        new BufferAttribute(this.vtxPos, 3)
      );
      this.geometry.setAttribute("uv", new BufferAttribute(this.vtxUV, 2));
      this.geometry.setAttribute(
        "vtxOpacity",
        new BufferAttribute(this.vtxOpacity, 1)
      );
      this.geometry.setAttribute(
        "vtxFade",
        new BufferAttribute(this.vtxFade, 4)
      );
      this.geometry.setIndex(new BufferAttribute(this.vtxIndex, 1));
      this.vtxOpacity.fill(1);

      // Initialize indices.
      for (let qi = 0; qi < quadCount; qi++) {
        const qi6 = qi * 6;
        const qi4 = qi * 4;
        this.vtxIndex[qi6 + 0] = qi4 + 0;
        this.vtxIndex[qi6 + 1] = qi4 + 1;
        this.vtxIndex[qi6 + 2] = qi4 + 2;
        this.vtxIndex[qi6 + 3] = qi4 + 2;
        this.vtxIndex[qi6 + 4] = qi4 + 3;
        this.vtxIndex[qi6 + 5] = qi4 + 0;
      }
    }

    // Offset the left U coordinate of all textures by 0.1 to account for
    // rounding errors that cause the left portion of the texture to form
    // seams.
    const uo0 = 0.1;
    const vo0 = 0.1;

    let vtxI = 0;
    let vtxUVI = 0;
    for (let xr = 0; xr < viewportRepeatX; xr++) {
      const xOffset = xOffsetBase + sw * xr;

      // Form first quad.
      this.vtxPos[vtxI + 0] = scaleX * (w * 0 + sx - sw * 0.5 + xOffset);
      this.vtxPos[vtxI + 1] = scaleY * (h * 0 + sy - sh * 0.5 + yOffset);
      this.vtxPos[vtxI + 3] = scaleX * (w * 1 + sx - sw * 0.5 + xOffset);
      this.vtxPos[vtxI + 4] = scaleY * (h * 0 + sy - sh * 0.5 + yOffset);
      this.vtxPos[vtxI + 6] = scaleX * (w * 1 + sx - sw * 0.5 + xOffset);
      this.vtxPos[vtxI + 7] = scaleY * (h * 1 + sy - sh * 0.5 + yOffset);
      this.vtxPos[vtxI + 9] = scaleX * (w * 0 + sx - sw * 0.5 + xOffset);
      this.vtxPos[vtxI + 10] = scaleY * (h * 1 + sy - sh * 0.5 + yOffset);
      this.vtxUV[vtxUVI + 0] = (x + uo0) * invWidth;
      this.vtxUV[vtxUVI + 1] = 1 - y * invHeight;
      this.vtxUV[vtxUVI + 2] = (x + w) * invWidth;
      this.vtxUV[vtxUVI + 3] = 1 - y * invHeight;
      this.vtxUV[vtxUVI + 4] = (x + w) * invWidth;
      this.vtxUV[vtxUVI + 5] = 1 - (y + h - vo0) * invHeight;
      this.vtxUV[vtxUVI + 6] = (x + uo0) * invWidth;
      this.vtxUV[vtxUVI + 7] = 1 - (y + h - vo0) * invHeight;
      vtxI += 12;
      vtxUVI += 8;

      // Form additional quads.
      if (extensions.extendUp && upCount > 0) {
        this.vtxPos[vtxI + 0] = scaleX * (w * 0 + sx - sw * 0.5 + xOffset);
        this.vtxPos[vtxI + 1] = scaleY * (h * 0 + sy - sh * 0.5 + yOffset);
        this.vtxPos[vtxI + 3] = scaleX * (w * 1 + sx - sw * 0.5 + xOffset);
        this.vtxPos[vtxI + 4] = scaleY * (h * 0 + sy - sh * 0.5 + yOffset);
        this.vtxPos[vtxI + 6] = scaleX * (w * 1 + sx - sw * 0.5 + xOffset);
        this.vtxPos[vtxI + 7] =
          scaleY * (h * 0 + sy - sh * 0.5 + yOffset - upCount * h);
        this.vtxPos[vtxI + 9] = scaleX * (w * 0 + sx - sw * 0.5 + xOffset);
        this.vtxPos[vtxI + 10] =
          scaleY * (h * 0 + sy - sh * 0.5 + yOffset - upCount * h);
        this.vtxUV[vtxUVI + 0] = (x + uo0) * invWidth;
        this.vtxUV[vtxUVI + 1] = 1 - y * invHeight - invHeight;
        this.vtxUV[vtxUVI + 2] = (x + w) * invWidth;
        this.vtxUV[vtxUVI + 3] = 1 - y * invHeight - invHeight;
        this.vtxUV[vtxUVI + 4] = (x + w) * invWidth;
        this.vtxUV[vtxUVI + 5] = 1 - y * invHeight - invHeight;
        this.vtxUV[vtxUVI + 6] = (x + uo0) * invWidth;
        this.vtxUV[vtxUVI + 7] = 1 - y * invHeight - invHeight;
        vtxI += 12;
        vtxUVI += 8;
      }
      if (extensions.extendDown && downCount > 0) {
        this.vtxPos[vtxI + 0] = scaleX * (w * 0 + sx - sw * 0.5 + xOffset);
        this.vtxPos[vtxI + 1] =
          scaleY * (h * 0 + sy - sh * 0.5 + yOffset + downCount * h);
        this.vtxPos[vtxI + 3] = scaleX * (w * 1 + sx - sw * 0.5 + xOffset);
        this.vtxPos[vtxI + 4] =
          scaleY * (h * 0 + sy - sh * 0.5 + yOffset + downCount * h);
        this.vtxPos[vtxI + 6] = scaleX * (w * 1 + sx - sw * 0.5 + xOffset);
        this.vtxPos[vtxI + 7] = scaleY * (h * 1 + sy - sh * 0.5 + yOffset);
        this.vtxPos[vtxI + 9] = scaleX * (w * 0 + sx - sw * 0.5 + xOffset);
        this.vtxPos[vtxI + 10] = scaleY * (h * 1 + sy - sh * 0.5 + yOffset);
        this.vtxUV[vtxUVI + 0] = (x + uo0) * invWidth;
        this.vtxUV[vtxUVI + 1] = 1 - (y + h - vo0) * invHeight;
        this.vtxUV[vtxUVI + 2] = (x + w) * invWidth;
        this.vtxUV[vtxUVI + 3] = 1 - (y + h - vo0) * invHeight;
        this.vtxUV[vtxUVI + 4] = (x + w) * invWidth;
        this.vtxUV[vtxUVI + 5] = 1 - (y + h - vo0) * invHeight;
        this.vtxUV[vtxUVI + 6] = (x + uo0) * invWidth;
        this.vtxUV[vtxUVI + 7] = 1 - (y + h - vo0) * invHeight;
        vtxI += 12;
        vtxUVI += 8;
      }
      if (extensions.tileUp) {
        for (let i = 1; i <= upCount; i++) {
          this.vtxPos[vtxI + 0] = scaleX * (w * 0 + sx - sw * 0.5 + xOffset);
          this.vtxPos[vtxI + 1] =
            scaleY * (h * (0 - i) + sy - sh * 0.5 + yOffset);
          this.vtxPos[vtxI + 3] = scaleX * (w * 1 + sx - sw * 0.5 + xOffset);
          this.vtxPos[vtxI + 4] =
            scaleY * (h * (0 - i) + sy - sh * 0.5 + yOffset);
          this.vtxPos[vtxI + 6] = scaleX * (w * 1 + sx - sw * 0.5 + xOffset);
          this.vtxPos[vtxI + 7] =
            scaleY * (h * (1 - i) + sy - sh * 0.5 + yOffset);
          this.vtxPos[vtxI + 9] = scaleX * (w * 0 + sx - sw * 0.5 + xOffset);
          this.vtxPos[vtxI + 10] =
            scaleY * (h * (1 - i) + sy - sh * 0.5 + yOffset);
          this.vtxUV[vtxUVI + 0] = (x + uo0) * invWidth;
          this.vtxUV[vtxUVI + 1] = 1 - y * invHeight;
          this.vtxUV[vtxUVI + 2] = (x + w) * invWidth;
          this.vtxUV[vtxUVI + 3] = 1 - y * invHeight;
          this.vtxUV[vtxUVI + 4] = (x + w) * invWidth;
          this.vtxUV[vtxUVI + 5] = 1 - (y + h - vo0) * invHeight;
          this.vtxUV[vtxUVI + 6] = (x + uo0) * invWidth;
          this.vtxUV[vtxUVI + 7] = 1 - (y + h - vo0) * invHeight;
          vtxI += 12;
          vtxUVI += 8;
        }
      }
      if (extensions.tileDown) {
        for (let i = 1; i <= downCount; i++) {
          this.vtxPos[vtxI + 0] = scaleX * (w * 0 + sx - sw * 0.5 + xOffset);
          this.vtxPos[vtxI + 1] =
            scaleY * (h * (0 + i) + sy - sh * 0.5 + yOffset);
          this.vtxPos[vtxI + 3] = scaleX * (w * 1 + sx - sw * 0.5 + xOffset);
          this.vtxPos[vtxI + 4] =
            scaleY * (h * (0 + i) + sy - sh * 0.5 + yOffset);
          this.vtxPos[vtxI + 6] = scaleX * (w * 1 + sx - sw * 0.5 + xOffset);
          this.vtxPos[vtxI + 7] =
            scaleY * (h * (1 + i) + sy - sh * 0.5 + yOffset);
          this.vtxPos[vtxI + 9] = scaleX * (w * 0 + sx - sw * 0.5 + xOffset);
          this.vtxPos[vtxI + 10] =
            scaleY * (h * (1 + i) + sy - sh * 0.5 + yOffset);
          this.vtxUV[vtxUVI + 0] = (x + uo0) * invWidth;
          this.vtxUV[vtxUVI + 1] = 1 - y * invHeight;
          this.vtxUV[vtxUVI + 2] = (x + w) * invWidth;
          this.vtxUV[vtxUVI + 3] = 1 - y * invHeight;
          this.vtxUV[vtxUVI + 4] = (x + w) * invWidth;
          this.vtxUV[vtxUVI + 5] = 1 - (y + h - vo0) * invHeight;
          this.vtxUV[vtxUVI + 6] = (x + uo0) * invWidth;
          this.vtxUV[vtxUVI + 7] = 1 - (y + h - vo0) * invHeight;
          vtxI += 12;
          vtxUVI += 8;
        }
      }
    }

    // Update fade.
    for (let vi = 0; vi < this.quadCount * 4; vi++) {
      const vtxFI = vi * 4;
      this.fadeColor.toArray(this.vtxFade, vtxFI);
      this.vtxFade[vtxFI + 3] = this.fadeAmount;
    }

    this.geometry.getAttribute("position").needsUpdate = true;
    this.geometry.getAttribute("uv").needsUpdate = true;
    this.geometry.computeBoundingSphere();
  }
  setFade(fadeColor: Color, fadeAmount: number) {
    this.fadeColor.copy(fadeColor);
    this.fadeAmount = fadeAmount;
  }
}

export class ThreeAsepriteBackground {
  public object3D = new Object3D();
  public texture: Texture;
  public readonly sourceJSON: AsepriteJSON;
  public readonly options?: ThreeAsepriteBackgroundProps;
  public readonly depths: number[] = [];

  public material: ShaderMaterial;
  public textureWidth: number;
  public textureHeight: number;

  public viewportBounds = new Box2(new Vector2(-1, -1), new Vector2(1, 1));
  public layerChildren: Record<string, ThreeAsepriteBackgroundSegment> = {};

  public scale = new Vector3(1, 1, 1);

  private layerFrames: Record<string, AsepriteJSONFrame> = {};
  private orderedLayers: string[];
  private layerGroups: LayerGrouping = {};
  private fadeColor?: Color;
  private fadeAmounts: Record<string, number | undefined> = {};

  constructor(options: ThreeAsepriteBackgroundProps) {
    // Preserve options to allow easy cloning later.
    this.options = options;
    this.sourceJSON = options.sourceJSON;
    if (options.scale) this.scale.copy(options.scale);

    // Assign texture, size.
    this.texture = options.texture;

    // We assume that textures are loaded through Three.TextureLoaded
    // and contain references to images. Video textures not supported.
    this.textureWidth = this.texture.image.naturalWidth;
    this.textureHeight = this.texture.image.naturalHeight;

    // Extract layers.
    if (!this.sourceJSON.meta.layers?.length) {
      throw new Error(
        "[ThreeAsepriteBackground] Expecting layers in source file."
      );
    }
    this.orderedLayers = [];
    const _totalLayerCount = this.sourceJSON.meta.layers.length;
    for (const layerInfo of this.sourceJSON.meta.layers) {
      if ((layerInfo as AsepriteJSONLayer).opacity !== undefined) {
        this.orderedLayers.push(layerInfo.name);
      } else {
        if (!this.layerGroups[layerInfo.name])
          this.layerGroups[layerInfo.name] = [];
      }
      if (layerInfo.group !== undefined) {
        if (!this.layerGroups[layerInfo.group])
          this.layerGroups[layerInfo.group] = [];
        this.layerGroups[layerInfo.group].push(layerInfo.name);
      }
    }

    // Resolve layer fades.
    if (options.layerFadeColor && options.layerFadeAmounts) {
      this.fadeColor = options.layerFadeColor;
      this.fadeAmounts = this.expandLayerGroups(options.layerFadeAmounts);
    }

    // Get the hash of frame filenames to frames.
    let framesByFilename: Record<string, AsepriteJSONFrame> | undefined;
    if (Array.isArray(options.sourceJSON.frames)) {
      framesByFilename = {};
      for (const frame of options.sourceJSON.frames) {
        framesByFilename[frame.filename] = frame;
      }
    } else {
      framesByFilename = options.sourceJSON.frames;
    }

    // Ensure we have at least one frame.
    const framesByFilenameKeys = Object.keys(framesByFilename);
    if (framesByFilenameKeys.length === 0)
      throw new Error("[ThreeAseprite]: no frames present in source JSON.");

    // Grab frame data.
    for (
      let layerIndex = 0;
      layerIndex < this.orderedLayers.length;
      layerIndex++
    ) {
      const layerName = this.orderedLayers[layerIndex];
      const frameName = options.frameName({
        layerName: layerName
      });
      const frameDef = framesByFilename[frameName];
      if (frameDef === undefined) continue;
      this.layerFrames[layerName] = frameDef;
    }

    // Create material.
    this.material = new ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        map: {
          value: this.texture
        },
        opacity: {
          value: 1
        }
      },
      transparent: true,
      side: DoubleSide
    });

    // Create child objects.
    const minDepth = options.minDepth ?? -31;
    let maxDepth = options.maxDepth ?? -30;
    if (minDepth === maxDepth) maxDepth++;
    const depthRange = maxDepth - minDepth;
    const layerDepthFrac = depthRange / this.orderedLayers.length;
    let layerDepth = minDepth;
    const layerParallax = options.layerParallax
      ? this.expandLayerGroups(options.layerParallax)
      : undefined;
    const layerOffsets = options.layerOffsets
      ? this.expandLayerGroups(options.layerOffsets)
      : undefined;
    for (const layerName of this.orderedLayers) {
      const layerFrame = this.layerFrames[layerName];
      if (!layerFrame) continue;
      const segment = new ThreeAsepriteBackgroundSegment(
        this,
        layerName,
        layerFrame,
        options.layerExtensions?.[layerName],
        this.fadeColor,
        this.fadeAmounts[layerName],
        layerParallax?.[layerName],
        layerOffsets?.[layerName]
      );
      this.object3D.add(segment.mesh);
      this.layerChildren[layerName] = segment;
      if (layerName.endsWith("Tile")) {
        layerDepth -= layerDepthFrac;
      }
      segment.mesh.position.z = layerDepth;
      this.depths.push(layerDepth);
      layerDepth += layerDepthFrac;
    }
  }
  update(viewportBounds: Box2) {
    this.viewportBounds.copy(viewportBounds);
    for (const layerName of this.orderedLayers) {
      const segment = this.layerChildren[layerName];
      if (!segment) continue;
      segment.update();
    }
  }
  protected expandLayerGroups<T>(
    attrMap: Partial<Record<string, T>>
  ): Partial<Record<string, T>> {
    const assignments: Partial<Record<string, T>> = {};
    const toAssign = [...Object.entries(attrMap)] as [string, T][];
    while (toAssign.length > 0) {
      const assignment = toAssign.pop();
      if (assignment === undefined) break;
      const [layer, value] = assignment;
      assignments[layer] = value;
      if (this.layerGroups[layer]) {
        for (const subLayer of this.layerGroups[layer]) {
          toAssign.push([subLayer, value]);
        }
      }
    }
    return assignments;
  }
}
