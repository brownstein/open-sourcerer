import { BufferAttribute, Color, DoubleSide, InstancedBufferAttribute, InstancedBufferGeometry, Mesh, Object3D, ShaderMaterial, Vector3 } from "three";

import { EntityProps } from "src/api/entity";
import { kInvPixelScale, kPixelScale } from "src/engine/constants/scaling";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import smokeShaderFrag from "src/entities/shared/behaviors/shaders/smokeShaderFrag.glsl";
import smokeShaderVert from "src/entities/shared/behaviors/shaders/smokeShaderVert.glsl";

export type FireworksProps = EntityProps & {};

export type FireworksParticle = {
  ms: number;
  lifetimeMs: number;
  position: Vector3;
  velocity: Vector3;
  size: number;
  color: Color;
  opacity: number;
  stage: number;
};

export class Fireworks extends CoreEntity {
  static type = "Fireworks";
  public type = Fireworks.type;
  public object3D = new Object3D();
  private particleColor = new Color(0.5, 0.8, 1);
  private particleColor2 = new Color(1, 1, 1);
  private maxParticles = 1000;
  private stage1ParticleCount = 3;
  private stage2ParticleCount = 250;
  private particles: FireworksParticle[] = [];
  private geom: InstancedBufferGeometry;
  private material: ShaderMaterial;
  private mesh: Mesh;
  private vtxInstancePos: Float32Array;
  private vtxInstanceSize: Float32Array;
  private vtxInstanceColor: Float32Array;
  constructor(props: FireworksProps) {
    super(props);

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

    this.mesh = new Mesh(this.geom, this.material);
    this.object3D.add(this.mesh);
    this.object3D.position
      .copy(this.position)
      .multiplyScalar(kPixelScale)
      .round()
      .multiplyScalar(kInvPixelScale);

    for (let i = 0; i < this.stage1ParticleCount; i++) {
      this.particles.push({
        ms: 0,
        lifetimeMs: 500 + 500 * Math.random(),
        position: new Vector3(),
        velocity: new Vector3(
          (0.5 - Math.random()) * 0.01,
          (1 - Math.random() * 0.25) * 0.01,
          0
        ),
        color: this.particleColor
          .clone()
          .lerp(this.particleColor2, Math.random()),
        size: 0.25,
        opacity: 1,
        stage: 1
      });
    }
  }
  destroy() {
    super.destroy();
    this.geom?.dispose();
    this.material?.dispose();
  }
  step(ms: number) {
    const { geom, vtxInstancePos, vtxInstanceSize, vtxInstanceColor } = this;
    super.step(ms);

    const newParticles: FireworksParticle[] = [];
    const delta = new Vector3();
    for (const particle of this.particles) {
      particle.ms += ms;
      if (particle.ms <= particle.lifetimeMs) {
        particle.velocity.multiplyScalar(Math.max(0, 1 - ms / 500));
        delta.copy(particle.velocity).multiplyScalar(ms);
        particle.position.add(delta);

        particle.opacity = Math.min(
          1,
          Math.max(0, (1 - particle.ms / particle.lifetimeMs) * 2)
        );

        newParticles.push(particle);
      } else {
        switch (particle.stage) {
          case 1: {
            for (let i = 0; i < this.stage2ParticleCount; i++) {
              const v = (Math.random() + 1) * 0.004;
              const d = Math.random() * Math.PI * 2;
              newParticles.push({
                ms: 0,
                lifetimeMs: 500 + 600 * Math.random(),
                position: particle.position.clone(),
                velocity: new Vector3(v * Math.cos(d), v * Math.sin(d), 0),
                color: this.particleColor
                  .clone()
                  .lerp(this.particleColor2, Math.random()),
                size: 0.125,
                opacity: 0,
                stage: 2
              });
            }
            break;
          }
        }
      }
    }
    this.particles = newParticles.slice(0, this.maxParticles);

    // Update geometry.
    geom.computeBoundingSphere();
    let rMaxSq = 0;
    const pos = new Vector3();
    for (let pi = 0; pi < this.particles.length; pi++) {
      const particle = this.particles[pi];
      pos.copy(particle.position);
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

    if (this.particles.length === 0) {
      this.level?.removeEntity(this.id);
    }
  }
}
