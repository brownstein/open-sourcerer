import {
  AdditiveBlending,
  Color,
  IUniform,
  Material,
  Mesh,
  MeshBasicMaterial,
  NearestFilter,
  Object3D,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  Texture,
  Vector2,
  WebGLRenderTarget,
  WebGLRenderer
} from "three";

import { EntityProps } from "src/api/entity";
import { RenderLayers } from "src/engine/constants/renderLayers";
import { kInvPixelScale, kPixelScale } from "src/engine/constants/scaling";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import { addResourceLoader, getResource } from "src/engine/entity/decorators";
import { TextureResourceLoader } from "src/engine/loader/Loaders";

import fragmentShader from "./shaders/shrineGodRayFrag.glsl";
import vertexShader from "./shaders/shrineSparkleVert.glsl";
import darknessPng from "./sprites/big-shrine/shrine-darkness.png";
import lightsPng from "./sprites/big-shrine/shrine-lights.png";

// Entity types excluded from the silhouette pass (backgrounds and the god ray itself).
// ShrineBridge is excluded here because it registers as a bright contributor instead.
const SILHOUETTE_EXCLUDE_TYPES = new Set([
  "ParallaxImage",
  "ShrineGodRay",
  "ShrineDarkness",
  "ShrineBackground",
  "ShrineBridge"
]);

// Resolution of the render targets (~same aspect as the mask PNG 1000x1660).
const COMP_W = 1000;
const COMP_H = 1660;

export type ShrineGodRayProps = EntityProps & {};

@addResourceLoader(
  new TextureResourceLoader("ShrineGodRayDarknessSource", darknessPng)
)
@addResourceLoader(
  new TextureResourceLoader("ShrineGodRayLightsSource", lightsPng)
)
export class ShrineGodRay extends CoreEntity {
  static type = "ShrineGodRay";
  public type = ShrineGodRay.type;

  public object3D = new Object3D();

  // Focal point in UV space of the light mask texture.
  // (0.5, 0.5) = center. Adjust to match where the light source is in the mask PNG.
  // Y is WebGL UV (0=bottom, 1=top), so if the light source is near the top of the
  // image, use a value closer to 1.0.
  public focalPoint = new Vector2(0.5, 0.5);

  private geom: PlaneGeometry;
  private material: ShaderMaterial & {
    uniforms: {
      lightMask: IUniform<Texture>;
      point: IUniform<Vector2>;
      time: IUniform<number>;
    };
  };
  private mesh: Mesh;

  // Bright contributors drawn into compositeRT between the maskRT blit and silhouettes.
  // Entities register here to appear as light sources rather than occluders.
  private brightContributors: ((renderer: WebGLRenderer) => void)[] = [];

  public addBrightContributor(fn: (renderer: WebGLRenderer) => void): void {
    this.brightContributors.push(fn);
  }
  public removeBrightContributor(fn: (renderer: WebGLRenderer) => void): void {
    this.brightContributors = this.brightContributors.filter((c) => c !== fn);
  }

  // maskRT — accumulates the brightness of the light mask over time.
  // Initialized once with the static mask blit; animations draw into it
  // additively each frame so brightness builds up without clearing.
  public maskRT: WebGLRenderTarget;
  private maskInitialized = false;

  // compositeRT — rebuilt clean every frame: maskRT blit + entity silhouettes.
  // The shader samples from this RT. Keeping it separate from maskRT means
  // silhouettes are always drawn fresh and never accumulate.
  private compositeRT: WebGLRenderTarget;

  // Fullscreen NDC camera shared by all blit passes.
  private maskCamera: OrthographicCamera;

  // Scene that blits the darkness texture into maskRT (used once on first frame).
  private maskScene: Scene;
  private maskTexture: Texture;

  // Scene that blits the current maskRT into compositeRT each frame.
  private maskBlitScene: Scene;

  // Animation 1 — fade-to-white: each frame draws a small white increment into maskRT
  // (additive, no clear) so brightness accumulates over the animation duration.
  private fadeScene: Scene;
  private fadeMaterial: MeshBasicMaterial;
  private animating = false;
  private animationDuration = 0;
  private animationElapsed = 0;

  // Animation 2 — lights reveal into maskRT: draws shrine-lights at low opacity
  // each frame (accumulates in RT) so the lights gradually build up in the god ray.
  private lightsScene: Scene;
  private lightsMaterial: MeshBasicMaterial;
  private animating2 = false;
  private animationDuration2 = 0;
  private animationElapsed2 = 0;

  private lastDeltaMs = 0;

  // Silhouette pass — render entity shapes in black on top of compositeRT each frame.
  // Uses a world-space orthographic camera aligned to this entity's bounds.
  public silhouetteCamera: OrthographicCamera;
  private blackMaterial = new MeshBasicMaterial({ color: 0x000000 });
  // Cache of per-texture silhouette materials so we don't allocate every frame.
  private silhouetteMaterialCache = new Map<
    Texture | null,
    MeshBasicMaterial
  >();

  private getSilhouetteMaterial(orig: Material): MeshBasicMaterial {
    const map: Texture | null =
      (orig as MeshBasicMaterial).map ??
      (orig as ShaderMaterial).uniforms?.map?.value ??
      null;
    let mat = this.silhouetteMaterialCache.get(map);
    if (!mat) {
      mat = new MeshBasicMaterial({
        color: 0x000000,
        map,
        alphaTest: map ? 0.1 : 0,
        transparent: !!map
      });
      this.silhouetteMaterialCache.set(map, mat);
    }
    return mat;
  }

  // Scratch Color for save/restore.
  private savedClearColor = new Color();

  constructor(props: ShrineGodRayProps) {
    super(props);

    const width = props.size?.width ?? 15;
    const height = props.size?.height ?? 10;

    this.geom = new PlaneGeometry(width, height);

    // Use the darkness texture as the god ray mask source.
    // maskRT is cleared to light gray so transparent pixels become bright light,
    // while the dark opaque areas of the darkness texture occlude rays.
    this.maskTexture = getResource<Texture>(
      ShrineGodRay,
      "ShrineGodRayDarknessSource"
    );

    const rtParams = {
      magFilter: NearestFilter,
      minFilter: NearestFilter,
      depthBuffer: false
    };

    // --- maskRT: accumulates static mask + animation brightness ---
    this.maskRT = new WebGLRenderTarget(COMP_W, COMP_H, rtParams);

    // --- compositeRT: per-frame clean blit of maskRT + silhouettes ---
    this.compositeRT = new WebGLRenderTarget(COMP_W, COMP_H, rtParams);

    // --- Fullscreen NDC camera ---
    this.maskCamera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
    this.maskCamera.position.set(0, 0, 1);

    // --- Scene: blit darkness texture into maskRT (first frame only) ---
    this.maskScene = new Scene();
    this.maskScene.add(
      new Mesh(
        new PlaneGeometry(2, 2),
        new MeshBasicMaterial({ map: this.maskTexture })
      )
    );

    // --- Scene: blit maskRT into compositeRT (every frame) ---
    this.maskBlitScene = new Scene();
    this.maskBlitScene.add(
      new Mesh(
        new PlaneGeometry(2, 2),
        new MeshBasicMaterial({ map: this.maskRT.texture })
      )
    );

    // --- Silhouette camera: world-space orthographic aligned to this entity ---
    const hw = width * 0.5;
    const hh = height * 0.5;
    this.silhouetteCamera = new OrthographicCamera(-hw, hw, hh, -hh, 0.1, 128);

    // --- Shader material: samples compositeRT (maskRT brightness + silhouettes) ---
    this.material = new ShaderMaterial({
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: {
        lightMask: { value: this.compositeRT.texture },
        point: { value: this.focalPoint },
        time: { value: 0 }
      }
    }) as typeof this.material;

    // --- Animation 1: fade-to-white ---
    // AdditiveBlending: result = existing + srcAlpha * white, clamped to 1.
    this.fadeMaterial = new MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      blending: AdditiveBlending,
      depthWrite: false
    });
    this.fadeScene = new Scene();
    this.fadeScene.add(new Mesh(new PlaneGeometry(2, 2), this.fadeMaterial));

    // --- Animation 2: shrine-lights reveal ---
    // Draws the shrine-lights texture at low opacity each frame into maskRT
    // (additive, no clear) so the lights slowly accumulate over the duration.
    const lightsTexture = getResource<Texture>(
      ShrineGodRay,
      "ShrineGodRayLightsSource"
    );
    this.lightsMaterial = new MeshBasicMaterial({
      map: lightsTexture,
      transparent: true,
      opacity: 0,
      depthWrite: false
    });
    this.lightsScene = new Scene();
    this.lightsScene.add(
      new Mesh(new PlaneGeometry(2, 2), this.lightsMaterial)
    );

    this.mesh = new Mesh(this.geom, this.material);
    this.mesh.layers.set(RenderLayers.default);

    // Hook into Three.js render loop: composite before this mesh draws each frame.
    this.mesh.onBeforeRender = (renderer: WebGLRenderer) => {
      this.renderComposite(renderer);
    };

    this.object3D.add(this.mesh);
    this.object3D.position
      .copy(this.position)
      .multiplyScalar(kPixelScale)
      .round()
      .multiplyScalar(kInvPixelScale);
    // Render in front of background and game entities (atmospheric overlay).
    this.object3D.position.z = 4;

    // Place the silhouette camera at the entity's world-space center.
    const cx = this.object3D.position.x;
    const cy = this.object3D.position.y;
    this.silhouetteCamera.position.set(cx, cy, 64);
    this.silhouetteCamera.lookAt(cx, cy, 0);
    this.silhouetteCamera.updateProjectionMatrix();
  }

  private renderSilhouettes(renderer: WebGLRenderer) {
    type SwapEntry = { mesh: Mesh; prev: Material | Material[] };
    const swapped: SwapEntry[] = [];
    const toRestore: Object3D[] = [];

    if (this.level) {
      for (const entity of this.level.getEntities().values()) {
        if (!entity.object3D) continue;
        if (SILHOUETTE_EXCLUDE_TYPES.has(entity.type)) {
          if (entity.object3D.visible) {
            entity.object3D.visible = false;
            toRestore.push(entity.object3D);
          }
        } else {
          entity.object3D.traverse((child) => {
            if (child instanceof Mesh) {
              const orig = Array.isArray(child.material)
                ? child.material[0]
                : child.material;
              swapped.push({ mesh: child, prev: child.material });
              child.material = orig
                ? this.getSilhouetteMaterial(orig)
                : this.blackMaterial;
            }
          });
        }
      }
    }

    if (this.level) {
      renderer.render(this.level.scene, this.silhouetteCamera);
    }

    for (const { mesh, prev } of swapped) mesh.material = prev;
    for (const obj of toRestore) obj.visible = true;
  }

  private renderComposite(renderer: WebGLRenderer) {
    const prevRT = renderer.getRenderTarget();
    renderer.getClearColor(this.savedClearColor);
    const prevClearAlpha = renderer.getClearAlpha();
    const prevAutoClear = renderer.autoClear;

    renderer.autoClear = false;

    // --- Pass A: Update maskRT ---
    // Only touches maskRT on the first frame (initial blit) and during animations.
    // Between those events the RT persists unchanged.
    renderer.setRenderTarget(this.maskRT);
    if (!this.maskInitialized) {
      // First frame: clear to light gray so transparent pixels become bright light,
      // then blit the darkness texture on top.
      renderer.setClearColor(0xc0c0c0, 1);
      renderer.clear();
      renderer.render(this.maskScene, this.maskCamera);
      this.maskInitialized = true;
    } else {
      if (this.animating) {
        // Animation 1: draw a small white increment — no clear, brightness accumulates.
        this.fadeMaterial.opacity = this.lastDeltaMs / this.animationDuration;
        renderer.render(this.fadeScene, this.maskCamera);
      }
      if (this.animating2) {
        // Animation 2: draw shrine-lights at low opacity — no clear, lights accumulate.
        // Multiply by 3 so the lights are clearly visible well before the duration ends.
        this.lightsMaterial.opacity = Math.min(
          1,
          (this.lastDeltaMs / this.animationDuration2) * 3
        );
        renderer.render(this.lightsScene, this.maskCamera);
      }
    }

    // --- Pass B: Rebuild compositeRT every frame ---
    // Clear, blit the current maskRT, draw bright contributors, then entity silhouettes.
    // Bright contributors (e.g. ShrineBridge) appear as light sources rather than occluders.
    renderer.setRenderTarget(this.compositeRT);
    renderer.setClearColor(0x000000, 1);
    renderer.clear();
    renderer.render(this.maskBlitScene, this.maskCamera);
    for (const contributor of this.brightContributors) {
      contributor(renderer);
    }
    this.renderSilhouettes(renderer);

    // --- Restore renderer state ---
    renderer.autoClear = prevAutoClear;
    renderer.setRenderTarget(prevRT);
    renderer.setClearColor(this.savedClearColor, prevClearAlpha);
  }

  startAnimation(durationMs: number) {
    this.animationDuration = durationMs;
    this.animationElapsed = 0;
    this.animating = true;
  }

  startAnimation2(durationMs: number) {
    this.animationDuration2 = durationMs;
    this.animationElapsed2 = 0;
    this.animating2 = true;
  }

  destroy(): void {
    super.destroy();

    this.mesh.onBeforeRender = () => {};

    this.geom.dispose();
    this.material.dispose();

    this.maskRT.dispose();
    this.compositeRT.dispose();

    this.blackMaterial.dispose();

    for (const mat of this.silhouetteMaterialCache.values()) {
      mat.dispose();
    }
    this.silhouetteMaterialCache.clear();

    // Dispose the per-instance geometry and materials of the blit scenes.
    // Disposing a material does not free its .map, so maskTexture /
    // lightsTexture (shared resource-loader textures) are left intact.
    for (const scene of [
      this.maskScene,
      this.maskBlitScene,
      this.fadeScene,
      this.lightsScene
    ]) {
      scene.traverse((child) => {
        if (child instanceof Mesh) {
          child.geometry.dispose();
          const mat = child.material;
          if (Array.isArray(mat)) {
            for (const m of mat) m.dispose();
          } else {
            mat.dispose();
          }
        }
      });
    }
  }

  step(ms: number) {
    super.step(ms);
    this.lastDeltaMs = ms;
    this.material.uniforms.point.value = this.focalPoint;
    this.material.uniforms.time.value += ms;
    if (this.animating) {
      this.animationElapsed += ms;
      if (this.animationElapsed >= this.animationDuration) {
        this.animationElapsed = this.animationDuration;
        this.animating = false;
      }
    }
    if (this.animating2) {
      this.animationElapsed2 += ms;
      if (this.animationElapsed2 >= this.animationDuration2) {
        this.animationElapsed2 = this.animationDuration2;
        this.animating2 = false;
      }
    }
  }
}
