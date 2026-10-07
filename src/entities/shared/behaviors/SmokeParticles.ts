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

import {
  BaseEntityType,
  EntityBehavior,
  EntityLifecycleEvents
} from "src/api/entity";
import { kInvPixelScale, kPixelScale } from "src/engine/constants/scaling";
import { Scheduler } from "src/engine/scheduling/Scheduler";

import smokeShaderFrag from "./shaders/smokeShaderFrag.glsl";
import smokeShaderVert from "./shaders/smokeShaderVert.glsl";

export type SmokeParticle = {
  ms: number;
  lifetimeMs: number;
  position: Vector3;
  velocity: Vector3;
  size: number;
  color: Color;
  opacity: number;
};

export type SmokeParticleSettings = {
  color: Color;
  transform: (particle: SmokeParticle, ms: number) => void;
  msBetweenSpawn: number;
  lifetimeMs: number;
  lifetimeMsVariance?: number;
  roundPositions?: boolean;
};

export const defaultSmokeSettings: SmokeParticleSettings = {
  color: new Color(0.1, 0.1, 0.1),
  transform: (particle, ms) => {
    if (ms === 0) {
      particle.size = 0;
      particle.opacity = 1;
      particle.velocity.x = (Math.random() - 0.5) * 0.002;
      particle.velocity.y = (Math.random() - 0.5) * 0.002 + 0.002;
    } else {
      particle.size = 0.3 * (ms / particle.lifetimeMs);
      particle.opacity = (1 - ms / particle.lifetimeMs) * 0.5;
      particle.velocity.x *= 0.98;
    }
  },
  lifetimeMs: 400,
  lifetimeMsVariance: 50,
  msBetweenSpawn: 25
};

export class SmokeParticlesBehavior implements EntityBehavior {
  public type = "SmokeParticles";
  public maxParticles = 128;
  public object3D = new Object3D();
  public particleSettings: SmokeParticleSettings = { ...defaultSmokeSettings };
  public enableSpawn = true;
  private entity?: BaseEntityType;
  private geom?: InstancedBufferGeometry;
  private vtxInstancePos?: Float32Array;
  private vtxInstanceSize?: Float32Array;
  private vtxInstanceColor?: Float32Array;
  private material?: ShaderMaterial;
  private previousPosition = new Vector3();
  private particles: SmokeParticle[] = [];
  private scheduler = new Scheduler();
  private spawnMsPending = 0;
  constructor() {
    this.step = this.step.bind(this);
  }
  init(entity: BaseEntityType) {
    this.entity = entity;
    this.entity.events.on(EntityLifecycleEvents.Step, this.step);
    this.entity.object3D?.add(this.object3D);
    this.previousPosition.copy(entity.position);

    this.geom = new InstancedBufferGeometry();
    const vtxPos = new Float32Array(18);
    const vtxInstancePos = new Float32Array(this.maxParticles * 3);
    const vtxInstanceSize = new Float32Array(this.maxParticles);
    const vtxInstanceColor = new Float32Array(this.maxParticles * 4);
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
      new InstancedBufferAttribute(vtxInstancePos, 3)
    );
    this.geom.setAttribute(
      "iSize",
      new InstancedBufferAttribute(vtxInstanceSize, 1)
    );
    this.geom.setAttribute(
      "iColor",
      new InstancedBufferAttribute(vtxInstanceColor, 4)
    );
    this.geom.instanceCount = 0;
    this.vtxInstancePos = vtxInstancePos;
    this.vtxInstanceSize = vtxInstanceSize;
    this.vtxInstanceColor = vtxInstanceColor;

    this.material = new ShaderMaterial({
      fragmentShader: smokeShaderFrag,
      vertexShader: smokeShaderVert,
      side: DoubleSide,
      transparent: true
    });

    const mesh = new Mesh(this.geom, this.material);
    this.object3D.add(mesh);

    return this;
  }
  destroy() {
    this.geom?.dispose();
    this.material?.dispose();
  }
  step(ms: number) {
    this.scheduler.step(ms);
    const {
      entity,
      geom,
      particleSettings,
      vtxInstancePos,
      vtxInstanceSize,
      vtxInstanceColor
    } = this;
    if (
      !entity ||
      !geom ||
      !vtxInstancePos ||
      !vtxInstanceSize ||
      !vtxInstanceColor
    )
      return;

    // Resolve particle system motion delta.
    const systemDelta = entity.position
      .clone()
      .sub(this.previousPosition)
      .multiplyScalar(-1);
    this.previousPosition.copy(entity.position);

    // Update all particles.
    const newParticles: SmokeParticle[] = [];
    const delta = new Vector3();
    for (const particle of this.particles) {
      particle.ms += ms;
      if (particle.ms <= particle.lifetimeMs) {
        particleSettings.transform(particle, particle.ms);
        delta.copy(particle.velocity).multiplyScalar(ms);
        particle.position.add(delta).add(systemDelta);
        newParticles.push(particle);
      }
    }
    this.particles = newParticles;

    // Spawn a new particle if under max count.
    this.spawnMsPending += ms;
    while (
      this.enableSpawn &&
      this.spawnMsPending >= this.particleSettings.msBetweenSpawn &&
      this.particles.length < this.maxParticles
    ) {
      const newParticle: SmokeParticle = {
        ms: 0,
        lifetimeMs:
          particleSettings.lifetimeMs +
          (particleSettings.lifetimeMsVariance
            ? (Math.random() - 0.5) * particleSettings.lifetimeMsVariance
            : 0),
        color: particleSettings.color.clone(),
        opacity: 0,
        size: 0,
        position: new Vector3(),
        velocity: new Vector3()
      };
      particleSettings.transform(newParticle, 0);
      this.particles.push(newParticle);
      this.spawnMsPending -= this.particleSettings.msBetweenSpawn;
    }

    // Update geometry.
    geom.computeBoundingSphere();
    let rMaxSq = 0;
    const pos = new Vector3();
    const doRound = !!particleSettings.roundPositions;
    for (let pi = 0; pi < this.particles.length; pi++) {
      const particle = this.particles[pi];
      pos.copy(particle.position);
      if (doRound)
        pos.multiplyScalar(kPixelScale).round().multiplyScalar(kInvPixelScale);
      pos.toArray(vtxInstancePos, pi * 3);
      rMaxSq = Math.max(rMaxSq, particle.position.lengthSq());
      vtxInstanceSize[pi] = particle.size;
      particle.color.toArray(vtxInstanceColor, pi * 4);
      vtxInstanceColor[pi * 4 + 3] = particle.opacity;
    }
    if (geom.boundingSphere) {
      geom.boundingSphere.radius = Math.sqrt(rMaxSq);
    }
    geom.instanceCount = this.particles.length;
    geom.getAttribute("iPosition").needsUpdate = true;
    geom.getAttribute("iSize").needsUpdate = true;
    geom.getAttribute("iColor").needsUpdate = true;
  }
}
