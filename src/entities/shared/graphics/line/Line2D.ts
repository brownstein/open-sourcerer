import getNormals from "polyline-normals";
import { BufferAttribute, BufferGeometry, Color, DoubleSide, Mesh, ShaderMaterial, Vector3 } from "three";

import { ColorRepresentation } from "src/api/util";
import { arr2 as vec2 } from "src/engine/util/vecTypes";
import { arr2ToVector2 } from "src/engine/util/vecTypes";

import fragmentShader from "./Line2DFrag.glsl";
import vertexShader from "./Line2DVert.glsl";

export class Line2D {
  public mesh: Mesh;
  private geom: BufferGeometry;
  private material: ShaderMaterial;

  private srcPath: vec2[];

  private posArr: Float32Array;
  private normalMiterArr: Float32Array;
  private distanceArr: Float32Array;
  private indexArr: Uint16Array;

  constructor(path: vec2[]) {
    this.srcPath = path;

    this.geom = new BufferGeometry();
    const vtxCount = path.length;
    this.posArr = new Float32Array(vtxCount * 6);
    this.normalMiterArr = new Float32Array(vtxCount * 6);
    this.distanceArr = new Float32Array(vtxCount * 2);
    this.indexArr = new Uint16Array((vtxCount - 1) * 6);
    this.geom.setAttribute("position", new BufferAttribute(this.posArr, 3));
    this.geom.setAttribute(
      "normalMiter",
      new BufferAttribute(this.normalMiterArr, 3)
    );
    this.geom.setAttribute(
      "distance",
      new BufferAttribute(this.distanceArr, 1)
    );
    this.geom.setIndex(new BufferAttribute(this.indexArr, 1));

    this.material = new ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        opacity: {
          value: 1
        },
        color: {
          value: new Color(0xffffff)
        },
        thickness: {
          value: 0.125
        }
      },
      transparent: true,
      side: DoubleSide
    });

    this.updateGeom();
    this.mesh = new Mesh(this.geom, this.material);
  }
  private updateGeom() {
    const path = this.srcPath;
    const pathNormalMiters = getNormals(path, false);

    const vtxCount = this.srcPath.length;
    const posArr = this.posArr;
    const normalMiterArr = this.normalMiterArr;
    const distanceArr = this.distanceArr;
    const indexArr = this.indexArr;

    const pos = new Vector3();
    let lastPos: Vector3 | undefined;
    let distance = 0;
    for (let vi = 0; vi < vtxCount; vi++) {
      const [x, y] = path[vi];
      const [[nx, ny], m] = pathNormalMiters[vi];
      posArr[vi * 6 + 0] = x;
      posArr[vi * 6 + 1] = y;
      posArr[vi * 6 + 2] = 0;
      posArr[vi * 6 + 3] = x;
      posArr[vi * 6 + 4] = y;
      posArr[vi * 6 + 5] = 0;
      normalMiterArr[vi * 6 + 0] = nx;
      normalMiterArr[vi * 6 + 1] = ny;
      normalMiterArr[vi * 6 + 2] = m;
      normalMiterArr[vi * 6 + 3] = -nx;
      normalMiterArr[vi * 6 + 4] = -ny;
      normalMiterArr[vi * 6 + 5] = m;
      pos.x = x;
      pos.y = y;
      if (lastPos !== undefined) {
        pos.sub(lastPos);
        distance += pos.length();
        lastPos.x = x;
        lastPos.y = y;
      } else {
        lastPos = pos.clone();
      }
      distanceArr[vi * 2 + 0] = distance;
      distanceArr[vi * 2 + 1] = distance;
    }
    for (let vi = 0; vi < vtxCount - 1; vi++) {
      indexArr[vi * 6 + 0] = vi * 2 + 0;
      indexArr[vi * 6 + 1] = vi * 2 + 2;
      indexArr[vi * 6 + 2] = vi * 2 + 1;
      indexArr[vi * 6 + 3] = vi * 2 + 1;
      indexArr[vi * 6 + 4] = vi * 2 + 3;
      indexArr[vi * 6 + 5] = vi * 2 + 2;
    }
  }
  recolor(color: ColorRepresentation) {
    this.material.uniforms.color.value.set(color);
    this.material.uniformsNeedUpdate = true;
  }
  getPathPointAtDistance(distance: number) {
    let distSampleLast = 0;
    for (let vi = 0; vi < this.distanceArr.length; vi++) {
      const distSample = this.distanceArr[vi * 2];
      if (distSample >= distance) {
        if (vi === 0) return arr2ToVector2(this.srcPath.at(0) ?? [0, 0]);
        const v2a = arr2ToVector2(this.srcPath.at(vi - 1) ?? [0, 0]);
        const v2b = arr2ToVector2(this.srcPath.at(vi) ?? [0, 0]);
        const lerpAmount =
          (distance - distSampleLast) / (distSample - distSampleLast || 1);
        return v2a.lerp(v2b, lerpAmount);
      }
      distSampleLast = distSample;
    }
    return arr2ToVector2(this.srcPath.at(-1) ?? [0, 0]);
  }
  getTotalDistance() {
    return this.distanceArr.at(-1) ?? 0;
  }
}
