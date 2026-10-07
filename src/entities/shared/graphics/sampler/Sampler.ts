import {
  Box3,
  LinearSRGBColorSpace,
  NearestFilter,
  Object3D,
  OrthographicCamera,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderTarget,
  WebGLRenderer
} from "three";

import { kInvPixelScale, kPixelScale } from "src/engine/constants/scaling";

export type SamplerBounds = {
  textureSize: Vector2;
  textureOffset: Vector2;
  textureScale: Vector2;
  sceneSize: Vector3;
  // tight content bounds in scene units, before padding is added
  contentSize: Vector3;
  sceneCenter: Vector3;
};

export class Sampler {
  private scene: Scene = new Scene();
  private camera = new OrthographicCamera(-1, 1, -1, 1, -64, 64);
  private maxTextureDimension = 512;
  private paddingPx = 1;

  private renderTarget?: WebGLRenderTarget;
  private samplerBounds?: SamplerBounds;
  private samplingRenderer?: WebGLRenderer;
  private dirty = false;

  add(object3D: Object3D) {
    this.scene.add(object3D);
    this.dirty = true;
  }

  clear() {
    this.scene.clear();
    this.dirty = true;
  }

  sample(renderer: WebGLRenderer): WebGLRenderTarget {
    if (this.samplingRenderer !== renderer) this.dirty = true;
    this.samplingRenderer = renderer;
    if (!this.renderTarget || !this.samplerBounds || this.dirty) {
      this.samplerBounds = this.getSamplerBounds();
      this.camera.left = -this.samplerBounds.sceneSize.x * 0.5;
      this.camera.right = this.samplerBounds.sceneSize.x * 0.5;
      this.camera.top = this.samplerBounds.sceneSize.y * 0.5;
      this.camera.bottom = -this.samplerBounds.sceneSize.y * 0.5;
      this.camera.near = 0;
      this.camera.far = this.samplerBounds.sceneSize.z + 1;
      this.camera.updateProjectionMatrix();
      this.camera.position.copy(this.samplerBounds.sceneCenter);
      this.camera.position.z += this.samplerBounds.sceneSize.z * 0.5 + 0.5;
      this.camera.up = new Vector3(0, 1, 0);
      this.camera.lookAt(this.samplerBounds.sceneCenter);
      if (!this.renderTarget) {
        this.renderTarget = new WebGLRenderTarget(
          this.samplerBounds.textureSize.x,
          this.samplerBounds.textureSize.y,
          {
            minFilter: NearestFilter,
            magFilter: NearestFilter,
            colorSpace: LinearSRGBColorSpace
          }
        );
      } else {
        this.renderTarget.setSize(
          this.samplerBounds.textureSize.x,
          this.samplerBounds.textureSize.y
        );
      }
    }
    const currentRenderTarget = renderer.getRenderTarget();
    const currentClearAlpha = renderer.getClearAlpha();
    renderer.setRenderTarget(this.renderTarget);
    renderer.setClearAlpha(0);
    renderer.render(this.scene, this.camera);
    renderer.setRenderTarget(currentRenderTarget);
    renderer.setClearAlpha(currentClearAlpha);
    this.dirty = false;
    return this.renderTarget;
  }

  destroy() {
    this.renderTarget?.dispose();
  }

  setPadding(paddingPx: number) {
    this.paddingPx = paddingPx;
    this.dirty = true;
  }

  getSamplerBounds() {
    if (this.samplerBounds && !this.dirty) return this.samplerBounds;
    const sceneBounds = new Box3();
    sceneBounds.expandByObject(this.scene);
    const sceneCenter = new Vector3();
    const sceneSizePixels = new Vector3();
    sceneBounds.getCenter(sceneCenter);
    sceneBounds.getSize(sceneSizePixels);
    const contentSize = sceneSizePixels.clone();
    sceneSizePixels.multiplyScalar(kPixelScale);
    sceneSizePixels.x = Math.ceil(sceneSizePixels.x + this.paddingPx * 2);
    sceneSizePixels.y = Math.ceil(sceneSizePixels.y + this.paddingPx * 2);
    const textureSize = new Vector2(
      Math.min(this.maxTextureDimension, sceneSizePixels.x),
      Math.min(this.maxTextureDimension, sceneSizePixels.y)
    );
    const textureScale = new Vector2(
      textureSize.x / sceneSizePixels.x,
      textureSize.y / sceneSizePixels.y
    );
    const textureOffset = new Vector2();
    const sceneSize = sceneSizePixels.clone().multiplyScalar(kInvPixelScale);
    const samplerBounds: SamplerBounds = {
      textureSize,
      textureOffset,
      textureScale,
      sceneSize,
      contentSize,
      sceneCenter
    };
    this.samplerBounds = samplerBounds;
    return samplerBounds;
  }
}
