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
import { addDevOverlayFlag } from "src/engine/entity/decorators";
import { extractOptsFromCurrentURL } from "src/util/devUtil";

@addDevOverlayFlag()
export class PhysicsDebugger extends CoreEntity {
  static type = "PhysicsDebugger";
  public type = "PhysicsDebugger";
  public object3D = new Object3D();
  public behaviors = {
    physicsDebugRender: new PhysicsDebugRenderBehavior()
  };
  constructor(props: EntityProps) {
    super(props);
    if (extractOptsFromCurrentURL()?.showDevOverlay)
      this.behaviors.physicsDebugRender.init(this);
  }
}

export class PhysicsDebugRenderBehavior implements EntityBehavior {
  public type = "PhysicsDebugRenderBehavior";
  private entity?: BaseEntityType;
  private level?: LevelAPI;
  private geom?: BufferGeometry;
  private lineSegments?: LineSegments;
  private material?: LineBasicMaterial;
  private posArr?: Float32Array;
  private colorArr?: Float32Array;
  constructor() {
    this.step = this.step.bind(this);
    this.material = new LineBasicMaterial({
      vertexColors: true
    });
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
  }
  step() {
    this.updateDebugMesh();
  }
  updateDebugMesh() {
    const { level } = this;
    if (!level) return;

    const { vertices, colors } = level.world.debugRender();
    const lineCount = vertices.length / 4;

    const geom = this.geom ?? new BufferGeometry();
    let posArr: Float32Array | undefined;
    let colorArr: Float32Array | undefined;
    if (this.posArr && this.posArr.length >= lineCount * 6) {
      posArr = this.posArr;
      geom.getAttribute("position").needsUpdate = true;
    } else {
      posArr = new Float32Array(lineCount * 6);
      geom.setAttribute("position", new BufferAttribute(posArr, 3));
    }
    if (this.colorArr && this.colorArr.length >= lineCount * 6) {
      colorArr = this.colorArr;
      geom.getAttribute("color").needsUpdate = true;
    } else {
      colorArr = new Float32Array(lineCount * 6);
      geom.setAttribute("color", new BufferAttribute(colorArr, 3));
    }

    for (let li = 0; li < lineCount; li++) {
      posArr[li * 6 + 0] = vertices[li * 4 + 0];
      posArr[li * 6 + 1] = vertices[li * 4 + 1];
      posArr[li * 6 + 3] = vertices[li * 4 + 2];
      posArr[li * 6 + 4] = vertices[li * 4 + 3];
      colorArr[li * 6 + 0] = colors[li * 4 + 0];
      colorArr[li * 6 + 1] = colors[li * 4 + 1];
      colorArr[li * 6 + 2] = colors[li * 4 + 2];
      colorArr[li * 6 + 3] = colors[li * 4 + 0];
      colorArr[li * 6 + 4] = colors[li * 4 + 1];
      colorArr[li * 6 + 5] = colors[li * 4 + 2];
    }

    geom.setDrawRange(0, lineCount * 2);

    this.geom = geom;
    this.posArr = posArr;
    this.colorArr = colorArr;

    if (!this.lineSegments) {
      this.lineSegments = new LineSegments(geom, this.material);
      this.lineSegments.position.z = 16;
      this.lineSegments.layers.set(RenderLayers.text);
      this.entity?.object3D?.add(this.lineSegments);
    }
  }
}
