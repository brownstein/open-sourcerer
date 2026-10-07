import {
  Camera,
  Color,
  ColorManagement,
  DepthStencilFormat,
  DepthTexture,
  LinearSRGBColorSpace,
  Mesh,
  NearestFilter,
  NoToneMapping,
  OrthographicCamera,
  PlaneGeometry as PlaneBufferGeometry,
  RenderTarget,
  Scene,
  ShaderMaterial,
  ShaderMaterialParameters,
  UnsignedInt248Type,
  Vector2,
  WebGLRenderTarget,
  WebGLRenderer
} from "three";

import { CameraAPI } from "src/api/camera";
import { ColorRepresentation } from "src/api/util";
import { RenderLayers } from "src/engine/constants/renderLayers";

import { SizeAttributes } from "../util/vecTypes";
import compositorShaderFrag from "./compositorShaderFrag.glsl";
import compositorShaderVert from "./compositorShaderVert.glsl";

ColorManagement.enabled = false;

const kDefaultCanvasSize = 512;
const kMaxPushedRenderProps = 16;

export class CentralRenderer {
  public canvas: HTMLCanvasElement | OffscreenCanvas;
  public readonly usingOffscreenCanvas: boolean;
  public renderer: WebGLRenderer;
  // True while the underlying WebGL context is lost. Render paths bail on this
  // so a lost context degrades gracefully instead of throwing every frame.
  public isContextLost = false;
  protected rendererProps: {
    renderTarget: WebGLRenderTarget | null;
    clearColor: Color;
    clearAlpha: number;
  }[] = [];
  protected contextRestoredHandlers: Set<() => void> = new Set();
  private readonly handleContextLost = (event: Event) => {
    // Calling preventDefault tells the browser it may restore the context
    // later (it fires webglcontextrestored). Without this the loss is permanent.
    event.preventDefault();
    this.isContextLost = true;
    // The push/pop stack describes GPU state that no longer exists. Clearing it
    // prevents a render interrupted mid push/pop from leaking entries forever.
    this.rendererProps.length = 0;
  };
  private readonly handleContextRestored = () => {
    this.isContextLost = false;
    this.rendererProps.length = 0;
    for (const handler of this.contextRestoredHandlers) handler();
  };
  constructor(canvas?: HTMLCanvasElement) {
    if (canvas) {
      this.usingOffscreenCanvas = false;
      this.canvas = canvas;
    } else {
      this.usingOffscreenCanvas = true;
      this.canvas = new OffscreenCanvas(kDefaultCanvasSize, kDefaultCanvasSize);
    }
    this.renderer = new WebGLRenderer({
      canvas: this.canvas,
      alpha: true,
      depth: true,
      stencil: true,
      antialias: false
    });
    this.renderer.outputColorSpace = LinearSRGBColorSpace;
    this.renderer.toneMapping = NoToneMapping;
    // Both HTMLCanvasElement and OffscreenCanvas dispatch these events.
    this.canvas.addEventListener(
      "webglcontextlost",
      this.handleContextLost as EventListener
    );
    this.canvas.addEventListener(
      "webglcontextrestored",
      this.handleContextRestored as EventListener
    );
  }
  // Register a callback to run when the GL context is restored (e.g. to
  // reallocate render targets). Returns an unsubscribe function.
  onContextRestored(handler: () => void): () => void {
    this.contextRestoredHandlers.add(handler);
    return () => this.contextRestoredHandlers.delete(handler);
  }
  dispose() {
    this.canvas.removeEventListener(
      "webglcontextlost",
      this.handleContextLost as EventListener
    );
    this.canvas.removeEventListener(
      "webglcontextrestored",
      this.handleContextRestored as EventListener
    );
    this.contextRestoredHandlers.clear();
    this.rendererProps.length = 0;
    // Release three.js's GPU resources and drop our references so the GL context
    // becomes garbage-collectable (it stops counting against the browser's
    // per-page WebGL context cap once reclaimed). We deliberately do NOT call
    // forceContextLoss(): when this renderer was built on a caller-owned
    // <canvas> (Viewport/SkillTree), React reuses that same element across
    // unmount/remount (StrictMode, FlexLayout tab switches). forceContextLoss
    // permanently loses the context cached on the element, so the next
    // ViewportRenderingContext built on it gets a dead context and throws -
    // breaking the viewport for every level.
    this.renderer.dispose();
  }
  pushCurrentRenderProps() {
    const renderTarget = this.renderer.getRenderTarget();
    if (renderTarget && !isWebGLRenderTarget(renderTarget))
      throw new Error("current renderTarget is not a WebGLRenderTarget");
    const clearColor = new Color();
    this.renderer.getClearColor(clearColor);
    const clearAlpha = this.renderer.getClearAlpha();
    this.rendererProps.push({
      renderTarget,
      clearColor,
      clearAlpha
    });
    if (this.rendererProps.length > kMaxPushedRenderProps)
      console.warn(
        `Pushed ${this.rendererProps.length} render props - something is failing to call popCurrentProps.`
      );
  }
  popCurrentRenderProps() {
    const rendererProps = this.rendererProps.pop();
    if (!rendererProps) {
      console.warn(
        "Attempted to pop rendererProps without pushing any onto the stack"
      );
      return;
    }
    this.renderer.setRenderTarget(rendererProps.renderTarget);
    this.renderer.setClearColor(
      rendererProps.clearColor,
      rendererProps.clearAlpha
    );
  }
}

// Render things that only need to render at small resolutions separately.
export const kSecondaryRenderer = new CentralRenderer();

function isWebGLRenderTarget(rt: RenderTarget): rt is WebGLRenderTarget {
  return !!(rt as WebGLRenderTarget).isWebGLRenderTarget;
}

type CompositorLayer = {
  // RenderTarget for texture usage.
  renderTarget: WebGLRenderTarget;
  // Material to use to composite.
  material: ShaderMaterial;
  // Composition mesh.
  mesh: Mesh;
  // Grouping for use in transitions.
  group: number;
};

// Handles multi-RenderTarget composition onto a given WebGLRenderTarget or the OffscreenCanvas.
export class RenderTargetCompositor {
  public centralRenderer: CentralRenderer;
  public renderTarget: WebGLRenderTarget | null = null;
  public clearColor: Color | string | number = 0x000011;
  public clearAlpha: number = 1;
  protected layers: CompositorLayer[] = [];
  protected scene: Scene = new Scene();
  protected camera: OrthographicCamera = new OrthographicCamera(
    -1,
    1,
    1,
    -1,
    0,
    1
  );
  protected planeGeom: PlaneBufferGeometry = new PlaneBufferGeometry(2, 2);
  protected nextDepth = 0;
  protected minDepth?: number;
  protected maxDepth?: number;
  constructor(
    centralRenderer: CentralRenderer,
    minDepth?: number | null,
    maxDepth?: number | null
  ) {
    this.centralRenderer = centralRenderer;
    this.camera.position.z = 1;
    this.camera.lookAt(0, 0, -1);
    this.minDepth = minDepth ?? undefined;
    this.maxDepth = maxDepth ?? undefined;
  }
  addLayer(renderTarget: WebGLRenderTarget, depth: number, group: number = 0) {
    renderTarget.texture.magFilter = NearestFilter;
    renderTarget.texture.minFilter = NearestFilter;
    const uniforms: ShaderMaterialParameters["uniforms"] = {
      map: {
        value: renderTarget.texture
      },
      opacity: {
        value: 1
      },
      sampleRes: {
        value: new Vector2(0, 0)
      },
      distort: {
        value: 0
      },
      letterboxing: {
        value: 0
      }
    };
    const defines: ShaderMaterialParameters["defines"] = {};
    if (renderTarget.depthTexture) {
      uniforms.depthMap = {
        value: renderTarget.depthTexture
      };
      defines.HAS_DEPTH_MAP = "";
      if (this.minDepth !== undefined) {
        uniforms.minDepthVal = {
          value: this.minDepth
        };
        defines.HAS_MIN_DEPTH = "";
      }
      if (this.maxDepth !== undefined) {
        uniforms.maxDepthVal = {
          value: this.maxDepth
        };
        defines.HAS_MAX_DEPTH = "";
      }
    }
    const material = new ShaderMaterial({
      vertexShader: compositorShaderVert,
      fragmentShader: compositorShaderFrag,
      transparent: true,
      uniforms,
      defines
    });
    const mesh = new Mesh(this.planeGeom, material);
    mesh.position.z = depth;
    this.scene.add(mesh);
    const layer: CompositorLayer = {
      renderTarget,
      material,
      mesh,
      group
    };
    this.layers.push(layer);
  }
  adjustLayer(
    layerGroup: number,
    layerIndex: number,
    adjustment: (layer: CompositorLayer) => void
  ) {
    let index = 0;
    for (const layer of this.layers) {
      if (layer.group !== layerGroup) continue;
      if (index === layerIndex) {
        adjustment(layer);
        break;
      }
      index++;
    }
  }
  adjustLayerGroup(
    layerGroup: number,
    adjustment: (layer: CompositorLayer) => void
  ) {
    for (const layer of this.layers) {
      if (layer.group === layerGroup) adjustment(layer);
    }
  }
  adjustAllLayers(adjustment: (layer: CompositorLayer) => void) {
    for (const layer of this.layers) adjustment(layer);
  }
  render() {
    if (this.centralRenderer.isContextLost) return;
    this.centralRenderer.pushCurrentRenderProps();
    try {
      this.centralRenderer.renderer.setRenderTarget(this.renderTarget);
      this.centralRenderer.renderer.setClearColor(
        this.clearColor,
        this.clearAlpha
      );
      this.centralRenderer.renderer.render(this.scene, this.camera);
    } finally {
      this.centralRenderer.popCurrentRenderProps();
    }
  }
  dispose() {
    for (const layer of this.layers) layer.material.dispose();
    this.planeGeom.dispose();
  }
}

/**
 * Viewport rendering context - safely reuses the central WebGL renderer with
 * scene composition
 */
export class ViewportRenderingContext {
  public primaryCanvas: HTMLCanvasElement;
  public clearColor: Color | string | number = 0x112233;
  public clearAlpha: number = 1;
  protected centralRenderer: CentralRenderer;
  protected primaryCompositor: RenderTargetCompositor;
  protected defaultRenderTarget: WebGLRenderTarget;
  protected displacementRenderTarget: WebGLRenderTarget;
  protected textRenderTarget: WebGLRenderTarget;
  protected defaultRenderTarget2: WebGLRenderTarget;
  protected displacementRenderTarget2: WebGLRenderTarget;
  protected textRenderTarget2: WebGLRenderTarget;
  protected lastCameraSize: SizeAttributes = {
    width: kDefaultCanvasSize,
    height: kDefaultCanvasSize
  };
  protected lastCanvasSize: SizeAttributes = {
    width: kDefaultCanvasSize,
    height: kDefaultCanvasSize
  };
  protected lastDevicePixelRatio: number = 1;
  protected lastTransitionProgress?: number;
  protected transferErrorCount = 0;
  protected disposeContextRestored?: () => void;

  protected vfxDistort = 0;
  protected vfxCompositeOpacity = 1;
  protected vfxLetterboxing = 0;

  constructor(
    primaryCanvas: HTMLCanvasElement,
    opt?: {
      clearColor?: ColorRepresentation;
      clearAlpha?: number;
    }
  ) {
    this.clearColor = opt?.clearColor ?? this.clearColor;
    this.clearAlpha = opt?.clearAlpha ?? this.clearAlpha;

    this.centralRenderer = new CentralRenderer(primaryCanvas);
    this.primaryCanvas = primaryCanvas;

    this.defaultRenderTarget = new WebGLRenderTarget(
      kDefaultCanvasSize,
      kDefaultCanvasSize,
      {
        magFilter: NearestFilter,
        minFilter: NearestFilter,
        depthBuffer: true,
        stencilBuffer: true
      }
    );
    this.defaultRenderTarget.depthTexture = new DepthTexture(
      kDefaultCanvasSize,
      kDefaultCanvasSize
    );
    this.defaultRenderTarget.depthTexture.magFilter = NearestFilter;
    this.defaultRenderTarget.depthTexture.format = DepthStencilFormat;
    this.defaultRenderTarget.depthTexture.type = UnsignedInt248Type;
    this.displacementRenderTarget = new WebGLRenderTarget(
      kDefaultCanvasSize,
      kDefaultCanvasSize,
      {
        magFilter: NearestFilter,
        minFilter: NearestFilter
      }
    );
    this.displacementRenderTarget.depthTexture = new DepthTexture(
      kDefaultCanvasSize,
      kDefaultCanvasSize
    );
    this.displacementRenderTarget.depthTexture.magFilter = NearestFilter;
    this.textRenderTarget = new WebGLRenderTarget(
      kDefaultCanvasSize,
      kDefaultCanvasSize,
      {
        magFilter: NearestFilter,
        minFilter: NearestFilter
      }
    );
    this.textRenderTarget.depthTexture = new DepthTexture(
      kDefaultCanvasSize,
      kDefaultCanvasSize
    );
    this.textRenderTarget.depthTexture.magFilter = NearestFilter;

    this.defaultRenderTarget2 = new WebGLRenderTarget(
      kDefaultCanvasSize,
      kDefaultCanvasSize,
      {
        magFilter: NearestFilter,
        minFilter: NearestFilter,
        depthBuffer: true,
        stencilBuffer: true
      }
    );
    this.defaultRenderTarget2.depthTexture = new DepthTexture(
      kDefaultCanvasSize,
      kDefaultCanvasSize
    );
    this.defaultRenderTarget2.depthTexture.magFilter = NearestFilter;
    this.defaultRenderTarget2.depthTexture.format = DepthStencilFormat;
    this.defaultRenderTarget2.depthTexture.type = UnsignedInt248Type;
    this.displacementRenderTarget2 = new WebGLRenderTarget(
      kDefaultCanvasSize,
      kDefaultCanvasSize,
      {
        magFilter: NearestFilter,
        minFilter: NearestFilter
      }
    );
    this.displacementRenderTarget2.depthTexture = new DepthTexture(
      kDefaultCanvasSize,
      kDefaultCanvasSize
    );
    this.displacementRenderTarget2.depthTexture.magFilter = NearestFilter;
    this.textRenderTarget2 = new WebGLRenderTarget(
      kDefaultCanvasSize,
      kDefaultCanvasSize,
      {
        magFilter: NearestFilter,
        minFilter: NearestFilter
      }
    );
    this.textRenderTarget2.depthTexture = new DepthTexture(
      kDefaultCanvasSize,
      kDefaultCanvasSize
    );
    this.textRenderTarget2.depthTexture.magFilter = NearestFilter;

    this.primaryCompositor = new RenderTargetCompositor(this.centralRenderer);
    this.primaryCompositor.clearColor = this.clearColor;
    this.primaryCompositor.clearAlpha = this.clearAlpha;
    this.primaryCompositor.addLayer(this.defaultRenderTarget, 0, 0);
    this.primaryCompositor.addLayer(this.displacementRenderTarget, 0.1, 0);
    this.primaryCompositor.addLayer(this.textRenderTarget, 0.2, 0);
    this.primaryCompositor.addLayer(this.defaultRenderTarget2, 0.05, 1);
    this.primaryCompositor.addLayer(this.displacementRenderTarget2, 0.15, 1);
    this.primaryCompositor.addLayer(this.textRenderTarget2, 0.25, 1);

    // Adjust sampling resolution of the main layer.
    const res = new Vector2(1 / kDefaultCanvasSize, 1 / kDefaultCanvasSize);
    this.primaryCompositor.adjustLayer(0, 0, (layer) => {
      layer.material.uniforms.sampleRes.value.copy(res);
      layer.material.uniformsNeedUpdate = true;
    });
    this.primaryCompositor.adjustLayer(1, 0, (layer) => {
      layer.material.uniforms.sampleRes.value.copy(res);
      layer.material.uniformsNeedUpdate = true;
    });

    // After a context restore the GPU-side framebuffers/textures are gone.
    // Disposing the render targets marks them for lazy re-allocation on the
    // next render so the viewport recovers instead of rendering from stale,
    // invalid GL handles.
    this.disposeContextRestored = this.centralRenderer.onContextRestored(() => {
      for (const rt of this.allRenderTargets()) rt.dispose();
    });
  }
  protected allRenderTargets(): WebGLRenderTarget[] {
    return [
      this.defaultRenderTarget,
      this.displacementRenderTarget,
      this.textRenderTarget,
      this.defaultRenderTarget2,
      this.displacementRenderTarget2,
      this.textRenderTarget2
    ];
  }
  resizeCamera(widthIn: number, heightIn: number) {
    const width = Math.floor(widthIn);
    const height = Math.floor(heightIn);
    if (
      width === this.lastCameraSize.width &&
      height === this.lastCameraSize.height
    )
      return false;
    this.lastCameraSize = { width, height };

    // Adjust sampling resolution of the main layer.
    const res = new Vector2(width ? 1 / width : 0, height ? 1 / height : 0);
    this.primaryCompositor.adjustLayer(0, 0, (layer) => {
      layer.material.uniforms.sampleRes.value.copy(res);
      layer.material.uniformsNeedUpdate = true;
    });
    this.primaryCompositor.adjustLayer(1, 0, (layer) => {
      layer.material.uniforms.sampleRes.value.copy(res);
      layer.material.uniformsNeedUpdate = true;
    });

    return true;
  }
  resizeCanvas(widthIn: number, heightIn: number, devicePixelRatio: number) {
    const width = Math.round(widthIn);
    const height = Math.round(heightIn);
    if (width === 0 || height === 0) return false;
    if (
      width === this.lastCanvasSize.width &&
      height === this.lastCanvasSize.height &&
      devicePixelRatio === this.lastDevicePixelRatio
    )
      return false;
    this.lastCanvasSize = { width, height };
    // Lots of render targets here... might want to adjust.
    this.lastDevicePixelRatio = devicePixelRatio;
    this.defaultRenderTarget.setSize(
      width * devicePixelRatio,
      height * devicePixelRatio
    );
    this.displacementRenderTarget.setSize(
      width * devicePixelRatio,
      height * devicePixelRatio
    );
    this.defaultRenderTarget2.setSize(
      width * devicePixelRatio,
      height * devicePixelRatio
    );
    this.displacementRenderTarget2.setSize(
      width * devicePixelRatio,
      height * devicePixelRatio
    );
    this.textRenderTarget.setSize(
      width * devicePixelRatio,
      height * devicePixelRatio
    );
    this.textRenderTarget2.setSize(
      width * devicePixelRatio,
      height * devicePixelRatio
    );
    this.primaryCompositor.renderTarget?.setSize(
      width * devicePixelRatio,
      height * devicePixelRatio
    );
    return true;
  }
  render(
    scene: Scene,
    camera: Camera,
    scene2?: Scene,
    camera2?: Camera,
    transitionProgress?: number
  ) {
    if (this.centralRenderer.isContextLost) return;

    const transitioning =
      scene2 !== undefined &&
      camera2 !== undefined &&
      transitionProgress !== undefined;

    // Preserve current camera and renderer settings.
    const camLayerMask = camera.layers.mask;
    this.centralRenderer.pushCurrentRenderProps();
    try {
      this.renderInner(
        scene,
        camera,
        scene2,
        camera2,
        transitionProgress,
        transitioning,
        camLayerMask
      );
    } finally {
      this.centralRenderer.popCurrentRenderProps();
    }
  }
  private renderInner(
    scene: Scene,
    camera: Camera,
    scene2: Scene | undefined,
    camera2: Camera | undefined,
    transitionProgress: number | undefined,
    transitioning: boolean,
    camLayerMask: number
  ) {
    // Render default layer.
    this.centralRenderer.renderer.setRenderTarget(this.defaultRenderTarget);
    this.centralRenderer.renderer.setClearColor(
      this.clearColor,
      this.clearAlpha
    );
    camera.layers.set(RenderLayers.default);
    this.centralRenderer.renderer.render(scene, camera);

    // Provide default layer render target as camera metadata so it
    // can be picked up by Refractor2D.
    // TODO: see if we still need this in v3 engine.
    // [ME @legocris deleted it and it still worked]
    const cameraMetadata: ViewportRendererCameraMetadata = {
      defaultPassRenderTarget: this.defaultRenderTarget
    };
    camera.userData[kViewportRendererCameraMetadataKey] = cameraMetadata;

    // Render default layer for 2nd scene.
    if (transitioning && scene2 && camera2) {
      this.centralRenderer.renderer.setRenderTarget(this.defaultRenderTarget2);
      this.centralRenderer.renderer.setClearColor(
        this.clearColor,
        this.clearAlpha
      );
      camera2.layers.set(RenderLayers.default);

      // Provide default layer render target as camera metadata
      // for the same Refractor2D usage.
      // TODO: see ipf we still need this in v3 engine.
      this.centralRenderer.renderer.render(scene2, camera2);
      const cameraMetadata2: ViewportRendererCameraMetadata = {
        defaultPassRenderTarget: this.defaultRenderTarget2
      };
      camera2.userData[kViewportRendererCameraMetadataKey] = cameraMetadata2;
    }

    // Render displacement layer.
    this.centralRenderer.renderer.setRenderTarget(
      this.displacementRenderTarget
    );
    this.centralRenderer.renderer.setClearAlpha(0);
    camera.layers.set(RenderLayers.displacement);
    this.centralRenderer.renderer.render(scene, camera);

    // Render text layer for 2nd scene.
    if (transitioning && scene2 && camera2) {
      this.centralRenderer.renderer.setRenderTarget(
        this.displacementRenderTarget2
      );
      this.centralRenderer.renderer.setClearAlpha(0);
      camera2.layers.set(RenderLayers.displacement);
      this.centralRenderer.renderer.render(scene2, camera2);
    }

    // Render text layer.
    this.centralRenderer.renderer.setRenderTarget(this.textRenderTarget);
    this.centralRenderer.renderer.setClearAlpha(0);
    camera.layers.set(RenderLayers.text);
    this.centralRenderer.renderer.render(scene, camera);

    // Render text layer for 2nd scene.
    if (transitioning && scene2 && camera2) {
      this.centralRenderer.renderer.setRenderTarget(this.textRenderTarget2);
      this.centralRenderer.renderer.setClearAlpha(0);
      camera2.layers.set(RenderLayers.text);
      this.centralRenderer.renderer.render(scene2, camera2);
    }

    // Reapply old camera and renderer settings.
    camera.layers.mask = camLayerMask;
    if (transitioning && camera2) camera2.layers.mask = camLayerMask;

    // Adjust opacitites.
    this.setTransitionProgress(transitionProgress);

    // Configure the OffscreenCanvas to the appropreate size and pixel ratio.
    this.centralRenderer.renderer.setRenderTarget(null);
    this.centralRenderer.renderer.setSize(
      this.lastCanvasSize.width,
      this.lastCanvasSize.height,
      false
    );
    this.centralRenderer.renderer.setPixelRatio(this.lastDevicePixelRatio);
    this.primaryCompositor.render();
  }
  private setTransitionProgress(transitionProgress: number | undefined) {
    if (transitionProgress === this.lastTransitionProgress) return;
    this.lastTransitionProgress = transitionProgress;
    if (transitionProgress !== undefined) {
      const invTransitionProgress = 1 - transitionProgress;
      this.primaryCompositor.adjustLayerGroup(0, (g) => {
        if (g.material.uniforms.opacity.value !== invTransitionProgress) {
          g.material.uniforms.opacity.value =
            invTransitionProgress * this.vfxCompositeOpacity;
          g.material.uniformsNeedUpdate = true;
        }
      });
      this.primaryCompositor.adjustLayerGroup(1, (g) => {
        if (g.material.uniforms.opacity.value !== transitionProgress) {
          g.material.uniforms.opacity.value = transitionProgress;
          g.material.uniformsNeedUpdate = true;
          g.mesh.visible = true;
        }
      });
    } else {
      this.primaryCompositor.adjustLayerGroup(0, (g) => {
        if (g.material.uniforms.opacity.value !== 1) {
          g.material.uniforms.opacity.value = this.vfxCompositeOpacity;
          g.material.uniformsNeedUpdate = true;
        }
      });
      this.primaryCompositor.adjustLayerGroup(
        1,
        (g) => (g.mesh.visible = false)
      );
    }
  }

  setDistort(distortAmt: number) {
    if (distortAmt !== this.vfxDistort) {
      this.vfxDistort = distortAmt;
      this.primaryCompositor.adjustAllLayers((layer) => {
        layer.material.uniforms.distort.value = distortAmt;
      });
    }
  }

  setLetterboxing(letterboxAmt: number) {
    if (letterboxAmt !== this.vfxLetterboxing) {
      this.vfxLetterboxing = letterboxAmt;
      this.primaryCompositor.adjustAllLayers((layer) => {
        layer.material.uniforms.letterboxing.value = letterboxAmt;
      });
    }
  }

  setCompositeOpacity(opacityAmt: number) {
    if (opacityAmt !== this.vfxCompositeOpacity) {
      this.vfxCompositeOpacity = opacityAmt;
      this.primaryCompositor.adjustAllLayers((layer) => {
        layer.material.uniforms.opacity.value = opacityAmt;
      });
    }
  }

  // TODO:
  setVfx(vfx: CameraAPI["vfx"]) {
    const vfxDistort = vfx?.distort ?? 0;
    const vfxCompositeOpacity = vfx?.compositeOpacity ?? 1;
    if (
      vfxDistort !== this.vfxDistort ||
      vfxCompositeOpacity !== this.vfxCompositeOpacity
    ) {
      this.vfxDistort = vfxDistort;
      this.vfxCompositeOpacity = vfxCompositeOpacity;
      this.primaryCompositor.adjustAllLayers((layer) => {
        layer.material.uniforms.distort.value = vfxDistort;
        layer.material.uniforms.opacity.value = vfxCompositeOpacity;
      });
    }
  }
  dispose() {
    this.disposeContextRestored?.();
    this.disposeContextRestored = undefined;
    this.primaryCompositor.dispose();
    for (const rt of this.allRenderTargets()) {
      rt.depthTexture?.dispose();
      rt.dispose();
    }
    // Release the GL context so it stops counting against the browser's
    // per-page WebGL context cap.
    this.centralRenderer.dispose();
  }
}

export const kViewportRendererCameraMetadataKey = "viewport-renderer";

export type ViewportRendererCameraMetadata = {
  defaultPassRenderTarget: WebGLRenderTarget;
};

export type ViewportRendererCameraUserData = {
  [kViewportRendererCameraMetadataKey]?: ViewportRendererCameraMetadata;
};

export class SkillTreeRenderingContext {
  public primaryCanvas: HTMLCanvasElement;
  protected centralRenderer: CentralRenderer;
  protected primaryCompositor: RenderTargetCompositor;
  protected renderTarget: WebGLRenderTarget;
  public clearColor: Color | string | number = 0x110000;
  public clearAlpha: number = 1;
  protected lastCameraSize: SizeAttributes = {
    width: kDefaultCanvasSize,
    height: kDefaultCanvasSize
  };
  protected lastCanvasSize: SizeAttributes = {
    width: kDefaultCanvasSize,
    height: kDefaultCanvasSize
  };
  protected lastDevicePixelRatio: number = 1;
  protected disposeContextRestored?: () => void;
  constructor(primaryCanvas: HTMLCanvasElement) {
    this.centralRenderer = new CentralRenderer(primaryCanvas);
    this.primaryCanvas = primaryCanvas;
    this.renderTarget = new WebGLRenderTarget(
      kDefaultCanvasSize,
      kDefaultCanvasSize,
      {
        magFilter: NearestFilter,
        minFilter: NearestFilter,
        depthBuffer: false,
        stencilBuffer: false
      }
    );
    this.primaryCompositor = new RenderTargetCompositor(this.centralRenderer);
    this.primaryCompositor.addLayer(this.renderTarget, 0, 0);

    // Reallocate the render target after a context restore (see
    // ViewportRenderingContext for the rationale).
    this.disposeContextRestored = this.centralRenderer.onContextRestored(() => {
      this.renderTarget.dispose();
    });
  }

  resizeCamera(widthIn: number, heightIn: number) {
    const width = Math.floor(widthIn);
    const height = Math.floor(heightIn);
    if (
      width === this.lastCameraSize.width &&
      height === this.lastCameraSize.height
    )
      return false;
    this.lastCameraSize = { width, height };
    return true;
  }
  resizeCanvas(widthIn: number, heightIn: number, devicePixelRatio: number) {
    const width = Math.round(widthIn);
    const height = Math.round(heightIn);
    if (width === 0 || height === 0) return false;
    if (
      width === this.lastCanvasSize.width &&
      height === this.lastCanvasSize.height &&
      devicePixelRatio === this.lastDevicePixelRatio
    )
      return false;
    this.lastCanvasSize = { width, height };
    // Lots of render targets here... might want to adjust.
    this.lastDevicePixelRatio = devicePixelRatio;
    this.renderTarget.setSize(
      width * devicePixelRatio,
      height * devicePixelRatio
    );
    return true;
  }

  render(scene: Scene, camera: Camera) {
    if (this.centralRenderer.isContextLost) return;
    this.centralRenderer.pushCurrentRenderProps();
    try {
      this.centralRenderer.renderer.setRenderTarget(this.renderTarget);
      this.centralRenderer.renderer.setClearColor(
        this.clearColor,
        this.clearAlpha
      );
      camera.layers.set(RenderLayers.default);
      this.centralRenderer.renderer.render(scene, camera);

      // Configure the OffscreenCanvas to the appropreate size and pixel ratio.
      this.centralRenderer.renderer.setRenderTarget(null);
      this.centralRenderer.renderer.setSize(
        this.lastCanvasSize.width,
        this.lastCanvasSize.height,
        false
      );
      this.centralRenderer.renderer.setPixelRatio(this.lastDevicePixelRatio);
      this.primaryCompositor.render();
    } finally {
      this.centralRenderer.popCurrentRenderProps();
    }
  }

  dispose() {
    this.disposeContextRestored?.();
    this.disposeContextRestored = undefined;
    this.primaryCompositor.dispose();
    this.renderTarget.dispose();
    // Release the GL context so it stops counting against the browser's
    // per-page WebGL context cap.
    this.centralRenderer.dispose();
  }
}

/**
 * Simple rendering context for items images.
 */
export class SimpleRenderingContext {
  public canvas: HTMLCanvasElement;
  public clearColor: Color | string | number = 0x112233;
  public clearAlpha: number = 0;
  protected centralRenderer: CentralRenderer;
  protected context: ImageBitmapRenderingContext | null = null;
  protected lastCanvasSize: SizeAttributes = {
    width: kDefaultCanvasSize,
    height: kDefaultCanvasSize
  };
  protected lastPixelRatio = 1;
  protected transferErrorCount = 0;
  constructor(centralRenderer: CentralRenderer, canvas: HTMLCanvasElement) {
    this.centralRenderer = centralRenderer;
    this.canvas = canvas;
    this.context = canvas.getContext("bitmaprenderer");
  }
  resizeCanvas(widthIn: number, heightIn: number, devicePixelRatio: number) {
    const width = Math.floor(widthIn);
    const height = Math.floor(heightIn);
    if (
      width === this.lastCanvasSize.width &&
      height === this.lastCanvasSize.height &&
      devicePixelRatio === this.lastPixelRatio
    )
      return false;
    this.lastCanvasSize = { width, height };
    this.lastPixelRatio = devicePixelRatio;
    return true;
  }
  render(scene: Scene, camera: Camera) {
    if (!this.context) return;
    // Bail while the shared secondary context is lost. Without this the
    // transferToImageBitmap below throws every frame for every item image,
    // flooding the console - the visible symptom of the context-loss cascade.
    if (this.centralRenderer.isContextLost) return;

    // Preserve current renderer settings.
    this.centralRenderer.pushCurrentRenderProps();
    try {
      // Configure renderer.
      this.centralRenderer.renderer.setRenderTarget(null);
      this.centralRenderer.renderer.setSize(
        this.lastCanvasSize.width,
        this.lastCanvasSize.height,
        false
      );
      this.centralRenderer.renderer.setPixelRatio(this.lastPixelRatio);
      this.centralRenderer.renderer.setClearColor(
        this.clearColor,
        this.clearAlpha
      );

      // Render.
      this.centralRenderer.renderer.render(scene, camera);

      if (this.centralRenderer.canvas instanceof OffscreenCanvas) {
        try {
          this.context.transferFromImageBitmap(
            this.centralRenderer.canvas.transferToImageBitmap()
          );
          this.transferErrorCount = 0;
        } catch (err) {
          // The context can be lost between the guard above and here. Skip this
          // frame and log once - never re-throw into the render loop, which
          // would skip popCurrentRenderProps and leak the prop stack every frame.
          this.transferErrorCount++;
          if (this.transferErrorCount === 1)
            console.warn(
              "SimpleRenderingContext: transferToImageBitmap failed (context lost?); skipping frames until restored.",
              err
            );
        }
      }
    } finally {
      // Reinstate previous renderer settings.
      this.centralRenderer.popCurrentRenderProps();
    }
  }
}
