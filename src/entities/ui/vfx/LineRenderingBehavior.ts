import getNormals from "polyline-normals";
import { BufferAttribute, BufferGeometry, Color, Mesh, ShaderMaterial, Vector2 } from "three";

import { EntityBehavior } from "src/api/entity";
import { vector2ToArr2 } from "src/engine/util/vecTypes";

import fragmentShader from "./lineRenderingFrag.glsl";
import vertexShader from "./lineRenderingVert.glsl";

export type LineRenderingBehaviorProps = {
  vertices?: Vector2[];
};

export class LineRenderingBehavior implements EntityBehavior {
  static type = "LineRendering";
  public type = LineRenderingBehavior.type;

  private vertexCount: number = 0;
  private vertexHeadRoom: number = 32;

  private geom = new BufferGeometry();
  private posArr: Float32Array = new Float32Array(this.vertexHeadRoom * 6);
  private distArr: Float32Array = new Float32Array(this.vertexHeadRoom * 4);
  private indexArr: Uint16Array = new Uint16Array(
    (this.vertexHeadRoom - 1) * 6
  );
  private miterThicknessArr: Float32Array = new Float32Array(
    this.vertexHeadRoom * 6
  );
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
        value: 1000
      },
      offset: {
        value: 0
      }
    }
  });

  public mesh = new Mesh(this.geom, this.material);

  constructor(props?: LineRenderingBehaviorProps) {
    this.geom.setAttribute("position", new BufferAttribute(this.posArr, 3));
    this.geom.setAttribute("vtxDistance", new BufferAttribute(this.distArr, 2));
    this.geom.setAttribute(
      "vtxNormalMiter",
      new BufferAttribute(this.miterThicknessArr, 3)
    );
    this.geom.setIndex(new BufferAttribute(this.indexArr, 1));

    for (let vi = 0; vi < Math.max(0, this.vertexHeadRoom - 1); vi++) {
      const vvi = vi * 2;
      const ivi = vi * 6;
      this.indexArr[ivi + 0] = vvi;
      this.indexArr[ivi + 1] = vvi + 2;
      this.indexArr[ivi + 2] = vvi + 1;
      this.indexArr[ivi + 3] = vvi + 1;
      this.indexArr[ivi + 4] = vvi + 2;
      this.indexArr[ivi + 5] = vvi + 3;
    }

    if (props?.vertices) this.update(props.vertices);
  }

  setColor(color: Color) {
    this.material.uniforms.color.value.set(color);
    this.material.uniformsNeedUpdate = true;
    return this;
  }

  setOpacity(opacity: number) {
    this.material.uniforms.opacity.value = opacity;
    this.material.uniformsNeedUpdate = true;
    return this;
  }

  getOpacity() {
    return this.material.uniforms.opacity.value;
  }

  setOffset(offset: number) {
    this.material.uniforms.offset.value = offset;
    this.material.uniformsNeedUpdate = true;
  }

  update(vertices: Vector2[]) {
    this.vertexCount = vertices.length;

    // Expand buffers as necessary.
    if (vertices.length > this.vertexHeadRoom) {
      this.vertexHeadRoom = Math.pow(2, Math.ceil(Math.log2(vertices.length)));
      this.posArr = new Float32Array(this.vertexHeadRoom * 6);
      this.distArr = new Float32Array(this.vertexHeadRoom * 4);
      this.indexArr = new Uint16Array((this.vertexHeadRoom - 1) * 6);
      this.miterThicknessArr = new Float32Array(this.vertexHeadRoom * 6);
      this.geom.setAttribute("position", new BufferAttribute(this.posArr, 3));
      this.geom.setAttribute(
        "vtxDistance",
        new BufferAttribute(this.distArr, 2)
      );
      this.geom.setAttribute(
        "vtxNormalMiter",
        new BufferAttribute(this.miterThicknessArr, 3)
      );
      this.geom.setIndex(new BufferAttribute(this.indexArr, 1));
      for (let vi = 0; vi < Math.max(0, this.vertexHeadRoom - 1); vi++) {
        const vvi = vi * 2;
        const ivi = vi * 6;
        this.indexArr[ivi + 0] = vvi;
        this.indexArr[ivi + 1] = vvi + 2;
        this.indexArr[ivi + 2] = vvi + 1;
        this.indexArr[ivi + 3] = vvi + 1;
        this.indexArr[ivi + 4] = vvi + 2;
        this.indexArr[ivi + 5] = vvi + 3;
      }
    }
    this.geom.setDrawRange(0, Math.max(0, (vertices.length - 1) * 6));

    // Get to updating our buffers.
    const { geom, posArr, distArr, miterThicknessArr } = this;
    const pNormals = getNormals(vertices.map(vector2ToArr2));
    const prev = vertices.at(0)?.clone();
    if (prev === undefined) return;

    const delta = new Vector2();
    const tangent = new Vector2();
    let totalDist = 0;
    // vertsUsed tracking removed (was unused)
    let vvi = 0;
    let uvi = 0;
    for (let vi = 0; vi < vertices.length; vi++) {
      const next = vertices.at(vi);
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
        // vertsUsed += 2;
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
      // vertsUsed++;
      prev.copy(next);
    }
    geom.getAttribute("position").needsUpdate = true;
    geom.getAttribute("vtxDistance").needsUpdate = true;
    geom.getAttribute("vtxNormalMiter").needsUpdate = true;
    geom.computeBoundingSphere();
  }

  destroy() {
    this.geom.dispose();
    this.material.dispose();
  }
}
