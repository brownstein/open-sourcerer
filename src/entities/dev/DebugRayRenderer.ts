import {
  BufferAttribute,
  BufferGeometry,
  LineBasicMaterial,
  LineSegments,
  Object3D
} from "three";

import {
  BaseEntityType,
  EntityBehavior,
  EntityLifecycleEvents,
  EntityProps,
  LevelAPI
} from "src/api/entity";
import { RenderLayers } from "src/engine/constants/renderLayers";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import { isDevMode } from "src/util/devUtil";

import { DebugRay, addDebugRay, consumeDebugRays } from "./DebugRayBatcher";

export class DebugRayRenderer extends CoreEntity {
  static type = "DebugRayRenderer";
  public type = "DebugRayRenderer";
  public object3D = new Object3D();
  public behaviors = {
    debugRayRender: new DebugRayRenderBehavior()
  };
  constructor(props: EntityProps) {
    super(props);
    if (isDevMode()) this.behaviors.debugRayRender.init(this);
  }
}

export class DebugRayRenderBehavior implements EntityBehavior {
  public type = "DebugRayRenderBehavior";
  private entity?: BaseEntityType;
  private level?: LevelAPI;
  private geom?: BufferGeometry;
  private lineSegments?: LineSegments;
  private material: LineBasicMaterial;
  constructor() {
    this.step = this.step.bind(this);
    this.material = new LineBasicMaterial({ vertexColors: true, linewidth: 2 });
  }
  init(entity: BaseEntityType) {
    this.entity = entity;
    this.entity.events.on(EntityLifecycleEvents.Step, this.step);
    return this;
  }
  attachToLevel(level: LevelAPI) {
    this.level = level;
    this.updateDebugMesh();
  }
  destroy() {
    this.geom?.dispose();
    this.material?.dispose();
    if (this.lineSegments) {
      this.lineSegments.geometry.dispose();
      this.lineSegments.parent?.remove(this.lineSegments);
    }
    this.lineSegments = undefined;
  }
  step() {
    this.updateDebugMesh();
  }
  updateDebugMesh() {
    if (!isDevMode()) return;
    const rays = consumeDebugRays();
    if (!rays.length) {
      if (this.lineSegments && this.lineSegments.parent) {
        this.lineSegments.parent.remove(this.lineSegments);
        this.lineSegments.geometry.dispose();
        this.lineSegments = undefined;
      }
      return;
    }

    const positions: number[] = [];
    const colors: number[] = [];
    for (const ray of rays) {
      const z = 16; // or whatever layer you want
      positions.push(ray.origin.x, ray.origin.y, z);
      positions.push(
        ray.origin.x + ray.direction.x * ray.length,
        ray.origin.y + ray.direction.y * ray.length,
        z
      );
      const color = ray.color ?? 0xff2222;
      const r = ((color >> 16) & 0xff) / 255;
      const g = ((color >> 8) & 0xff) / 255;
      const b = (color & 0xff) / 255;
      colors.push(r, g, b, r, g, b);
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute(
      "position",
      new BufferAttribute(new Float32Array(positions), 3)
    );
    geometry.setAttribute(
      "color",
      new BufferAttribute(new Float32Array(colors), 3)
    );

    if (this.lineSegments) {
      this.lineSegments.geometry.dispose();
      this.lineSegments.geometry = geometry;
    } else {
      this.lineSegments = new LineSegments(geometry, this.material);
      this.lineSegments.position.z = 16;
      this.lineSegments.layers.set(RenderLayers.text);
      this.entity?.object3D?.add(this.lineSegments);
    }
  }
}
