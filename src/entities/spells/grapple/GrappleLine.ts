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

export type GrappleLineProps = EntityProps & {
  sourceEntityId: string;
  targetPosition?: { x: number; y: number };
  targetEntityId?: string;
  length: number;
  springiness: number;
};

type ArcParticle = {
  ms: number;
  lifetimeMs: number;
  position: Vector3;
  size: number;
  color: Color;
  opacity: number;
  /** 0-1 position along the beam */
  t: number;
  seed: number;
  /** which arc strand (0, 1, or 2) */
  strand: number;
};

const PINK_INNER = new Color(1.0, 0.4, 0.8);
const PINK_OUTER = new Color(0.8, 0.2, 0.6);
const PINK_BRIGHT = new Color(1.0, 0.7, 0.95);

const SPRING_FORCE_SCALE = 12;
const SPRING_DAMPING_SCALE = 0.5;

export class GrappleLine extends CoreEntity {
  static type = "GrappleLine";
  public type = GrappleLine.type;
  public object3D = new Object3D();

  private sourceEntityId: string;
  private targetPosition: { x: number; y: number } | null;
  private targetEntityId: string | null;

  private _length: number;
  private _springiness: number;

  private detached = false;

  private maxParticles = 384;
  private particles: ArcParticle[] = [];
  private geom: InstancedBufferGeometry;
  private material: ShaderMaterial;
  private vtxInstancePos: Float32Array;
  private vtxInstanceSize: Float32Array;
  private vtxInstanceColor: Float32Array;

  constructor(props: GrappleLineProps) {
    super(props);
    this.sourceEntityId = props.sourceEntityId;
    this.targetPosition = props.targetPosition ?? null;
    this.targetEntityId = props.targetEntityId ?? null;
    this._length = props.length;
    this._springiness = props.springiness;

    this.geom = new InstancedBufferGeometry();
    const vtxPos = new Float32Array(18);
    this.vtxInstancePos = new Float32Array(this.maxParticles * 3);
    this.vtxInstanceSize = new Float32Array(this.maxParticles);
    this.vtxInstanceColor = new Float32Array(this.maxParticles * 4);

    // Two triangles forming a quad
    vtxPos[0] = -0.5;
    vtxPos[1] = -0.5;
    vtxPos[3] = 0.5;
    vtxPos[4] = -0.5;
    vtxPos[6] = -0.5;
    vtxPos[7] = 0.5;
    vtxPos[9] = -0.5;
    vtxPos[10] = 0.5;
    vtxPos[12] = 0.5;
    vtxPos[13] = -0.5;
    vtxPos[15] = 0.5;
    vtxPos[16] = 0.5;

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

  get length() {
    return this._length;
  }

  get springiness() {
    return this._springiness;
  }

  setLength(newLength: number, transitionMs = 0) {
    if (transitionMs <= 0) {
      this._length = newLength;
      return;
    }
    const oldLength = this._length;
    this.scheduler.cancel("grapple-length-transition");
    this.scheduler.add({
      id: "grapple-length-transition",
      duration: transitionMs,
      invokeFunction: (t) => {
        this._length = oldLength + (newLength - oldLength) * t;
      },
      invokeFunctionAtComplete: () => {
        this._length = newLength;
      }
    });
  }

  setSpringiness(newSpringiness: number, transitionMs = 0) {
    if (transitionMs <= 0) {
      this._springiness = newSpringiness;
      return;
    }
    const oldSpringiness = this._springiness;
    this.scheduler.cancel("grapple-springiness-transition");
    this.scheduler.add({
      id: "grapple-springiness-transition",
      duration: transitionMs,
      invokeFunction: (t) => {
        this._springiness =
          oldSpringiness + (newSpringiness - oldSpringiness) * t;
      },
      invokeFunctionAtComplete: () => {
        this._springiness = newSpringiness;
      }
    });
  }

  detach() {
    this.detached = true;
  }

  private getTargetPos(): { x: number; y: number } | null {
    if (this.targetEntityId && this.level) {
      const entity = this.level.getEntity(this.targetEntityId);
      if (entity) {
        // Update cached position in case entity moves
        this.targetPosition = { x: entity.position.x, y: entity.position.y };
        return this.targetPosition;
      }
      // Target entity was destroyed — freeze at last known position
      this.targetEntityId = null;
    }
    return this.targetPosition;
  }

  private getSourceEntity(): BaseEntityType | null {
    if (!this.level) return null;
    return this.level.getEntity(this.sourceEntityId) as BaseEntityType | null;
  }

  private getTargetEntity(): BaseEntityType | null {
    if (!this.targetEntityId || !this.level) return null;
    return this.level.getEntity(this.targetEntityId) as BaseEntityType | null;
  }

  destroy() {
    super.destroy();
    this.geom?.dispose();
    this.material?.dispose();
  }

  step(ms: number) {
    super.step(ms);

    const sourceEntity = this.getSourceEntity();
    const targetPos = this.getTargetPos();
    const targetEntity = this.getTargetEntity();

    // Auto-destroy if source entity is gone
    if (!sourceEntity) {
      this.detached = true;
    }

    const emitting = !this.detached;

    const srcPos = sourceEntity?.position ?? this.position;
    const tgtPos = targetPos ?? { x: this.position.x, y: this.position.y };

    // Pull the source toward the target, and any target entity back toward the source
    if (emitting && sourceEntity && targetPos) {
      this.applySpringForce(sourceEntity, srcPos, tgtPos);
      if (targetEntity) {
        this.applySpringForce(targetEntity, tgtPos, srcPos);
      }
    }

    // Keep object3D at origin so particles use world coords
    this.object3D.position.set(0, 0, 0);

    // Spawn new particles along the beam
    if (emitting) {
      this.spawnParticles(ms, srcPos, tgtPos);
    }

    // Update existing particles
    this.updateParticles(ms, srcPos, tgtPos);

    // Write to GPU buffers
    this.flushBuffers();

    // Auto-remove when all particles are gone and we're detached
    if (this.detached && this.particles.length === 0) {
      this.level?.removeEntity(this.id);
    }
  }

  private applySpringForce(
    sourceEntity: BaseEntityType,
    srcPos: Vector3 | { x: number; y: number },
    tgtPos: { x: number; y: number }
  ) {
    const dx = tgtPos.x - srcPos.x;
    const dy = tgtPos.y - srcPos.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance < 0.01) return;

    // Only pull when stretched beyond rope length
    if (distance <= this._length) return;

    const stretch = distance - this._length;
    const nx = dx / distance;
    const ny = dy / distance;

    // Try to find a rigid body on the source entity to apply force
    const physics = (sourceEntity.behaviors as Record<string, unknown>)
      .physics as
      | {
          body?: {
            applyImpulse: (v: { x: number; y: number }, w: boolean) => void;
            linvel?: () => { x: number; y: number };
            mass: () => number;
          };
        }
      | undefined;
    if (!physics?.body) return;

    let ropeImpulse = this._springiness * stretch * SPRING_FORCE_SCALE;

    // Damp only the outward pull so a taut line catches you smoothly instead of
    // twanging you back. Motion toward the anchor is untouched, so reeling in
    // stays as snappy as before.
    const vel = physics.body.linvel?.();
    if (vel) {
      const approachSpeed = vel.x * nx + vel.y * ny;
      if (approachSpeed < 0) {
        ropeImpulse -= approachSpeed * this._springiness * SPRING_DAMPING_SCALE;
      }
    }

    const mass = physics.body.mass();
    physics.body.applyImpulse(
      { x: nx * ropeImpulse * mass, y: ny * ropeImpulse * mass },
      true
    );
  }

  private spawnParticles(
    ms: number,
    srcPos: Vector3 | { x: number; y: number },
    tgtPos: { x: number; y: number }
  ) {
    const spawnCount = Math.ceil(ms / 4); // ~1 per 4ms = high density
    for (
      let i = 0;
      i < spawnCount && this.particles.length < this.maxParticles;
      i++
    ) {
      const t = Math.random();
      const strand = Math.floor(Math.random() * 3);
      const lifetime = 80 + Math.random() * 100;

      // Pick color — mostly pink, occasional bright flash
      let color: Color;
      const roll = Math.random();
      if (roll < 0.15) {
        color = PINK_BRIGHT.clone();
      } else {
        color = PINK_INNER.clone().lerp(PINK_OUTER, Math.random());
      }

      const perpX = -(tgtPos.y - srcPos.y);
      const perpY = tgtPos.x - srcPos.x;
      const perpLen = Math.sqrt(perpX * perpX + perpY * perpY) || 1;
      const scatter = (Math.random() - 0.5) * 0.08;

      this.particles.push({
        ms: 0,
        lifetimeMs: lifetime,
        position: new Vector3(
          srcPos.x + (tgtPos.x - srcPos.x) * t + (perpX / perpLen) * scatter,
          srcPos.y + (tgtPos.y - srcPos.y) * t + (perpY / perpLen) * scatter,
          0
        ),
        size: 0.06 + Math.random() * 0.06,
        color,
        opacity: 0.9,
        t,
        seed: Math.random(),
        strand
      });
    }
  }

  private updateParticles(
    ms: number,
    srcPos: Vector3 | { x: number; y: number },
    tgtPos: { x: number; y: number }
  ) {
    const newParticles: ArcParticle[] = [];
    const perpX = -(tgtPos.y - srcPos.y);
    const perpY = tgtPos.x - srcPos.x;
    const perpLen = Math.sqrt(perpX * perpX + perpY * perpY) || 1;

    for (const p of this.particles) {
      p.ms += ms;
      if (p.ms > p.lifetimeMs) continue;

      // Position along beam with electric wobble
      const progress = p.t;
      const baseX = srcPos.x + (tgtPos.x - srcPos.x) * progress;
      const baseY = srcPos.y + (tgtPos.y - srcPos.y) * progress;

      // High-frequency wobble for electricity effect
      // Each strand has a different phase offset
      const strandOffset = p.strand * 2.1;
      const wobble =
        Math.sin(p.ms * 0.04 + p.seed * 20 + strandOffset) * 0.12 +
        Math.sin(p.ms * 0.09 + p.seed * 13) * 0.05;

      // Strand lateral offset so the 3 strands don't overlap
      const strandLateral = (p.strand - 1) * 0.04;

      p.position.x = baseX + (perpX / perpLen) * (wobble + strandLateral);
      p.position.y = baseY + (perpY / perpLen) * (wobble + strandLateral);

      // Fade in/out
      const lifeRatio = p.ms / p.lifetimeMs;
      if (lifeRatio < 0.15) {
        p.opacity = lifeRatio / 0.15;
      } else {
        p.opacity = 1 - (lifeRatio - 0.15) / 0.85;
      }

      newParticles.push(p);
    }
    this.particles = newParticles;
  }

  private flushBuffers() {
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
  }
}
