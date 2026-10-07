import { CircleGeometry, Mesh, MeshBasicMaterial, Object3D } from "three";

import { ControlEvents, ControlsAPI } from "src/api/controls";
import {
  BaseEntityType,
  EntityBehavior,
  EntityLevelEvents,
  EntityLifecycleEvents,
  EntityProps,
  LevelAPI
} from "src/api/entity";
import { kInvPixelScale } from "src/engine/constants/scaling";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import { vector2To3 } from "src/engine/util/vecTypes";

export class ControlDebugger extends CoreEntity {
  static type = "ControlDebugger";
  public type = "ControlDebugger";
  public object3D = new Object3D();
  public behaviors = {
    render: new ControlDebugRenderBehavior()
  };
  constructor(props: EntityProps) {
    super(props);
    this.behaviors.render.init(this);
  }
}

export class ControlDebugRenderBehavior implements EntityBehavior {
  public type = "ControlDebugRenderBehavior";
  private entity?: BaseEntityType;
  private level?: LevelAPI;
  private controls?: ControlsAPI<BaseEntityType>;
  private geom: CircleGeometry;
  private material: MeshBasicMaterial;
  private mesh: Mesh;
  constructor() {
    this.geom = new CircleGeometry(kInvPixelScale * 4);
    this.material = new MeshBasicMaterial({
      transparent: true,
      opacity: 1
    });
    this.mesh = new Mesh(this.geom, this.material);
    this.step = this.step.bind(this);
    this.attachControls = this.attachControls.bind(this);
  }
  init(entity: BaseEntityType) {
    this.entity = entity;
    this.entity.events.on(EntityLifecycleEvents.Step, this.step);
    this.entity.object3D?.add(this.mesh);
  }
  attachToLevel(level: LevelAPI) {
    this.level = level;
    this.level.on(EntityLevelEvents.AttachControls, this.attachControls);
    if (this.level.controls) this.attachControls(this.level.controls);
  }
  detachFromLevel(level: LevelAPI) {
    level.off(EntityLevelEvents.AttachControls, this.attachControls);
    this.controls?.events.off(ControlEvents.Click, this.onClick);
    this.level = undefined;
  }
  attachControls(controls: ControlsAPI<BaseEntityType>) {
    this.controls = controls;
    this.controls.events.on(ControlEvents.Click, this.onClick);
  }
  readonly onClick = (): void => {
    this.material.opacity = 1;
    this.mesh.scale.set(2, 2, 1);
  };
  step(ms: number) {
    if (this.controls?.cursorActive) {
      this.material.color.set(0xffffff);
    } else {
      this.material.color.set(0xff0000);
    }
    if (this.controls?.cursorScenePosition) {
      const pos3 = vector2To3(this.controls.cursorScenePosition);
      if (!pos3.equals(this.mesh.position)) {
        this.mesh.position.copy(pos3);
        this.material.opacity = 1;
      }
    }
    if (this.material.opacity > 0)
      this.material.opacity = Math.max(0, this.material.opacity - 0.01 * ms);
    if (this.mesh.scale.x > 1) {
      this.mesh.scale.x = Math.max(1, this.mesh.scale.x - 0.05 * ms);
      this.mesh.scale.y = Math.max(1, this.mesh.scale.y - 0.05 * ms);
    }
  }
  destroy() {
    this.controls?.events.off(ControlEvents.Click, this.onClick);
    this.geom.dispose();
    this.material.dispose();
  }
}
