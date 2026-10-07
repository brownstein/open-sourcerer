import { shuffle } from "fast-shuffle";
import { BufferAttribute, BufferGeometry, Color, Mesh, NearestFilter, Object3D, ShaderMaterial, Texture, Vector2, Vector3, Vector4 } from "three";

import { ColorRepresentation } from "src/api/util";
import { DeferredEmitter } from "src/engine/util/deferredEmitter";

import { Sampler, SamplerBounds } from "../sampler/Sampler";
import fragmentShader from "./coalesceEffectFrag.glsl";
import vertexShader from "./coalesceEffectVert.glsl";

export type CoalesceEffectProps = {
  target: Object3D;
  duration: number;
  rows: number;
  cols: number;
  spread?: number;
  particleEffector?: (p: CoalesceParticle) => void;
};

type CoalesceParticle = {
  position: Vector3;
  size: Vector2;
  uv: Vector2;
  uvSize: Vector2;
  opacity: number;
  startMs: number;
  endMs: number;
  startPosition: Vector3;
  endPosition: Vector3;
};

export class CoalesceEffect {
  public readonly deferredEvents = new DeferredEmitter();
  public readonly object3D = new Object3D();

  private spreadSize = 1;
  private rows: number;
  private cols: number;
  private particleCount: number;
  private particleInstantiationOrder: number[];
  private particleEffector?: (p: CoalesceParticle) => void;

  private currentMs = 0;
  private effectDurationMs: number;
  private particles: CoalesceParticle[] = [];

  private target: Object3D;
  private sampler?: Sampler;
  private texture?: Texture;
  private samplerBounds?: SamplerBounds;

  private geom = new BufferGeometry();
  private positionArr: Float32Array;
  private uvArr: Float32Array;
  private opacityArr: Float32Array;
  private indexArr: Uint16Array;
  private material?: ShaderMaterial;
  private mesh?: Mesh;

  constructor(props: CoalesceEffectProps) {
    this.target = props.target;
    this.spreadSize = props.spread ?? this.spreadSize;
    this.effectDurationMs = props.duration;
    this.rows = Math.floor(props.rows);
    this.cols = Math.floor(props.cols);
    this.particleCount = this.rows * this.cols;
    this.particleEffector = props.particleEffector;

    const sequence = [];
    for (let i = 0; i < this.particleCount; i++) sequence.push(i);
    this.particleInstantiationOrder = shuffle(sequence);

    this.positionArr = new Float32Array(this.particleCount * 12);
    this.uvArr = new Float32Array(this.particleCount * 8);
    this.opacityArr = new Float32Array(this.particleCount * 4);
    this.indexArr = new Uint16Array(this.particleCount * 6);
    this.geom.setAttribute(
      "position",
      new BufferAttribute(this.positionArr, 3)
    );
    this.geom.setAttribute("uv", new BufferAttribute(this.uvArr, 2));
    this.geom.setAttribute(
      "vtxOpacity",
      new BufferAttribute(this.opacityArr, 1)
    );
    this.geom.setIndex(new BufferAttribute(this.indexArr, 1));

    // Initialize indexes.
    for (let i = 0; i < this.particleCount; i++) {
      const ii = i * 6;
      const vi = i * 4;
      this.indexArr[ii + 0] = vi + 0;
      this.indexArr[ii + 1] = vi + 1;
      this.indexArr[ii + 2] = vi + 2;
      this.indexArr[ii + 3] = vi + 1;
      this.indexArr[ii + 4] = vi + 3;
      this.indexArr[ii + 5] = vi + 2;
    }

    // Initialize material.
    this.material = new ShaderMaterial({
      transparent: true,
      fragmentShader,
      vertexShader,
      uniforms: {
        opacity: {
          value: 1
        },
        fade: {
          value: new Vector4(0, 0, 0, 0)
        }
      }
    });

    this.mesh = new Mesh(this.geom, this.material);
    this.mesh.onBeforeRender = (renderer) => {
      if (!this.sampler || !this.texture || !this.samplerBounds) {
        this.sampler = new Sampler();
        this.sampler.add(this.target.clone(true));
        this.samplerBounds = this.sampler.getSamplerBounds();
        this.texture = this.sampler.sample(renderer).texture;
        this.texture.minFilter = NearestFilter;
        this.texture.magFilter = NearestFilter;
        if (this.material) {
          this.material.uniforms.map = { value: this.texture };
          this.material.uniformsNeedUpdate = true;
        }
        this.initAllParticles();
      }
      this.updateGeometry();
    };

    this.object3D.add(this.mesh);
  }

  step(ms: number) {
    this.currentMs += ms;
    this.updateParticles();
    if (
      this.currentMs >= this.effectDurationMs &&
      !this.deferredEvents.getDone()
    ) {
      this.deferredEvents.emit("done");
    }
  }

  destroy() {
    this.sampler?.destroy();
    this.geom.dispose();
    this.material?.dispose();
    this.texture?.dispose();
  }

  initAllParticles() {
    if (this.samplerBounds === undefined || this.particles.length > 0) return;
    const partSize = new Vector2(
      this.samplerBounds.sceneSize.x / this.cols,
      this.samplerBounds.sceneSize.y / this.rows
    );
    const partOffset = new Vector2(
      this.samplerBounds.sceneCenter.x - (this.cols - 1) * partSize.x * 0.5,
      this.samplerBounds.sceneCenter.y - (this.rows - 1) * partSize.y * 0.5
    );
    const uvSize = new Vector2(1 / this.cols, 1 / this.rows);
    const uvOffset = new Vector2(
      this.samplerBounds.textureOffset.x +
        0.5 -
        uvSize.x * (this.cols - 1) * 0.5,
      this.samplerBounds.textureOffset.y +
        0.5 -
        uvSize.y * (this.rows - 1) * 0.5
    );
    for (let i = 0; i < this.particleCount; i++) {
      const order = this.particleInstantiationOrder[i];
      const row = Math.floor(i / this.cols);
      const col = i % this.cols;
      const x = partSize.x * col + partOffset.x;
      const y = partSize.y * row + partOffset.y;
      const u = uvSize.x * col + uvOffset.x;
      const v = uvSize.y * row + uvOffset.y;
      const startPosition = new Vector3(
        x + (0.5 - Math.random()),
        y + (0.5 - Math.random()),
        order * 0.001
      );
      const endPosition = new Vector3(x, y, order * 0.001);
      const position = startPosition.clone();
      const startMs = (order * this.effectDurationMs) / this.particleCount;
      const endMs = Math.min(
        this.effectDurationMs,
        Math.max(
          startMs + 1,
          this.effectDurationMs * (Math.random() * 0.5 + 0.5)
        )
      );
      const particle: CoalesceParticle = {
        position,
        startPosition,
        endPosition,
        startMs,
        endMs,
        opacity: 0,
        uvSize: uvSize.clone(),
        size: partSize.clone(),
        uv: new Vector2(u, v)
      };
      this.particleEffector?.(particle);
      this.particles.push(particle);
    }
  }
  updateParticles() {
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      const pTime = Math.max(
        0,
        Math.min(1, (this.currentMs - p.startMs) / (p.endMs - p.startMs))
      );
      p.position.copy(p.startPosition).lerp(p.endPosition, pTime);
      p.opacity = Math.max(0, Math.min(1, pTime * 4));
    }
  }
  updateGeometry() {
    const { geom, positionArr, uvArr, opacityArr } = this;
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      const x = p.position.x;
      const y = p.position.y;
      const u = p.uv.x;
      const v = p.uv.y;
      const o = p.opacity;
      const dx = p.size.x * 0.5;
      const dy = p.size.y * 0.5;
      const du = p.uvSize.x * 0.5;
      const dv = p.uvSize.y * 0.5;
      const vi = i * 12;
      const uvi = i * 8;
      const oi = i * 4;
      positionArr[vi + 0] = x - dx;
      positionArr[vi + 1] = y - dy;
      positionArr[vi + 3] = x + dx;
      positionArr[vi + 4] = y - dy;
      positionArr[vi + 6] = x - dx;
      positionArr[vi + 7] = y + dy;
      positionArr[vi + 9] = x + dx;
      positionArr[vi + 10] = y + dy;
      uvArr[uvi + 0] = u - du;
      uvArr[uvi + 1] = v - dv;
      uvArr[uvi + 2] = u + du;
      uvArr[uvi + 3] = v - dv;
      uvArr[uvi + 4] = u - du;
      uvArr[uvi + 5] = v + dv;
      uvArr[uvi + 6] = u + du;
      uvArr[uvi + 7] = v + dv;
      opacityArr[oi + 0] = o;
      opacityArr[oi + 1] = o;
      opacityArr[oi + 2] = o;
      opacityArr[oi + 3] = o;
    }
    geom.getAttribute("position").needsUpdate = true;
    geom.getAttribute("uv").needsUpdate = true;
    geom.getAttribute("vtxOpacity").needsUpdate = true;
  }
  setFade(fadeColor: ColorRepresentation, amount: number) {
    const color = new Color(fadeColor);
    if (!this.material) return;
    this.material.uniforms.fade.value.x = color.r;
    this.material.uniforms.fade.value.y = color.g;
    this.material.uniforms.fade.value.z = color.b;
    this.material.uniforms.fade.value.w = amount;
    this.material.uniformsNeedUpdate = true;
  }
}
