import {
  AdditiveBlending,
  BufferAttribute,
  Color,
  IUniform,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  Object3D,
  PlaneGeometry,
  ShaderMaterial,
  Sphere,
  Vector3
} from "three";

import { Conversation } from "src/api/conversation";
import { EntityLevelAPI, EntityProps } from "src/api/entity";
import { typedEmitterPromise } from "src/api/util";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import {
  InteractionBehavior,
  InteractionProviderEvents
} from "src/entities/environment/behaviors/InteractionBehavior";
import { OverlayConversation } from "src/entities/ui/OverlayConversation";

import coreFrag from "./shaders/hintGlimmerCoreFrag.glsl";
import coreVert from "./shaders/hintGlimmerCoreVert.glsl";
import haloFrag from "./shaders/hintGlimmerHaloFrag.glsl";
import haloVert from "./shaders/hintGlimmerHaloVert.glsl";
import particleFrag from "./shaders/hintGlimmerParticleFrag.glsl";
import particleVert from "./shaders/hintGlimmerParticleVert.glsl";

export type HintGlimmerProps = EntityProps & {
  conversation?: Conversation<string, string>;
  interactOnce?: boolean;
};

type GlimmerParticle = {
  orbitAngle: number;
  orbitSpeed: number;
  radiusRatio: number;
  wobbleFreq: number;
  wobblePhase: number;
  wobbleAmp: number;
  jitterFreq: number;
  jitterPhase: number;
  hueOffset: number;
  sizeBase: number;
  twinkleFreq: number;
  twinklePhase: number;
  deathAt: number;
  drift: Vector3;
};

const kParticleCount = 240;
const kBaseRadius = 0.45;
const kDissipateWindow = 0.15;
const kDissipateDurationMs = 2800;
const kFocusInMs = 1500;
const kFocusOutMs = 700;
const kHaloSizeUnfocused = 7;
const kHaloSizeFocused = 4.5;
const kHaloAlphaUnfocused = 0.05;
const kHaloAlphaFocused = 0.085;

export class HintGlimmer extends CoreEntity {
  static readonly type = "HintGlimmer";
  public readonly type = HintGlimmer.type;

  public object3D = new Object3D();

  public behaviors = {
    interaction: new InteractionBehavior()
  };

  private readonly conversation?: Conversation<string, string>;
  private readonly interactOnce: boolean;

  private conversationOpen = false;
  private consumed = false;
  private overlayConversation?: OverlayConversation;

  private playerInRange = false;
  private playerWasInRange = false;

  private timeS = 0;
  private twinkleTime = 0;
  private focusT = 0;
  private focus = 0;
  private surge = 0;
  private dissipateT = 0;

  private particles: GlimmerParticle[] = [];
  private particleGeom: InstancedBufferGeometry;
  private particleMaterial: ShaderMaterial;
  private particleMesh: Mesh;
  private vtxInstancePos: Float32Array;
  private vtxInstanceSize: Float32Array;
  private vtxInstanceColor: Float32Array;

  private haloMaterial: ShaderMaterial & {
    uniforms: ShaderMaterial["uniforms"] & {
      uSizeScale: IUniform<number>;
      uAlphaScale: IUniform<number>;
    };
  };
  private haloMesh: Mesh;

  private coreGeom: PlaneGeometry;
  private coreMaterial: ShaderMaterial & {
    uniforms: ShaderMaterial["uniforms"] & {
      uPhase: IUniform<number>;
      uStrength: IUniform<number>;
    };
  };
  private coreMesh: Mesh;

  private readonly scratchColor = new Color();
  private readonly white = new Color(1, 1, 1);

  constructor(props: HintGlimmerProps) {
    super(props);

    this.conversation = props.conversation;
    this.interactOnce = props.interactOnce ?? false;

    if (!this.size.width || !this.size.height) {
      this.size = { width: 2.5, height: 2 };
    }

    this.behaviors.interaction.init(this);
    this.behaviors.interaction.promptYOffset = 1;
    this.behaviors.interaction.enabled = !!this.conversation;

    this.behaviors.interaction.events.on(
      InteractionProviderEvents.IntersectingPlayer,
      () => {
        this.playerInRange = true;
      }
    );
    this.behaviors.interaction.events.on(
      InteractionProviderEvents.Interact,
      () => {
        if (this.conversationOpen || this.consumed) return;
        if (!this.conversation) return;
        this.runConversation(this.conversation);
      }
    );

    for (let i = 0; i < kParticleCount; i++) {
      const driftDirection = Math.random() * Math.PI * 2;
      this.particles.push({
        orbitAngle: Math.random() * Math.PI * 2,
        orbitSpeed:
          (0.2 + Math.random() * 0.8) * (Math.random() < 0.5 ? -1 : 1),
        radiusRatio: 0.25 + 0.75 * Math.sqrt(Math.random()),
        wobbleFreq: 0.5 + Math.random() * 2.5,
        wobblePhase: Math.random() * Math.PI * 2,
        wobbleAmp: 0.08 + Math.random() * 0.22,
        jitterFreq: 2 + Math.random() * 6,
        jitterPhase: Math.random() * Math.PI * 2,
        hueOffset: Math.random(),
        sizeBase: 0.035 + Math.random() * 0.075,
        twinkleFreq: 2 + Math.random() * 6,
        twinklePhase: Math.random() * Math.PI * 2,
        deathAt: Math.random() * (1 - kDissipateWindow),
        drift: new Vector3(
          Math.cos(driftDirection) * 0.4,
          0.5 + Math.sin(driftDirection) * 0.3,
          0
        )
      });
    }

    this.particleGeom = new InstancedBufferGeometry();
    const vtxPos = new Float32Array(18);
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
    this.vtxInstancePos = new Float32Array(kParticleCount * 3);
    this.vtxInstanceSize = new Float32Array(kParticleCount);
    this.vtxInstanceColor = new Float32Array(kParticleCount * 4);
    this.particleGeom.setAttribute("position", new BufferAttribute(vtxPos, 3));
    this.particleGeom.setAttribute(
      "iPosition",
      new InstancedBufferAttribute(this.vtxInstancePos, 3)
    );
    this.particleGeom.setAttribute(
      "iSize",
      new InstancedBufferAttribute(this.vtxInstanceSize, 1)
    );
    this.particleGeom.setAttribute(
      "iColor",
      new InstancedBufferAttribute(this.vtxInstanceColor, 4)
    );
    this.particleGeom.instanceCount = kParticleCount;
    this.particleGeom.boundingSphere = new Sphere(new Vector3(), 4);

    this.particleMaterial = new ShaderMaterial({
      vertexShader: particleVert,
      fragmentShader: particleFrag,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending
    });
    this.particleMesh = new Mesh(this.particleGeom, this.particleMaterial);

    this.haloMaterial = new ShaderMaterial({
      vertexShader: haloVert,
      fragmentShader: haloFrag,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: {
        uSizeScale: { value: kHaloSizeUnfocused },
        uAlphaScale: { value: kHaloAlphaUnfocused }
      }
    }) as typeof this.haloMaterial;
    this.haloMesh = new Mesh(this.particleGeom, this.haloMaterial);
    this.haloMesh.position.z = -0.1;

    this.coreGeom = new PlaneGeometry(1.6, 1.6);
    this.coreMaterial = new ShaderMaterial({
      vertexShader: coreVert,
      fragmentShader: coreFrag,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: {
        uPhase: { value: 0 },
        uStrength: { value: 0 }
      }
    }) as typeof this.coreMaterial;
    this.coreMesh = new Mesh(this.coreGeom, this.coreMaterial);
    this.coreMesh.position.z = -0.05;

    this.object3D.add(this.haloMesh);
    this.object3D.add(this.coreMesh);
    this.object3D.add(this.particleMesh);
    this.object3D.position.copy(this.position);
    this.object3D.position.z = 3;
  }

  step(ms: number) {
    this.playerInRange = false;
    super.step(ms);

    if (this.playerInRange && !this.playerWasInRange) this.surge = 0.6;
    this.playerWasInRange = this.playerInRange;

    this.timeS += ms / 1000;

    const focusTarget =
      this.playerInRange && !this.consumed && !this.conversationOpen ? 1 : 0;
    if (focusTarget > this.focusT) {
      this.focusT = Math.min(1, this.focusT + ms / kFocusInMs);
    } else if (focusTarget < this.focusT) {
      this.focusT = Math.max(0, this.focusT - ms / kFocusOutMs);
    }
    this.focus = this.focusT * this.focusT * (3 - 2 * this.focusT);
    this.surge *= Math.exp(-ms / 600);
    this.twinkleTime += (ms / 1000) * (1 + 0.8 * this.focus);

    if (this.consumed) {
      this.dissipateT += ms / kDissipateDurationMs;
      if (this.dissipateT >= 1.05) {
        this.level?.removeEntity(this.id);
        return;
      }
    }

    this.updateParticles(ms);

    this.haloMaterial.uniforms.uSizeScale.value =
      kHaloSizeUnfocused + (kHaloSizeFocused - kHaloSizeUnfocused) * this.focus;
    this.haloMaterial.uniforms.uAlphaScale.value =
      kHaloAlphaUnfocused +
      (kHaloAlphaFocused - kHaloAlphaUnfocused) * this.focus +
      0.02 * this.surge;

    this.coreMaterial.uniforms.uPhase.value = this.timeS;
    this.coreMaterial.uniforms.uStrength.value =
      0.22 * this.focus * (1 - Math.min(1, this.dissipateT * 1.6));

    this.object3D.position.copy(this.position);
    this.object3D.position.y += Math.sin(this.timeS * 1.2) * 0.07;
    this.object3D.position.z = 3;
  }

  private updateParticles(ms: number) {
    const t = this.timeS;
    const chaos = (1 - 0.6 * this.focus) * (1 + 1.5 * this.surge);
    const speedScale = 1 + 1.2 * this.surge + 0.5 * this.focus;
    const silhouette = kBaseRadius * (1 - 0.35 * this.focus);
    const morphX = 1 + 0.08 * Math.sin(t * 0.7);
    const morphY = 1 + 0.08 * Math.sin(t * 0.9 + 2);

    for (let i = 0; i < this.particles.length; i++) {
      const particle = this.particles[i];

      particle.orbitAngle += particle.orbitSpeed * speedScale * (ms / 1000);
      const wobble =
        1 +
        particle.wobbleAmp *
          chaos *
          Math.sin(t * particle.wobbleFreq + particle.wobblePhase);
      const radius = particle.radiusRatio * silhouette * wobble;
      const jitter =
        0.045 *
        chaos *
        Math.sin(t * particle.jitterFreq + particle.jitterPhase);

      let x = Math.cos(particle.orbitAngle) * radius * morphX + jitter;
      let y =
        Math.sin(particle.orbitAngle) * radius * morphY +
        0.045 *
          chaos *
          Math.sin(t * particle.jitterFreq * 0.8 + particle.jitterPhase + 1.7);

      let alive = 1;
      if (this.consumed) {
        const dieProgress = Math.min(
          1,
          Math.max(0, (this.dissipateT - particle.deathAt) / kDissipateWindow)
        );
        alive = 1 - dieProgress;
        x += particle.drift.x * dieProgress;
        y += particle.drift.y * dieProgress;
      }

      const twinkle =
        0.55 +
        0.45 *
          Math.sin(
            this.twinkleTime * particle.twinkleFreq + particle.twinklePhase
          );
      const hue = (particle.hueOffset + t * 0.06) % 1;
      this.scratchColor.setHSL(hue, 1, 0.62);
      this.scratchColor.lerp(this.white, this.focus * 0.85);

      this.vtxInstancePos[i * 3] = x;
      this.vtxInstancePos[i * 3 + 1] = y;
      this.vtxInstancePos[i * 3 + 2] = 0;
      this.vtxInstanceSize[i] = particle.sizeBase * (0.8 + 0.4 * twinkle);
      this.scratchColor.toArray(this.vtxInstanceColor, i * 4);
      this.vtxInstanceColor[i * 4 + 3] = 0.9 * twinkle * alive;
    }

    this.particleGeom.getAttribute("iPosition").needsUpdate = true;
    this.particleGeom.getAttribute("iSize").needsUpdate = true;
    this.particleGeom.getAttribute("iColor").needsUpdate = true;
  }

  private async runConversation(
    conversationData: Conversation<string, string>
  ) {
    const level = this.level;
    if (!level) return;

    this.conversationOpen = true;
    this.behaviors.interaction.disable();

    const overlay = new OverlayConversation({
      position: this.position.clone(),
      conversation: conversationData
    });
    this.overlayConversation = overlay;

    const completion = typedEmitterPromise(
      overlay.conversationEvents,
      "complete"
    );
    level.addEntity(overlay);
    await completion;

    overlay.manualDetach();
    this.overlayConversation = undefined;
    this.conversationOpen = false;

    if (this.interactOnce) this.consumed = true;
    else this.behaviors.interaction.enable();
  }

  detachFromLevel(level: EntityLevelAPI): void {
    this.overlayConversation?.manualDetach();
    this.overlayConversation = undefined;

    super.detachFromLevel(level);
  }

  destroy(): void {
    super.destroy();
    this.particleGeom.dispose();
    this.particleMaterial.dispose();
    this.haloMaterial.dispose();
    this.coreGeom.dispose();
    this.coreMaterial.dispose();
  }
}
