import { BoxGeometry, Mesh, MeshBasicMaterial } from "three";

import {
  BaseEntityType,
  EntityBehavior,
  EntityLifecycleEvents
} from "src/api/entity";

export class DevRenderBehavior implements EntityBehavior {
  public type = "DevRender";
  private geom?: BoxGeometry;
  private material = new MeshBasicMaterial({
    color: 0xffffff
  });
  private mesh?: Mesh;
  constructor() {
    this.step = this.step.bind(this);
  }
  init(entity: BaseEntityType) {
    const size = entity.size;
    this.geom = new BoxGeometry(size.width, size.height, 0.1);
    this.mesh = new Mesh(this.geom, this.material);
    entity.object3D?.add(this.mesh);
    entity.events.on(EntityLifecycleEvents.Step, this.step);
    return this;
  }
  step(_ms: number) {}
  destroy() {
    this.geom?.dispose();
    this.material.dispose();
  }
}
