import { ProtoSpriteThree } from "protosprite-three";
import {
  ClampToEdgeWrapping,
  Color,
  Mesh,
  MeshBasicMaterial,
  NearestFilter,
  Object3D,
  OrthographicCamera,
  PlaneGeometry,
  RepeatWrapping,
  Scene,
  WebGLRenderTarget
} from "three";

import {
  BaseEntityType,
  EntityBehavior,
  EntityLifecycleEvents
} from "src/api/entity";
import { kPixelScale } from "src/engine/constants/scaling";

export class TileableSpriteBehavior implements EntityBehavior {
  public readonly type = "TileableSprite";

  private entity?: BaseEntityType;
  private sprite?: ProtoSpriteThree;

  private readonly captureScene = new Scene();
  private readonly captureCamera = new OrthographicCamera();
  private readonly renderTarget = new WebGLRenderTarget(1, 1, {
    depthBuffer: false
  });
  private readonly geometry = new PlaneGeometry(1, 1);
  private readonly material = new MeshBasicMaterial({ transparent: true });
  private readonly mesh = new Mesh(this.geometry, this.material);

  private repeatX = true;
  private repeatY = true;
  private alignX: "left" | "center" | "right" = "center";
  private alignY: "top" | "center" | "bottom" = "center";
  private initWidth = 0;
  private initHeight = 0;
  private width = 0;
  private height = 0;

  private lastWidth = 0;
  private lastHeight = 0;
  private lastRTWidth = 0;
  private lastRTHeight = 0;

  constructor() {
    this.renderTarget.texture.magFilter = NearestFilter;
    this.renderTarget.texture.minFilter = NearestFilter;
    this.renderTarget.texture.wrapS = RepeatWrapping;
    this.renderTarget.texture.wrapT = RepeatWrapping;
    this.material.map = this.renderTarget.texture;

    this.captureCamera.near = 0.1;
    this.captureCamera.far = 10;
    this.captureCamera.position.set(0, 0, 5);

    this.mesh.onBeforeRender = (renderer) => {
      if (!this.sprite || !this.entity) return;

      this._updateTilingMeshGeometry();
      this._updateCapture();

      const previousRT = renderer.getRenderTarget();
      const previousClearColor = renderer.getClearColor(new Color());
      const previousClearAlpha = renderer.getClearAlpha();

      renderer.setClearColor(0x000000, 0);
      renderer.setRenderTarget(this.renderTarget);
      renderer.clear();
      renderer.render(this.captureScene, this.captureCamera);
      renderer.setRenderTarget(previousRT);
      renderer.setClearColor(previousClearColor, previousClearAlpha);
    };
  }

  init(entity: BaseEntityType) {
    this.entity = entity;
    this.initWidth = entity.size.width;
    this.initHeight = entity.size.height;
    this.width = entity.size.width;
    this.height = entity.size.height;

    this.entity.events.on(EntityLifecycleEvents.Destroy, () => this.destroy());

    return this;
  }

  attachSprite(sprite: ProtoSpriteThree, parent?: Object3D) {
    this.sprite = sprite;

    // Remove the sprite mesh from the entity's object3D if it's there.
    if (sprite.mesh.parent) {
      sprite.mesh.parent.remove(sprite.mesh);
    }

    this.captureScene.add(sprite.mesh);
    (parent ?? this.entity?.object3D)?.add(this.mesh);

    return this;
  }

  setRepeatX(enabled: boolean) {
    this.repeatX = enabled;
    this._updateWrapping();
    return this;
  }

  setRepeatY(enabled: boolean) {
    this.repeatY = enabled;
    this._updateWrapping();
    return this;
  }

  setSize(width: number, height: number) {
    this.width = width;
    this.height = height;
    this._updateTilingMeshGeometry();
    return this;
  }

  alignLeft() {
    this.alignX = "left";
    this._updateTilingMeshPosition();
    return this;
  }

  alignRight() {
    this.alignX = "right";
    this._updateTilingMeshPosition();
    return this;
  }

  alignTop() {
    this.alignY = "top";
    this._updateTilingMeshPosition();
    return this;
  }

  alignBottom() {
    this.alignY = "bottom";
    this._updateTilingMeshPosition();
    return this;
  }

  destroy() {
    this.renderTarget.dispose();
    this.material.dispose();
    this.geometry.dispose();
  }

  private _updateWrapping() {
    const texture = this.renderTarget.texture;
    texture.wrapS = this.repeatX ? RepeatWrapping : ClampToEdgeWrapping;
    texture.wrapT = this.repeatY ? RepeatWrapping : ClampToEdgeWrapping;
    texture.needsUpdate = true;
  }

  private _updateTilingMeshGeometry() {
    if (this.width === this.lastWidth && this.height === this.lastHeight) {
      return;
    }

    this.lastWidth = this.width;
    this.lastHeight = this.height;

    this.mesh.scale.set(this.width * kPixelScale, this.height * kPixelScale, 1);

    this._updateRepeatCount();
    this._updateTilingMeshPosition();
  }

  private _updateTilingMeshPosition() {
    const halfCurrentWidth = this.width * kPixelScale * 0.5;
    const halfCurrentHeight = this.height * kPixelScale * 0.5;
    const halfInitWidth = this.initWidth * kPixelScale * 0.5;
    const halfInitHeight = this.initHeight * kPixelScale * 0.5;

    // Offset so that the aligned edge of the mesh stays pinned to the
    // corresponding edge of the original Tiled rectangle.
    let offsetX = 0;
    if (this.alignX === "left") offsetX = halfCurrentWidth - halfInitWidth;
    else if (this.alignX === "right")
      offsetX = halfInitWidth - halfCurrentWidth;

    let offsetY = 0;
    if (this.alignY === "bottom") offsetY = halfCurrentHeight - halfInitHeight;
    else if (this.alignY === "top")
      offsetY = halfInitHeight - halfCurrentHeight;

    this.mesh.position.set(offsetX, offsetY, 0);
  }

  private _updateCapture() {
    if (!this.sprite) return;

    const box = this.sprite.mesh.geometry.boundingBox;
    if (!box) return;

    // Apply the mesh's scale so the camera frames where content actually
    // renders (e.g. scale.y = -1 flips the vertical range).
    const scaleX = this.sprite.mesh.scale.x;
    const scaleY = this.sprite.mesh.scale.y;
    const x0 = box.min.x * scaleX;
    const x1 = box.max.x * scaleX;
    const y0 = box.min.y * scaleY;
    const y1 = box.max.y * scaleY;

    const left = Math.floor(Math.min(x0, x1));
    const bottom = Math.floor(Math.min(y0, y1));
    const right = Math.ceil(Math.max(x0, x1));
    const top = Math.ceil(Math.max(y0, y1));
    const rtWidth = Math.max(right - left, 1);
    const rtHeight = Math.max(top - bottom, 1);

    if (rtWidth !== this.lastRTWidth || rtHeight !== this.lastRTHeight) {
      this.lastRTWidth = rtWidth;
      this.lastRTHeight = rtHeight;

      this.renderTarget.setSize(rtWidth, rtHeight);

      this.captureCamera.left = left;
      this.captureCamera.right = right;
      this.captureCamera.top = top;
      this.captureCamera.bottom = bottom;
      this.captureCamera.updateProjectionMatrix();

      this._updateRepeatCount();
    }
  }

  private _updateRepeatCount() {
    if (this.lastRTWidth === 0 || this.lastRTHeight === 0) {
      return;
    }

    const texture = this.renderTarget.texture;
    const pixelWidth = this.width * kPixelScale;
    const pixelHeight = this.height * kPixelScale;
    texture.repeat.set(
      this.repeatX ? pixelWidth / this.lastRTWidth : 1,
      this.repeatY ? pixelHeight / this.lastRTHeight : 1
    );
  }
}
