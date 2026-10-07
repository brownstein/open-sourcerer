import {
  BufferGeometry,
  ClampToEdgeWrapping,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PlaneGeometry,
  Vector2
} from "three";

import {
  EntityBehavior,
  EntityLevelEvents,
  EntityLifecycleEvents,
  EntityProps,
  LevelAPI
} from "src/api/entity";
import { kInvPixelScale, kPixelScale } from "src/engine/constants/scaling";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import { MapImageLayer } from "src/engine/level/tiled/api";
import { IndexedGrid } from "src/util/IndexedGrid";

export class ParallaxImageRenderBehavior implements EntityBehavior {
  public type = "ParallaxImageRenderBehavior";
  public entity?: ParallaxImage;
  public object3D = new Object3D();
  private level?: LevelAPI;
  private size = new Vector2(1, 1);
  private baseOffset = new Vector2(0, 0);
  private offset = new Vector2(0, 0);
  private parallax = new Vector2();
  private repeatX = false;
  private repeatY = false;
  private extendX = false;
  private extendY = false;
  private geom?: PlaneGeometry;
  private extraGeom: BufferGeometry[] = [];
  private material?: MeshBasicMaterial;
  private meshesByOffsetRepeat = new IndexedGrid<Mesh>();
  constructor() {
    this.postStep = this.postStep.bind(this);
  }
  initWithParallaxImage(entity: ParallaxImage) {
    this.entity = entity;
    this.entity.events.on(EntityLifecycleEvents.PostStep, this.postStep);
    this.entity.object3D.add(this.object3D);
    this.size =
      this.entity.layerDef.size?.clone().multiplyScalar(kInvPixelScale) ??
      this.size;
    this.baseOffset = this.entity.layerDef.offset
      .clone()
      .multiplyScalar(kInvPixelScale);
    this.baseOffset.y *= -1;
    this.parallax = this.entity.layerDef.parallax.clone();
    this.repeatX = !!this.entity.layerDef.repeatX;
    this.repeatY = !!this.entity.layerDef.repeatY;
    this.extendX = !!this.entity.layerDef.extendX;
    this.extendY = !!this.entity.layerDef.extendY;
    this.geom = new PlaneGeometry(this.size.x, this.size.y);

    if (this.entity.layerDef.texture && (this.extendX || this.extendY)) {
      this.entity.layerDef.texture.wrapS = ClampToEdgeWrapping;
      this.entity.layerDef.texture.wrapT = ClampToEdgeWrapping;
    }

    this.material = new MeshBasicMaterial({
      map: this.entity.layerDef.texture,
      transparent: true,
      alphaTest: 0.1
    });

    if (!this.repeatX && !this.repeatY && !this.extendX && !this.extendY) {
      const baseMesh = new Mesh(this.geom, this.material);
      baseMesh.position.x = this.size.x * 0.5;
      baseMesh.position.y = -this.size.y * 0.5;
      this.object3D.add(baseMesh);
      this.meshesByOffsetRepeat.set(0, 0, baseMesh);
    }

    this.object3D.position.x = this.baseOffset.x;
    this.object3D.position.y = this.baseOffset.y;
    this.handleOffset();
    this.handleRepeat();
  }
  destroy() {
    this.geom?.dispose();
    for (const geom of this.extraGeom) geom.dispose();
    this.material?.dispose();
  }
  attachToLevel(level: LevelAPI) {
    this.level = level;
    this.level.on(EntityLevelEvents.TransitionStep, this.postStep);
  }
  detachFromLevel(level: LevelAPI) {
    level.off(EntityLevelEvents.TransitionStep, this.postStep);
    this.level = undefined;
  }
  postStep() {
    this.handleOffset();
    this.handleRepeat();
  }
  handleOffset() {
    const { level, geom, material } = this;
    if (!level || !geom || !material) return;
    const { center, size } = level.cameraDirector.getCurrentProperties();

    const cameraCenter = center;
    const camSize = size;
    if (!cameraCenter || !camSize) return;

    // Manage offset.
    const offset = this.parallax
      .clone()
      .multiply(cameraCenter)
      .add(this.baseOffset ?? new Vector2());
    this.offset = offset;
    this.object3D.position.x = offset.x;
    this.object3D.position.y = offset.y;
    this.object3D.position.x =
      kInvPixelScale * Math.round(kPixelScale * this.object3D.position.x);
    this.object3D.position.y =
      kInvPixelScale * Math.round(kPixelScale * this.object3D.position.y);
  }
  handleRepeat() {
    const { level, geom, material } = this;
    if (!level || !geom || !material) return;

    const { center, size } = level.cameraDirector.getCurrentProperties();

    const cameraCenter = center;
    const camSize = size;
    if (!cameraCenter || !camSize) return;

    // Abort if not repeating.
    if (!this.repeatX && !this.repeatY && !this.extendX && !this.extendY)
      return;

    // Manage repeat.
    let repeatBoundMinX = 0;
    let repeatBoundMaxX = 1;
    let repeatBoundMinY = 0;
    let repeatBoundMaxY = 1;

    if (this.repeatX || this.extendX) {
      const camMinX = cameraCenter.x - camSize.x * 0.5 - this.offset.x;
      const camMaxX = cameraCenter.x + camSize.x * 0.5 - this.offset.x;
      repeatBoundMinX = Math.floor(camMinX / this.size.x);
      repeatBoundMaxX = Math.ceil(camMaxX / this.size.x);
    }
    if (this.repeatY || this.extendY) {
      const camMinY = cameraCenter.y - camSize.y * 0.5 - this.offset.y;
      const camMaxY = cameraCenter.y + camSize.y * 0.5 - this.offset.y;
      repeatBoundMinY = Math.floor(camMinY / this.size.y) + 1;
      repeatBoundMaxY = Math.ceil(camMaxY / this.size.y) + 1;
    }
    for (let rx = repeatBoundMinX; rx < repeatBoundMaxX; rx++) {
      for (let ry = repeatBoundMinY; ry < repeatBoundMaxY; ry++) {
        if (this.meshesByOffsetRepeat.has(rx, ry)) continue;
        let useGeom = geom as BufferGeometry;
        if (this.extendX || this.extendY) {
          useGeom = geom.clone();
          const uvAttr = useGeom.getAttribute("uv").clone();
          uvAttr.needsUpdate = true;
          const uvArr = uvAttr.array as Float32Array;
          if (this.extendX) {
            if (rx < 0) {
              uvArr[2] = 0;
              uvArr[6] = 0;
            }
            if (rx > 0) {
              uvArr[0] = 1;
              uvArr[4] = 1;
            }
          }
          if (this.extendY) {
            if (ry < 0) {
              uvArr[1] = 0;
              uvArr[3] = 0;
            }
            if (ry > 0) {
              uvArr[5] = 1;
              uvArr[7] = 1;
            }
          }
          useGeom.setAttribute("uv", uvAttr);
          this.extraGeom.push(useGeom);
        }
        const mesh = new Mesh(useGeom, material);
        mesh.position.x = this.size.x * rx + this.size.x * 0.5;
        mesh.position.y = this.size.y * ry - this.size.y * 0.5;
        this.object3D.add(mesh);
        this.meshesByOffsetRepeat.set(rx, ry, mesh);
      }
    }
  }

  setOpacity(opacity: number) {
    if (!this.material) return;
    this.material.opacity = opacity;
  }
}

export type ParallaxImageProps = EntityProps & {
  layer: MapImageLayer;
};

export class ParallaxImage extends CoreEntity {
  static readonly type = "ParallaxImage";
  public readonly type = ParallaxImage.type;

  public object3D = new Object3D();
  public layerDef: MapImageLayer;
  public behaviors = {
    render: new ParallaxImageRenderBehavior()
  };
  constructor(props: ParallaxImageProps) {
    super(props);
    this.layerDef = props.layer;
    this.object3D.position.copy(this.position);
    this.behaviors.render.initWithParallaxImage(this);
  }
}
