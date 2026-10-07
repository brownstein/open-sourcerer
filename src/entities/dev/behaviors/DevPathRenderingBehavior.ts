import {
  BufferAttribute,
  BufferGeometry,
  Color,
  Line,
  LineBasicMaterial,
  Object3D
} from "three";

import {
  BaseEntityType,
  EntityBehavior,
  EntityLifecycleEvents
} from "src/api/entity";
import { NavAction } from "src/api/navigation";
import { RenderLayers } from "src/engine/constants/renderLayers";
import { kWorldGravity } from "src/engine/level/Level";
import { NavPathFollowingBehavior } from "src/entities/shared/behaviors/NavPathFollowingBehavior";

export class DevPathRenderingBehavior implements EntityBehavior {
  public type = "DevPathRendering";
  public object3D = new Object3D();
  private entity?: BaseEntityType;
  private pathFollowing?: NavPathFollowingBehavior;
  private lineGeom?: BufferGeometry;
  private lineMaterial = new LineBasicMaterial({
    color: new Color(0xffffff),
    vertexColors: true
  });
  constructor() {
    this.postStep = this.postStep.bind(this);
    this.object3D.position.z = 16;
  }
  init(entity: BaseEntityType) {
    this.entity = entity;
    this.entity.object3D?.add(this.object3D);
    this.entity.events.on(EntityLifecycleEvents.PostStep, this.postStep);
    return this;
  }
  attachPathFollowing(pathFollowing: NavPathFollowingBehavior) {
    this.pathFollowing = pathFollowing;
  }
  postStep() {
    this.updatePath();
  }
  updatePath() {
    this.lineGeom?.dispose();
    if (!this.entity || !this.pathFollowing) return;
    for (const child of this.object3D.children) {
      this.object3D.remove(child);
    }
    const { pathPlan, pathPlanStep, pathPlanJumpTime } = this.pathFollowing;
    if (!pathPlan) return;
    const rawPos: number[] = [];
    const rawColor: number[] = [];
    rawPos.push(0, 0, 0);
    rawColor.push(0, 1, 0);
    for (let si = pathPlanStep; si < pathPlan.steps.length; si++) {
      const planStep = pathPlan.steps[si];
      const planStepCurrent = si === pathPlanStep;
      if (planStep.action === NavAction.Jump) {
        const jump = planStep.jump;
        let x = jump.initialX;
        let y = jump.initialY;
        let dx = jump.initialVelocityX;
        let dy = jump.initialVelocityY;
        const dt = 0.05;
        for (let t = 0; t < jump.airTime; t += dt) {
          x += dx * dt + 0.5 * jump.accelerationX * dt * dt;
          y += dy * dt + 0.5 * kWorldGravity.y * dt * dt;
          dx += jump.accelerationX * dt;
          dy += kWorldGravity.y * dt;
          if (!planStepCurrent || t >= pathPlanJumpTime * 0.001) {
            rawPos.push(
              x - this.entity.position.x,
              y - this.entity.position.y,
              0
            );
            rawColor.push(1, 0, 0);
          }
        }
      }
      rawPos.push(
        planStep.x - this.entity.position.x,
        planStep.y - this.entity.position.y,
        0
      );
      rawColor.push(1, 0, 0);
    }

    const geom = new BufferGeometry();
    const posArr = new Float32Array(rawPos);
    const colorArr = new Float32Array(rawColor);
    geom.setAttribute("position", new BufferAttribute(posArr, 3));
    geom.setAttribute("color", new BufferAttribute(colorArr, 3));
    this.lineGeom = geom;

    const line = new Line(geom, this.lineMaterial);
    line.layers.set(RenderLayers.text);
    this.object3D.add(line);
  }
  destroy() {
    this.lineGeom?.dispose();
    this.lineMaterial.dispose();
  }
}
