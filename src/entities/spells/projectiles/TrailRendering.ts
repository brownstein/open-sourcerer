import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
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
import { RenderLayers } from "src/engine/constants/renderLayers";

import fireballShaderFrag from "./shaders/fireballShaderFrag.glsl";
import fireballShaderVert from "./shaders/fireballShaderVert.glsl";

export enum TravelEvents {
  reachedDestination = "reachedDestination",
  notReachedDestination = "notReachedDestination"
}

export type TravelEventsTypes = {
  [TravelEvents.reachedDestination]: void;
  [TravelEvents.notReachedDestination]: void;
};

export class TrailRenderingBehavior implements EntityBehavior {
  public type = "TrailRendering";
  public colorInner = new Color(1, 1, 0);
  public colorOuter = new Color(1, 0.3, 0);
  public colorTrail = new Color(0.8, 0, 0);
  public opacityInner = 1;
  public opacityOuter = 0.8;
  public mesh?: Mesh;
  public radius: number = 0.05;
  public object3D = new Object3D();
  public material?: ShaderMaterial;
  private entity?: BaseEntityType;
  private entityPositionDelta = new Vector3();
  private entityPositionPrevious = new Vector3();
  private headSteps = 8;
  private headGeom?: BufferGeometry;
  private trailPositions: [Vector3, Vector3, number, Vector3][] = [];
  public trailMaxLength = 20;
  public trailLengthMs = 150;
  private trailGeom?: BufferGeometry;
  private trailVtxPos?: Float32Array;
  private trailVtxColor?: Float32Array;
  private trailVtxOpacity?: Float32Array;
  public trailTurbulence: number = 0.002;
  public trailDelta = new Vector3(0, 0.02, 0);
  public trailJitter: number = 0;
  constructor() {
    this.step = this.step.bind(this);
  }
  init(entity: BaseEntityType) {
    this.entity = entity;
    this.entity.events.on(EntityLifecycleEvents.Step, this.step);
    this.entityPositionPrevious.copy(entity.position);
    this.entity.object3D?.add(this.object3D);

    const {
      colorInner,
      colorOuter,
      radius,
      headSteps,
      trailMaxLength,
      opacityInner,
      opacityOuter
    } = this;

    this.material = new ShaderMaterial({
      fragmentShader: fireballShaderFrag,
      vertexShader: fireballShaderVert,
      transparent: true,
      uniforms: {
        opacity: {
          value: 1
        },
        color: {
          value: new Color(1, 1, 1)
        }
      },
      side: DoubleSide
    });

    this.headGeom = new BufferGeometry();
    const headVtxIndex = new Uint16Array(this.headSteps * 3);
    const headVtxPos = new Float32Array(this.headSteps * 3 + 3);
    const headVtxColor = new Float32Array(this.headSteps * 3 + 3);
    const headVtxOpacity = new Float32Array(this.headSteps + 1);
    for (let vi = 0; vi < headSteps; vi++) {
      headVtxIndex[vi * 3 + 0] = 0;
      headVtxIndex[vi * 3 + 1] = vi + 1;
      headVtxIndex[vi * 3 + 2] = ((vi + 1) % this.headSteps) + 1;
    }
    colorInner.toArray(headVtxColor, 0);
    headVtxOpacity[0] = opacityInner;
    for (let vi = 0; vi < headSteps; vi++) {
      headVtxPos[vi * 3 + 3] =
        radius * Math.cos((vi * Math.PI * 2) / headSteps);
      headVtxPos[vi * 3 + 4] =
        radius * Math.sin((vi * Math.PI * 2) / headSteps);
      colorOuter.toArray(headVtxColor, vi * 3 + 3);
      headVtxOpacity[vi + 1] = opacityOuter;
    }
    this.headGeom.setIndex(new BufferAttribute(headVtxIndex, 1));
    this.headGeom.setAttribute("position", new BufferAttribute(headVtxPos, 3));
    this.headGeom.setAttribute(
      "vtxColor",
      new BufferAttribute(headVtxColor, 3)
    );
    this.headGeom.setAttribute(
      "vtxOpacity",
      new BufferAttribute(headVtxOpacity, 1)
    );
    const headMesh = new Mesh(this.headGeom, this.material);
    headMesh.layers.set(RenderLayers.default);
    this.object3D.add(headMesh);

    this.trailGeom = new BufferGeometry();
    const trailVtxCount = 3 * this.trailMaxLength;
    const trailTriCount = 4 * this.trailMaxLength;
    const trailVtxIndex = new Uint16Array(trailTriCount * 3);
    const trailVtxPos = new Float32Array(trailVtxCount * 3);
    const trailVtxColor = new Float32Array(trailVtxCount * 3);
    const trailVtxOpacity = new Float32Array(trailVtxCount);
    for (let ti = 0; ti < trailMaxLength - 1; ti++) {
      trailVtxIndex[ti * 12 + 0] = ti * 3 + 0;
      trailVtxIndex[ti * 12 + 1] = ti * 3 + 3;
      trailVtxIndex[ti * 12 + 2] = ti * 3 + 1;

      trailVtxIndex[ti * 12 + 3] = ti * 3 + 1;
      trailVtxIndex[ti * 12 + 4] = ti * 3 + 3;
      trailVtxIndex[ti * 12 + 5] = ti * 3 + 4;

      trailVtxIndex[ti * 12 + 6] = ti * 3 + 1;
      trailVtxIndex[ti * 12 + 7] = ti * 3 + 4;
      trailVtxIndex[ti * 12 + 8] = ti * 3 + 2;

      trailVtxIndex[ti * 12 + 9] = ti * 3 + 2;
      trailVtxIndex[ti * 12 + 10] = ti * 3 + 4;
      trailVtxIndex[ti * 12 + 11] = ti * 3 + 5;
    }
    for (let ti = 0; ti < trailMaxLength; ti++) {
      colorOuter.toArray(trailVtxColor, ti * 9 + 0);
      colorInner.toArray(trailVtxColor, ti * 9 + 3);
      colorOuter.toArray(trailVtxColor, ti * 9 + 6);
    }
    this.trailVtxPos = trailVtxPos;
    this.trailVtxColor = trailVtxColor;
    this.trailVtxOpacity = trailVtxOpacity;
    this.trailGeom.setIndex(new BufferAttribute(trailVtxIndex, 1));
    this.trailGeom.setAttribute(
      "position",
      new BufferAttribute(trailVtxPos, 3)
    );
    this.trailGeom.setAttribute(
      "vtxColor",
      new BufferAttribute(trailVtxColor, 3)
    );
    this.trailGeom.setAttribute(
      "vtxOpacity",
      new BufferAttribute(trailVtxOpacity, 1)
    );
    const trailMesh = new Mesh(this.trailGeom, this.material);
    trailMesh.layers.set(RenderLayers.default);
    this.object3D.add(trailMesh);

    return this;
  }
  destroy() {
    this.headGeom?.dispose();
    this.trailGeom?.dispose();
    this.material?.dispose();
  }
  setOpacity(opacity: number) {
    if (!this.material) return;
    this.material.uniforms.opacity.value = opacity;
    this.material.uniformsNeedUpdate = true;
  }
  step(ms: number) {
    const {
      entity,
      entityPositionDelta,
      entityPositionPrevious,
      opacityInner,
      opacityOuter,
      colorInner,
      colorOuter,
      colorTrail,
      trailGeom,
      trailPositions,
      trailTurbulence,
      trailJitter,
      trailVtxColor,
      trailVtxOpacity,
      trailVtxPos,
      trailDelta,
      trailLengthMs,
      radius
    } = this;
    if (
      !entity ||
      !trailGeom ||
      !trailVtxColor ||
      !trailVtxOpacity ||
      !trailVtxPos
    )
      return;

    // Update position delta.
    entityPositionDelta.copy(entity.position).sub(entityPositionPrevious);

    // Update previous position so we can take another delta next frame.
    entityPositionPrevious.copy(entity.position);

    // Update trail positions with those deltas.
    for (const trailNode of trailPositions) {
      trailNode[0]
        .sub(entityPositionDelta)
        .add(trailDelta)
        .add(trailNode[1].clone().multiplyScalar(ms));
      trailNode[2] += ms;
    }

    // Unshift trail.
    const randVel = new Vector3(
      (Math.random() - 0.5) * trailTurbulence,
      (Math.random() - 0.5) * trailTurbulence,
      0
    );
    // Persist a jitter offset perpendicular to the flight path for zigzag (lightning)
    const nodeJitterVec = new Vector3();
    if (trailJitter > 0 && entityPositionDelta.lengthSq() > 0) {
      // Perpendicular to entity movement direction
      const prevJitter = trailPositions[0]?.[3];
      const prevDot = prevJitter instanceof Vector3
        ? prevJitter.x * (-entityPositionDelta.y) + prevJitter.y * entityPositionDelta.x
        : 0;
      const sign = prevDot >= 0 ? -1 : 1;
      const mag = sign * (0.5 + Math.random() * 0.5) * trailJitter;
      nodeJitterVec.set(-entityPositionDelta.y, entityPositionDelta.x, 0)
        .normalize()
        .multiplyScalar(mag);
    }
    trailPositions.unshift([new Vector3(), randVel, 0, nodeJitterVec]);
    if (trailPositions.length > this.trailMaxLength) trailPositions.pop();
    if ((trailPositions.at(-1)?.[2] ?? 0) >= trailLengthMs)
      trailPositions.pop();

    // Update vertex positions and opacities.
    const colorI = new Color();
    const colorO = new Color();
    const tangent = new Vector3();
    const normal = new Vector3();
    const pt = new Vector3();
    const jitterOffset = new Vector3();
    for (let ti = 0; ti < trailPositions.length - 1; ti++) {
      const tIntensity = 1 - ti / trailPositions.length;
      tangent.copy(trailPositions[ti + 1][0]).sub(trailPositions[ti][0]);
      normal.x = -tangent.y;
      normal.y = tangent.x;
      normal.z = tangent.z;
      normal.normalize();
      // Apply persisted per-node jitter for zigzag (lightning) effect
      const nodeJitterVec = trailPositions[ti][3];
      if (ti > 0 && nodeJitterVec instanceof Vector3 && nodeJitterVec.lengthSq() > 0) {
        jitterOffset.copy(nodeJitterVec).multiplyScalar(tIntensity);
      } else {
        jitterOffset.set(0, 0, 0);
      }
      pt.copy(normal)
        .multiplyScalar(radius * tIntensity)
        .add(trailPositions[ti][0])
        .add(jitterOffset)
        .toArray(trailVtxPos, ti * 9 + 0);
      pt.copy(trailPositions[ti][0])
        .add(jitterOffset)
        .toArray(trailVtxPos, ti * 9 + 3);
      pt.copy(normal)
        .multiplyScalar(-radius * tIntensity)
        .add(trailPositions[ti][0])
        .add(jitterOffset)
        .toArray(trailVtxPos, ti * 9 + 6);
      colorI.copy(colorInner).lerp(colorTrail, 1 - tIntensity);
      colorO.copy(colorOuter).lerp(colorTrail, 1 - tIntensity);
      colorO.toArray(trailVtxColor, ti * 9 + 0);
      colorI.toArray(trailVtxColor, ti * 9 + 3);
      colorO.toArray(trailVtxColor, ti * 9 + 6);
      trailVtxOpacity[ti * 3 + 0] = tIntensity * opacityOuter;
      trailVtxOpacity[ti * 3 + 1] = tIntensity * opacityInner;
      trailVtxOpacity[ti * 3 + 2] = tIntensity * opacityOuter;
    }
    const lastPointInTrail = trailPositions.at(-1)?.[0];
    lastPointInTrail?.toArray(trailVtxPos, (trailPositions.length - 1) * 9 + 0);
    lastPointInTrail?.toArray(trailVtxPos, (trailPositions.length - 1) * 9 + 3);
    lastPointInTrail?.toArray(trailVtxPos, (trailPositions.length - 1) * 9 + 6);
    trailVtxOpacity[(trailPositions.length - 1) * 3 + 0] = 0;
    trailVtxOpacity[(trailPositions.length - 1) * 3 + 1] = 0;
    trailVtxOpacity[(trailPositions.length - 1) * 3 + 2] = 0;

    trailGeom.getAttribute("position").needsUpdate = true;
    trailGeom.getAttribute("vtxColor").needsUpdate = true;
    trailGeom.getAttribute("vtxOpacity").needsUpdate = true;

    trailGeom.computeBoundingSphere();

    // Update head geometry colors to reflect current colorInner/colorOuter
    if (this.headGeom) {
      const headVtxColor = this.headGeom.getAttribute(
        "vtxColor"
      ) as BufferAttribute;
      if (headVtxColor) {
        colorInner.toArray(headVtxColor.array as Float32Array, 0);
        for (let vi = 0; vi < this.headSteps; vi++) {
          colorOuter.toArray(headVtxColor.array as Float32Array, vi * 3 + 3);
        }
        headVtxColor.needsUpdate = true;
      }
    }
  }
}
