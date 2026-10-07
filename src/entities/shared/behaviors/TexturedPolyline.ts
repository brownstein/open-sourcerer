import getNormals from "polyline-normals";
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  RepeatWrapping,
  ShaderMaterial,
  Texture,
  Vector2
} from "three";

import { BaseEntityType, EntityBehavior } from "src/api/entity";
import { vector2ToArr2 } from "src/engine/util/vecTypes";

import fragmentShader from "./shaders/texturedPolyline.frag.glsl";
import vertexShader from "./shaders/texturedPolyline.vert.glsl";

export type TexturedPolylineBehaviorProps = {
  polyline?: Vector2[];
  polygon?: Vector2[];
  texture: Texture;
  textureAspectRatio: number;
};

export class TexturedPolylineBehavior implements EntityBehavior {
  static type = "TexturedPolyline";
  public type = TexturedPolylineBehavior.type;
  public mesh: Mesh;

  private entity?: BaseEntityType;

  private polyline: Vector2[];
  private isClosedPolygon = false;
  private texture: Texture;
  private textureAsepectRatio: number;

  private geom = new BufferGeometry();
  private indexArr?: Uint16Array;
  private posArr?: Float32Array;
  private uvArr?: Float32Array;
  private miterThicknessArr?: Float32Array;
  private material: ShaderMaterial;

  constructor(props: TexturedPolylineBehaviorProps) {
    this.polyline = props.polyline ?? props.polygon ?? [];
    this.isClosedPolygon = !!props.polygon;
    this.texture = props.texture.clone();
    this.texture.wrapT = RepeatWrapping;
    this.textureAsepectRatio = props.textureAspectRatio;

    this.material = new ShaderMaterial({
      fragmentShader,
      vertexShader,
      uniforms: {
        map: {
          value: this.texture
        },
        color: {
          value: new Color(1, 1, 1)
        },
        opacity: {
          value: 1
        },
        thickness: {
          value: 0.25
        }
      },
      transparent: true,
      alphaTest: 0.1,
      depthTest: true
    });

    this.makeGeometry();

    this.mesh = new Mesh(this.geom, this.material);
  }
  destroy() {
    this.geom.dispose();
    this.texture.dispose();
    this.material.dispose();
  }
  private makeGeometry() {
    const vertices = this.polyline;
    const closed = this.isClosedPolygon;
    const pathArr2 = vertices.map(vector2ToArr2);
    const normalsAndMiters = getNormals(pathArr2, closed);

    const uvDistanceCoeff =
      this.textureAsepectRatio * this.material.uniforms.thickness.value * 2;

    const vertexCount = closed ? vertices.length + 1 : vertices.length;
    this.indexArr = new Uint16Array((vertexCount - 1) * 6);
    this.posArr = new Float32Array(vertexCount * 6);
    this.uvArr = new Float32Array(vertexCount * 4);
    this.miterThicknessArr = new Float32Array(vertexCount * 6);
    const { geom, indexArr, posArr, uvArr, miterThicknessArr } = this;
    this.geom.setAttribute("position", new BufferAttribute(posArr, 3));
    this.geom.setAttribute("uv", new BufferAttribute(uvArr, 2));
    this.geom.setAttribute(
      "vtxNormalMiter",
      new BufferAttribute(miterThicknessArr, 3)
    );
    this.geom.setIndex(new BufferAttribute(indexArr, 1));
    for (let vi = 0; vi < vertexCount - 1; vi++) {
      const vvi = vi * 2;
      const ivi = vi * 6;
      indexArr[ivi + 0] = vvi;
      indexArr[ivi + 1] = vvi + 2;
      indexArr[ivi + 2] = vvi + 1;
      indexArr[ivi + 3] = vvi + 1;
      indexArr[ivi + 4] = vvi + 2;
      indexArr[ivi + 5] = vvi + 3;
    }
    let totalDist = 0;
    let prev = vertices.at(0);
    if (prev === undefined) return;
    const delta = new Vector2();
    for (let vi = 0; vi < vertices.length; vi++) {
      const vvi = vi * 6;
      const uvi = vi * 4;
      const next = vertices.at(vi);
      const nextNormalMiter = normalsAndMiters.at(vi);
      if (next === undefined || nextNormalMiter === undefined) continue;
      const [nextNormal, nextMiter] = nextNormalMiter;
      delta.copy(next).sub(prev);
      totalDist += delta.length();
      next.toArray(posArr, vvi + 0);
      next.toArray(posArr, vvi + 3);
      uvArr[uvi + 0] = 0;
      uvArr[uvi + 1] = totalDist * uvDistanceCoeff;
      uvArr[uvi + 2] = 1;
      uvArr[uvi + 3] = totalDist * uvDistanceCoeff;
      miterThicknessArr[vvi + 0] = nextNormal[0];
      miterThicknessArr[vvi + 1] = nextNormal[1];
      miterThicknessArr[vvi + 2] = -nextMiter;
      miterThicknessArr[vvi + 3] = nextNormal[0];
      miterThicknessArr[vvi + 4] = nextNormal[1];
      miterThicknessArr[vvi + 5] = nextMiter;
      prev = next;
    }
    if (closed) {
      const vi = vertices.length;
      const vvi = vi * 6;
      const uvi = vi * 4;
      const next = vertices.at(0);
      const nextNormalMiter = normalsAndMiters.at(0);
      if (next === undefined || nextNormalMiter === undefined) return;
      const [nextNormal, nextMiter] = nextNormalMiter;
      delta.copy(next).sub(prev);
      totalDist += delta.length();
      next.toArray(posArr, vvi + 0);
      next.toArray(posArr, vvi + 3);
      uvArr[uvi + 0] = 0;
      uvArr[uvi + 1] = totalDist * uvDistanceCoeff;
      uvArr[uvi + 2] = 1;
      uvArr[uvi + 3] = totalDist * uvDistanceCoeff;
      miterThicknessArr[vvi + 0] = nextNormal[0];
      miterThicknessArr[vvi + 1] = nextNormal[1];
      miterThicknessArr[vvi + 2] = -nextMiter;
      miterThicknessArr[vvi + 3] = nextNormal[0];
      miterThicknessArr[vvi + 4] = nextNormal[1];
      miterThicknessArr[vvi + 5] = nextMiter;
    }
    geom.computeBoundingSphere();
  }
  init(entity: BaseEntityType) {
    this.entity = entity;
    this.entity.object3D?.add(this.mesh);
  }
}
