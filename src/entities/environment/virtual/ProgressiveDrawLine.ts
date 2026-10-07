import getNormals from "polyline-normals";
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  Mesh,
  Object3D,
  ShaderMaterial,
  Vector2
} from "three";

import { BaseEntityType, EntityProps } from "src/api/entity";
import { kInvPixelScale, kPixelScale } from "src/engine/constants/scaling";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import { vector2ToArr2 } from "src/engine/util/vecTypes";

import fragmentShader from "./progressiveDrawLineFrag.glsl";
import vertexShader from "./progressiveDrawLineVert.glsl";

export type ProgressiveDrawLineProps = EntityProps & {};

export class ProgressiveDrawLine extends CoreEntity implements BaseEntityType {
  static type = "ProgressiveDrawLine";
  public type = ProgressiveDrawLine.type;

  public object3D = new Object3D();

  private polyline: Vector2[];
  private vertexCount: number;

  private geom = new BufferGeometry();
  private posArr: Float32Array;
  private distArr: Float32Array;
  private indexArr: Uint16Array;
  private miterThicknessArr: Float32Array;
  private material = new ShaderMaterial({
    vertexShader,
    fragmentShader,
    transparent: true,
    uniforms: {
      opacity: {
        value: 1
      },
      color: {
        value: new Color(0xffffff)
      },
      thickness: {
        value: 0.125
      },
      minDist: {
        value: 0
      },
      maxDist: {
        value: 0
      }
    }
  });
  private mesh = new Mesh(this.geom, this.material);

  constructor(props: ProgressiveDrawLineProps) {
    super(props);

    const polyline = props.polyline ?? props.polygon ?? [];
    const vertexCount = Math.max(0, polyline.length * 3 - 2);
    this.polyline = polyline;
    this.vertexCount = vertexCount;

    this.posArr = new Float32Array(vertexCount * 6);
    this.distArr = new Float32Array(vertexCount * 4);
    this.miterThicknessArr = new Float32Array(vertexCount * 6);
    this.indexArr = new Uint16Array(Math.max(0, vertexCount - 1) * 6);

    for (let vi = 0; vi < Math.max(0, vertexCount - 1); vi++) {
      const vvi = vi * 2;
      const ivi = vi * 6;
      this.indexArr[ivi + 0] = vvi;
      this.indexArr[ivi + 1] = vvi + 2;
      this.indexArr[ivi + 2] = vvi + 1;
      this.indexArr[ivi + 3] = vvi + 1;
      this.indexArr[ivi + 4] = vvi + 2;
      this.indexArr[ivi + 5] = vvi + 3;
    }

    this.geom.setAttribute("position", new BufferAttribute(this.posArr, 3));
    this.geom.setAttribute("vtxDistance", new BufferAttribute(this.distArr, 2));
    this.geom.setAttribute(
      "vtxNormalMiter",
      new BufferAttribute(this.miterThicknessArr, 3)
    );
    this.geom.setIndex(new BufferAttribute(this.indexArr, 1));

    this.updateGeometry();

    this.object3D.add(this.mesh);
    this.object3D.position
      .copy(this.position)
      .multiplyScalar(kPixelScale)
      .round()
      .multiplyScalar(kInvPixelScale);

    if (props.opacity) this.material.uniforms.opacity.value = props.opacity;
    this.object3D.rotation.z = this.angle;

    this.drawProgressive();
  }
  drawProgressive(duration = 1000, moveStart = false) {
    const len = this.getTotalLength();
    this.scheduler.cancel("draw");
    this.scheduler.add({
      id: "draw",
      duration,
      invokeFunction: (t) => {
        this.material.uniforms.minDist.value = moveStart ? -(1 - t) * len : 0;
        this.material.uniforms.maxDist.value = t * len;
        this.material.uniformsNeedUpdate = true;
      },
      invokeFunctionAtComplete: () => {
        this.material.uniforms.minDist.value = 0;
        this.material.uniforms.maxDist.value = len;
        this.material.uniformsNeedUpdate = true;
      }
    });
  }
  hideImmediate() {
    this.scheduler.cancel("draw");
    this.material.uniforms.minDist.value = 0;
    this.material.uniforms.maxDist.value = 0;
    this.material.uniformsNeedUpdate = true;
  }
  hideProgressive(duration = 1000) {
    const len = this.getTotalLength();
    this.scheduler.cancel("draw");
    this.scheduler.add({
      id: "draw",
      duration,
      invokeFunction: (t) => {
        this.material.uniforms.minDist.value = t * len;
        this.material.uniforms.maxDist.value = len;
        this.material.uniformsNeedUpdate = true;
      },
      invokeFunctionAtComplete: () => {
        this.material.uniforms.minDist.value = len;
        this.material.uniforms.maxDist.value = len;
        this.material.uniformsNeedUpdate = true;
      }
    });
  }
  getTotalLength() {
    const { polyline } = this;
    let totalDist = 0;
    const prev = polyline.at(0)?.clone();
    if (prev === undefined) return 0;
    const delta = new Vector2();
    for (let vi = 0; vi < this.vertexCount; vi++) {
      const next = polyline.at(vi);
      if (next === undefined) continue;
      delta.copy(next).sub(prev);
      totalDist += delta.length();
      prev.copy(next);
    }
    return totalDist;
  }
  updateGeometry() {
    const { polyline, geom, posArr, distArr, miterThicknessArr } = this;
    const pNormals = getNormals(polyline.map(vector2ToArr2));
    const prev = polyline.at(0)?.clone();
    if (prev === undefined) return;
    const delta = new Vector2();
    const tangent = new Vector2();
    let totalDist = 0;
    let vertsUsed = 0;
    let vvi = 0;
    let uvi = 0;
    for (let vi = 0; vi < this.vertexCount; vi++) {
      const next = polyline.at(vi);
      const nextNormalMiter = pNormals.at(vi);
      if (next === undefined || nextNormalMiter === undefined) continue;
      const nextNormal = nextNormalMiter[0];
      const nextMiter = nextNormalMiter[1];
      delta.copy(next).sub(prev);
      const segLength = delta.length();
      tangent.copy(delta).normalize();
      if (segLength > nextMiter * 2 && nextMiter > 0 && segLength > 0) {
        const normal = new Vector2(-tangent.y, tangent.x);
        const distA = nextMiter * 1.5;
        const distB = Math.max(distA, segLength - distA);
        const nextA = tangent.clone().multiplyScalar(distA).add(prev);
        const nextB = tangent.clone().multiplyScalar(distB).add(prev);
        nextA.toArray(posArr, vvi + 0);
        nextA.toArray(posArr, vvi + 3);
        nextB.toArray(posArr, vvi + 6);
        nextB.toArray(posArr, vvi + 9);
        distArr[uvi + 0] = totalDist + distA;
        distArr[uvi + 1] = -1;
        distArr[uvi + 2] = totalDist + distA;
        distArr[uvi + 3] = 1;
        distArr[uvi + 4] = totalDist + distB;
        distArr[uvi + 5] = -1;
        distArr[uvi + 6] = totalDist + distB;
        distArr[uvi + 7] = 1;
        miterThicknessArr[vvi + 0] = normal.x;
        miterThicknessArr[vvi + 1] = normal.y;
        miterThicknessArr[vvi + 2] = -1;
        miterThicknessArr[vvi + 3] = normal.x;
        miterThicknessArr[vvi + 4] = normal.y;
        miterThicknessArr[vvi + 5] = 1;
        miterThicknessArr[vvi + 6] = normal.x;
        miterThicknessArr[vvi + 7] = normal.y;
        miterThicknessArr[vvi + 8] = -1;
        miterThicknessArr[vvi + 9] = normal.x;
        miterThicknessArr[vvi + 10] = normal.y;
        miterThicknessArr[vvi + 11] = 1;
        vvi += 12;
        uvi += 8;
        vertsUsed += 2;
      }
      totalDist += segLength;
      next.toArray(posArr, vvi + 0);
      next.toArray(posArr, vvi + 3);
      distArr[uvi + 0] = totalDist;
      distArr[uvi + 1] = -1;
      distArr[uvi + 2] = totalDist;
      distArr[uvi + 3] = 1;
      miterThicknessArr[vvi + 0] = nextNormal[0];
      miterThicknessArr[vvi + 1] = nextNormal[1];
      miterThicknessArr[vvi + 2] = -nextMiter;
      miterThicknessArr[vvi + 3] = nextNormal[0];
      miterThicknessArr[vvi + 4] = nextNormal[1];
      miterThicknessArr[vvi + 5] = nextMiter;
      vvi += 6;
      uvi += 4;
      vertsUsed++;
      prev.copy(next);
    }
    geom.getAttribute("position").needsUpdate = true;
    geom.getAttribute("vtxDistance").needsUpdate = true;
    geom.getAttribute("vtxNormalMiter").needsUpdate = true;
    geom.setDrawRange(0, Math.max(0, (vertsUsed - 1) * 6));
  }
  destroy() {
    super.destroy();
    this.geom.dispose();
    this.material.dispose();
  }
}
