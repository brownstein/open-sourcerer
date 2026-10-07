import {
  BufferAttribute,
  Color,
  DoubleSide,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  Object3D,
  ShaderMaterial,
  Vector3
} from "three";

import { BaseEntityType, EntityProps } from "src/api/entity";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import smokeShaderFrag from "src/entities/shared/behaviors/shaders/smokeShaderFrag.glsl";
import smokeShaderVert from "src/entities/shared/behaviors/shaders/smokeShaderVert.glsl";

export type ManaTransferBeamProps = EntityProps & {
  sourceEntityId: string;
  targetEntityId: string;
  durationMs?: number;
};

type BeamParticle = {
  ms: number;
  lifetimeMs: number;
  position: Vector3;
  velocity: Vector3;
  size: number;
  color: Color;
  opacity: number;
  /** 0–1 progress along the beam path */
  t: number;
  seed: number;
};

const BEAM_COLOR_INNER = new Color(0.6, 0.9, 1.0);
const BEAM_COLOR_OUTER = new Color(0.3, 0.6, 1.0);

export class ManaTransferBeam extends CoreEntity {
  static type = "ManaTransferBeam";
  public type = ManaTransferBeam.type;
  public object3D = new Object3D();

  private sourceEntityId: string;
  private targetEntityId: string;
  private durationMs: number;
  private elapsedMs = 0;
  private done = false;

  private maxParticles = 256;
  private particles: BeamParticle[] = [];
  private geom: InstancedBufferGeometry;
  private material: ShaderMaterial;
  private vtxInstancePos: Float32Array;
  private vtxInstanceSize: Float32Array;
  private vtxInstanceColor: Float32Array;

  constructor(props: ManaTransferBeamProps) {
    super(props);
    this.sourceEntityId = props.sourceEntityId;
    this.targetEntityId = props.targetEntityId;
    this.durationMs = props.durationMs ?? 600;

    this.geom = new InstancedBufferGeometry();
    const vtxPos = new Float32Array(18);
    this.vtxInstancePos = new Float32Array(this.maxParticles * 3);
    this.vtxInstanceSize = new Float32Array(this.maxParticles);
    this.vtxInstanceColor = new Float32Array(this.maxParticles * 4);

    // Two triangles forming a quad
    vtxPos[0] = -0.5; vtxPos[1] = -0.5;
    vtxPos[3] = 0.5;  vtxPos[4] = -0.5;
    vtxPos[6] = -0.5; vtxPos[7] = 0.5;
    vtxPos[9] = -0.5; vtxPos[10] = 0.5;
    vtxPos[12] = 0.5; vtxPos[13] = -0.5;
    vtxPos[15] = 0.5; vtxPos[16] = 0.5;

    this.geom.setAttribute("position", new BufferAttribute(vtxPos, 3));
    this.geom.setAttribute(
      "iPosition",
      new InstancedBufferAttribute(this.vtxInstancePos, 3)
    );
    this.geom.setAttribute(
      "iSize",
      new InstancedBufferAttribute(this.vtxInstanceSize, 1)
    );
    this.geom.setAttribute(
      "iColor",
      new InstancedBufferAttribute(this.vtxInstanceColor, 4)
    );
    this.geom.instanceCount = 0;

    this.material = new ShaderMaterial({
      fragmentShader: smokeShaderFrag,
      vertexShader: smokeShaderVert,
      side: DoubleSide,
      transparent: true
    });

    const mesh = new Mesh(this.geom, this.material);
    mesh.frustumCulled = false;
    this.object3D.add(mesh);
  }

  destroy() {
    super.destroy();
    this.geom?.dispose();
    this.material?.dispose();
  }

  step(ms: number) {
    super.step(ms);
    this.elapsedMs += ms;

    const sourceEntity = this.level?.getEntity(this.sourceEntityId) as BaseEntityType | null;
    const targetEntity = this.level?.getEntity(this.targetEntityId) as BaseEntityType | null;

    // If either entity is gone, fade out
    if (!sourceEntity || !targetEntity) {
      this.done = true;
    }

    const emitting = !this.done && this.elapsedMs < this.durationMs;

    // Get current source/target positions (in world space)
    const srcPos = sourceEntity?.position ?? this.position;
    const tgtPos = targetEntity?.position ?? this.position;

    // Keep object3D at origin so particles use world coords
    this.object3D.position.set(0, 0, 0);

    // Spawn new particles along the beam
    if (emitting) {
      const spawnCount = Math.ceil(ms / 8); // ~1 per 8ms
      for (let i = 0; i < spawnCount && this.particles.length < this.maxParticles; i++) {
        const t = Math.random();
        const lifetime = 200 + Math.random() * 200;
        const perpX = -(tgtPos.y - srcPos.y);
        const perpY = tgtPos.x - srcPos.x;
        const perpLen = Math.sqrt(perpX * perpX + perpY * perpY) || 1;
        const scatter = (Math.random() - 0.5) * 0.15;

        this.particles.push({
          ms: 0,
          lifetimeMs: lifetime,
          position: new Vector3(
            srcPos.x + (tgtPos.x - srcPos.x) * t + (perpX / perpLen) * scatter,
            srcPos.y + (tgtPos.y - srcPos.y) * t + (perpY / perpLen) * scatter,
            0
          ),
          velocity: new Vector3(
            (tgtPos.x - srcPos.x) * 0.001,
            (tgtPos.y - srcPos.y) * 0.001,
            0
          ),
          size: 0.08 + Math.random() * 0.08,
          color: BEAM_COLOR_INNER.clone().lerp(BEAM_COLOR_OUTER, Math.random()),
          opacity: 0.8,
          t,
          seed: Math.random()
        });
      }
    }

    // Update particles
    const newParticles: BeamParticle[] = [];
    for (const p of this.particles) {
      p.ms += ms;
      if (p.ms > p.lifetimeMs) continue;

      // Move along beam direction slightly + drift toward target
      if (sourceEntity && targetEntity) {
        const progress = p.t + p.ms / p.lifetimeMs * 0.3;
        const baseX = srcPos.x + (tgtPos.x - srcPos.x) * Math.min(1, progress);
        const baseY = srcPos.y + (tgtPos.y - srcPos.y) * Math.min(1, progress);
        // Gentle wobble
        const wobble = Math.sin(p.ms * 0.01 + p.seed * 10) * 0.05;
        const perpX = -(tgtPos.y - srcPos.y);
        const perpY = tgtPos.x - srcPos.x;
        const perpLen = Math.sqrt(perpX * perpX + perpY * perpY) || 1;
        p.position.x = baseX + (perpX / perpLen) * wobble;
        p.position.y = baseY + (perpY / perpLen) * wobble;
      }

      // Fade in/out
      const lifeRatio = p.ms / p.lifetimeMs;
      if (lifeRatio < 0.2) {
        p.opacity = lifeRatio / 0.2;
      } else {
        p.opacity = 1 - (lifeRatio - 0.2) / 0.8;
      }

      newParticles.push(p);
    }
    this.particles = newParticles;

    // Update geometry buffers
    const { geom, vtxInstancePos, vtxInstanceSize, vtxInstanceColor } = this;
    for (let pi = 0; pi < this.particles.length; pi++) {
      const p = this.particles[pi];
      p.position.toArray(vtxInstancePos, pi * 3);
      vtxInstanceSize[pi] = p.size;
      p.color.toArray(vtxInstanceColor, pi * 4);
      vtxInstanceColor[pi * 4 + 3] = p.opacity;
    }
    geom.instanceCount = this.particles.length;
    geom.getAttribute("iPosition").needsUpdate = true;
    geom.getAttribute("iSize").needsUpdate = true;
    geom.getAttribute("iColor").needsUpdate = true;

    // Auto-remove when all particles are gone and we're done emitting
    if (!emitting && this.particles.length === 0) {
      this.level?.removeEntity(this.id);
    }
  }
}
