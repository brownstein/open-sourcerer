import {
  BufferAttribute,
  BufferGeometry,
  Color,
  Mesh,
  Object3D,
  ShaderMaterial,
  Vector2
} from "three";

import { EntityProps } from "src/api/entity";
import { kInvPixelScale, kPixelScale } from "src/engine/constants/scaling";
import { CoreEntity } from "src/engine/entity/CoreEntity";

import fragmentShader from "./fauxUnitTestProgressFrag.glsl";
import vertexShader from "./fauxUnitTestProgressVert.glsl";

export type FauxUnitTestProgressProps = EntityProps & {};

type SimpleRect = {
  position: Vector2;
  size: Vector2;
  color: Color;
  opacity: number;
  ms: number;
};

export class FauxUnitTestProgress extends CoreEntity {
  static type = "FauxUnitTestProgress";
  public type = FauxUnitTestProgress.type;
  public object3D = new Object3D();

  private quads: SimpleRect[] = [];
  private maxQuads = 64;

  private geom = new BufferGeometry();
  private posArr = new Float32Array(this.maxQuads * 12);
  private colorArr = new Float32Array(this.maxQuads * 12);
  private opacityArr = new Float32Array(this.maxQuads * 4);
  private indexArr = new Uint16Array(this.maxQuads * 6);
  private material = new ShaderMaterial({
    transparent: true,
    fragmentShader,
    vertexShader,
    uniforms: {
      opacity: {
        value: 0.5
      }
    }
  });
  private mesh = new Mesh(this.geom, this.material);

  constructor(props: FauxUnitTestProgressProps) {
    super(props);

    this.object3D.position
      .copy(this.position)
      .multiplyScalar(kPixelScale)
      .round()
      .multiplyScalar(kInvPixelScale);
    this.object3D.rotation.z = props.angle ?? 0;

    this.object3D.add(this.mesh);

    // Initialize indexes.
    for (let i = 0; i < this.maxQuads; i++) {
      const ii = i * 6;
      const vi = i * 4;
      this.indexArr[ii + 0] = vi + 0;
      this.indexArr[ii + 1] = vi + 1;
      this.indexArr[ii + 2] = vi + 2;
      this.indexArr[ii + 3] = vi + 1;
      this.indexArr[ii + 4] = vi + 3;
      this.indexArr[ii + 5] = vi + 2;
    }

    this.geom.setAttribute("position", new BufferAttribute(this.posArr, 3));
    this.geom.setAttribute("vtxColor", new BufferAttribute(this.colorArr, 3));
    this.geom.setAttribute(
      "vtxOpacity",
      new BufferAttribute(this.opacityArr, 1)
    );
    this.geom.setIndex(new BufferAttribute(this.indexArr, 1));

    this.updateQuads(0);
    this.updateGeometry();
  }

  destroy(): void {
    super.destroy();
    this.geom.dispose();
    this.material.dispose();
  }

  step(ms: number) {
    super.step(ms);
    this.updateQuads(ms);
    this.updateGeometry();
  }

  updateQuads(ms: number) {
    while (this.quads.length > this.maxQuads - 2) {
      this.quads.shift();
    }
    if ((this.quads.at(-1)?.position?.x ?? 0) < this.size.width * 0.5 - 0.35) {
      this.quads.push({
        position: new Vector2(this.size.width * 0.5, 0),
        size: new Vector2(0.25, 0.25),
        opacity: 0,
        // color: Math.random() > 0.2 ? new Color(0x00ff00) : new Color(0xaa0000),
        color:
          Math.random() > 0.2 ? new Color(0x004488) : new Color(0xaa00aaff),
        ms: 0
      });
    }
    for (let i = 0; i < this.quads.length; i++) {
      const quad = this.quads[i];
      quad.ms += ms;
      quad.position.x -= ms * 0.001;
      quad.opacity = Math.max(
        0,
        Math.min(1, this.size.width * 0.5 - Math.abs(quad.position.x))
      );
      quad.size.y =
        Math.sin(
          Math.max(0, 0.5 - Math.abs(quad.position.x / this.size.width)) *
            Math.PI
        ) * this.size.height;
      quad.position.y = quad.size.y * 0.5 - this.size.height * 0.5;
    }
    while ((this.quads.at(0)?.position?.x ?? 0) < -this.size.width * 0.5)
      this.quads.shift();
  }

  updateGeometry() {
    const { quads, geom, posArr, colorArr, opacityArr } = this;
    for (let i = 0; i < quads.length; i++) {
      const q = quads[i];
      const vi = i * 12;
      const oi = i * 4;
      const x = q.position.x;
      const y = q.position.y;
      const dx = q.size.x * 0.5;
      const dy = q.size.y * 0.5;
      const c = q.color;
      const o = q.opacity;
      posArr[vi + 0] = x - dx;
      posArr[vi + 1] = y - dy;
      posArr[vi + 3] = x + dx;
      posArr[vi + 4] = y - dy;
      posArr[vi + 6] = x - dx;
      posArr[vi + 7] = y + dy;
      posArr[vi + 9] = x + dx;
      posArr[vi + 10] = y + dy;
      c.toArray(colorArr, vi + 0);
      c.toArray(colorArr, vi + 3);
      c.toArray(colorArr, vi + 6);
      c.toArray(colorArr, vi + 9);
      opacityArr[oi + 0] = o * 0.6;
      opacityArr[oi + 1] = o * 0.6;
      opacityArr[oi + 2] = o;
      opacityArr[oi + 3] = o;
    }
    geom.setDrawRange(0, Math.min(this.maxQuads * 6, quads.length * 6));
    geom.getAttribute("position").needsUpdate = true;
    geom.getAttribute("vtxColor").needsUpdate = true;
    geom.getAttribute("vtxOpacity").needsUpdate = true;
    geom.computeBoundingSphere();
  }
}
