import {
  AddEquation,
  CircleGeometry,
  Color,
  CustomBlending,
  DstColorFactor,
  Material,
  Mesh,
  MeshBasicMaterial,
  NearestFilter,
  NoBlending,
  Object3D,
  OneFactor,
  OneMinusSrcAlphaFactor,
  OrthographicCamera,
  PlaneGeometry,
  ReverseSubtractEquation,
  Scene,
  ShaderMaterial,
  Texture,
  WebGLRenderTarget,
  WebGLRenderer,
  ZeroFactor
} from "three";

import { EntityProps } from "src/api/entity";
import { RenderLayers } from "src/engine/constants/renderLayers";
import { kInvPixelScale, kPixelScale } from "src/engine/constants/scaling";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import { addResourceLoader, getResource } from "src/engine/entity/decorators";
import { TextureResourceLoader } from "src/engine/loader/Loaders";

import darknessPng from "./sprites/big-shrine/shrine-darkness.png";

// Resolution matches the darkness PNG aspect.
const COMP_W = 1000;
const COMP_H = 1660;

export type ShrineDarknessProps = EntityProps & {};

@addResourceLoader(
  new TextureResourceLoader("ShrineDarknessTexture", darknessPng)
)
export class ShrineDarkness extends CoreEntity {
  static type = "ShrineDarkness";
  public type = ShrineDarkness.type;

  public object3D = new Object3D();

  // Render target that holds the darkness composite (RGBA).
  private darknessRT: WebGLRenderTarget;

  // Initial pass: blit the static darkness texture into the RT on the first frame.
  private darknessScene: Scene;
  private darknessCamera: OrthographicCamera;
  private needsReRender = true;

  public reRender(): void {
    this.needsReRender = true;
  }

  // Animation pass: each frame draws a small alpha-decrement quad into the existing RT
  // without clearing it, so transparency accumulates frame by frame.
  // ReverseSubtractEquation on alpha: newAlpha = dstAlpha - srcAlpha
  // Each frame subtracts (deltaMs / duration) from the RT alpha until it reaches 0.
  private fadeScene: Scene;
  private fadeMaterial: MeshBasicMaterial;
  private fadeMesh: Mesh;
  // Aspect-ratio correction so the circle looks circular on the display mesh.
  private circleAspectX: number;
  // NDC radius at full animation progress — large enough to cover the whole RT.
  private static readonly MAX_CIRCLE_RADIUS = 2.0;

  // Display mesh reads from the RT with normal blending (respects alpha).
  private displayMaterial: MeshBasicMaterial;

  // Faders drawn into darknessRT after every darkness draw (init + animation).
  // Registered object3Ds are rendered black (NoBlending) so those areas stay dark
  // even as the animation fades the surrounding darkness away.
  public faders: Object3D[] = [];
  public darkerCamera: OrthographicCamera;
  private darkerScene = new Scene();
  private darkerMaterialCache = new Map<Texture | null, MeshBasicMaterial>();

  private getFaderMaterial(orig: Material): MeshBasicMaterial {
    const map: Texture | null =
      (orig as MeshBasicMaterial).map ??
      (orig as ShaderMaterial).uniforms?.map?.value ??
      null;
    let mat = this.darkerMaterialCache.get(map);
    if (!mat) {
      mat = new MeshBasicMaterial({
        color: 0x000000,
        map,
        alphaTest: map ? 0.1 : 0,
        transparent: true,
        opacity: 1.0,
        blending: CustomBlending,
        blendEquation: AddEquation,
        blendSrc: DstColorFactor,
        blendDst: OneMinusSrcAlphaFactor
      });
      this.darkerMaterialCache.set(map, mat);
    }
    return mat;
  }

  public addFader(obj: Object3D): void {
    this.faders.push(obj);
  }
  public removeFader(obj: Object3D): void {
    this.faders = this.faders.filter((o) => o !== obj);
  }

  // Scratch Color for save/restore.
  private savedClearColor = new Color();

  // Animation state.
  private animating = false;
  private animationDuration = 0;
  private animationElapsed = 0;
  private lastDeltaMs = 0;

  constructor(props: ShrineDarknessProps) {
    super(props);

    const width = props.size?.width ?? 15;
    const height = props.size?.height ?? 10;

    // --- Render target (RGBA so we can manipulate the alpha channel) ---
    this.darknessRT = new WebGLRenderTarget(COMP_W, COMP_H, {
      magFilter: NearestFilter,
      minFilter: NearestFilter,
      depthBuffer: false
    });

    // --- Initial blit: darkness texture into RT ---
    const darknessTexture = getResource<Texture>(
      ShrineDarkness,
      "ShrineDarknessTexture"
    );
    this.darknessCamera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
    this.darknessCamera.position.set(0, 0, 1);
    this.darknessScene = new Scene();
    this.darknessScene.add(
      new Mesh(
        new PlaneGeometry(2, 2),
        new MeshBasicMaterial({ map: darknessTexture, blending: NoBlending })
      )
    );

    // --- Alpha-decrement quad ---
    // CustomBlending with separate alpha equation:
    //   RGB:   0 * src  +  1 * dst  →  preserve darkness texture colours.
    //   Alpha: dst - src             →  subtract a small amount each frame.
    // Setting fadeMaterial.opacity to (deltaMs / duration) chips away the alpha
    // linearly until the darkness is fully transparent.
    this.fadeMaterial = new MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0,
      blending: CustomBlending,
      blendEquation: AddEquation,
      blendSrc: ZeroFactor,
      blendDst: OneFactor,
      blendEquationAlpha: ReverseSubtractEquation,
      blendSrcAlpha: OneFactor,
      blendDstAlpha: OneFactor
    });
    // Circle grows from the light source position (center X, 1/3 up the Y axis — start of second third from bottom).
    // NDC y=1/3 equals 2/3 from bottom in the [-1, 1] camera space.
    // Aspect correction: scale X by height/width so the circle appears circular on screen
    // (1 NDC unit in X = width/2 world units, 1 NDC unit in Y = height/2 world units).
    this.circleAspectX = height / width;
    this.fadeMesh = new Mesh(new CircleGeometry(1, 64), this.fadeMaterial);
    this.fadeMesh.position.set(0, -1 / 3, 0);
    this.fadeMesh.scale.set(0, 0, 1);
    this.fadeScene = new Scene();
    this.fadeScene.add(this.fadeMesh);

    // --- Display mesh: reads from RT, normal blending respects alpha ---
    this.displayMaterial = new MeshBasicMaterial({
      map: this.darknessRT.texture,
      transparent: true,
      depthWrite: false
    });
    const displayMesh = new Mesh(
      new PlaneGeometry(width, height),
      this.displayMaterial
    );
    displayMesh.layers.set(RenderLayers.default);
    displayMesh.onBeforeRender = (renderer: WebGLRenderer) => {
      this.renderDarknessRT(renderer);
    };

    this.object3D.add(displayMesh);
    this.object3D.position
      .copy(this.position)
      .multiplyScalar(kPixelScale)
      .round()
      .multiplyScalar(kInvPixelScale);
    // Render on top of everything.
    this.object3D.position.z = 10;

    // World-space orthographic camera for rendering entity object3Ds as faders,
    // aligned to this entity's bounds — same pattern as silhouetteCamera in ShrineGodRay.
    const hw = width * 0.5;
    const hh = height * 0.5;
    this.darkerCamera = new OrthographicCamera(-hw, hw, hh, -hh, 0.1, 128);
    const cx = this.object3D.position.x;
    const cy = this.object3D.position.y;
    this.darkerCamera.position.set(cx, cy, 64);
    this.darkerCamera.lookAt(cx, cy, 0);
    this.darkerCamera.updateProjectionMatrix();
  }

  startAnimation(durationMs: number) {
    this.animationDuration = durationMs;
    this.animationElapsed = 0;
    this.animating = true;
  }

  instantComplete() {
    this.animating = false;
    this.displayMaterial.opacity = 0;
  }

  private renderFaders(renderer: WebGLRenderer) {
    if (!this.faders.length) return;

    type Swap = { mesh: Mesh; prev: Material | Material[] };
    const swapped: Swap[] = [];
    const prevParents: Map<Object3D, Object3D | null> = new Map();

    for (const obj of this.faders) {
      prevParents.set(obj, obj.parent);
      this.darkerScene.add(obj);
      obj.traverse((child) => {
        if (child instanceof Mesh) {
          const orig = Array.isArray(child.material)
            ? child.material[0]
            : child.material;
          swapped.push({ mesh: child, prev: child.material });
          child.material = this.getFaderMaterial(
            orig ?? new MeshBasicMaterial()
          );
        }
      });
    }

    renderer.render(this.darkerScene, this.darkerCamera);

    for (const { mesh, prev } of swapped) mesh.material = prev;
    for (const [obj, parent] of prevParents) {
      if (parent) parent.add(obj);
    }
  }

  private renderDarknessRT(renderer: WebGLRenderer) {
    const prevRT = renderer.getRenderTarget();
    renderer.getClearColor(this.savedClearColor);
    const prevClearAlpha = renderer.getClearAlpha();
    const prevAutoClear = renderer.autoClear;

    renderer.setRenderTarget(this.darknessRT);
    renderer.autoClear = false;

    if (this.needsReRender) {
      // Re-blit the darkness texture and faders into the RT.
      renderer.setClearColor(0x000000, 0);
      renderer.clear();
      renderer.render(this.darknessScene, this.darknessCamera);
      this.needsReRender = false;
      this.renderFaders(renderer);
    } else if (this.animating) {
      // Animation: draw the alpha-decrement circle on top of the existing RT —
      // no clear, so the decrement accumulates frame by frame.
      // The circle grows over time: the center always gets subtracted (fades first),
      // outer regions only accumulate alpha decrements once the circle reaches them.
      this.fadeMaterial.opacity = this.lastDeltaMs / this.animationDuration;
      const progress = this.animationElapsed / this.animationDuration;
      const radius = ShrineDarkness.MAX_CIRCLE_RADIUS * progress;
      this.fadeMesh.scale.set(this.circleAspectX * radius, radius, 1);
      renderer.render(this.fadeScene, this.darknessCamera);
    }
    // When not animating and needsReRender is false: do nothing — the RT persists.

    renderer.autoClear = prevAutoClear;
    renderer.setRenderTarget(prevRT);
    renderer.setClearColor(this.savedClearColor, prevClearAlpha);
  }

  step(ms: number) {
    super.step(ms);
    this.lastDeltaMs = ms;
    if (this.animating) {
      this.animationElapsed += ms;
      if (this.animationElapsed >= this.animationDuration) {
        this.animationElapsed = this.animationDuration;
        this.animating = false;
      }
    }
  }

  private disposeSceneGeometry(root: Object3D): void {
    root.traverse((child) => {
      if (child instanceof Mesh) {
        child.geometry.dispose();
        const mats = Array.isArray(child.material)
          ? child.material
          : [child.material];
        for (const mat of mats) mat.dispose();
      }
    });
  }

  destroy(): void {
    super.destroy();

    // Dispose all GPU resources created by this entity. The shared darkness
    // texture comes from the resource loader and is intentionally left alone.
    this.disposeSceneGeometry(this.object3D);
    this.disposeSceneGeometry(this.darknessScene);
    this.disposeSceneGeometry(this.fadeScene);

    for (const mat of this.darkerMaterialCache.values()) mat.dispose();
    this.darkerMaterialCache.clear();

    this.darknessRT.dispose();
  }
}
