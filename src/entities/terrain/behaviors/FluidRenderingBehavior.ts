import {
  BufferAttribute,
  BufferGeometry,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  Texture
} from "three";

import { BaseEntityType } from "src/api/entity";
import { ColorRepresentation } from "src/api/util";
import { RenderLayers } from "src/engine/constants/renderLayers";
import { CoreBehavior } from "src/engine/entity/CoreBehaviors";
import * as TiledLevelAPI from "src/engine/level/tiled/api";

import {
  FluidPhysicsBehavior,
  FluidPhysicsEvents
} from "./FluidPhysicsBehavior";

export class FluidRenderingBehavior implements CoreBehavior {
  public type = "FluidRendering";
  public object3D = new Object3D();
  private entity?: BaseEntityType;
  private physics?: FluidPhysicsBehavior;
  private mesh?: Mesh;
  private geom?: BufferGeometry;
  private material?: MeshBasicMaterial;
  private posArr?: Float32Array;
  private uvArr?: Float32Array;
  private indexArr?: Uint16Array;
  private texture?: Texture;
  private color: ColorRepresentation = "#4488ff";
  constructor() {
    this.initWithPhysics = this.initWithPhysics.bind(this);
    this.stepUpdated = this.stepUpdated.bind(this);
  }
  init(entity: BaseEntityType) {
    this.entity = entity;
    this.entity.object3D?.add(this.object3D);
    return this;
  }
  destroy() {
    this.geom?.dispose();
    this.material?.dispose();
  }
  setPhysics(physics: FluidPhysicsBehavior) {
    this.physics = physics;
    this.physics.events.on(FluidPhysicsEvents.Init, this.initWithPhysics);
    this.physics.events.on(FluidPhysicsEvents.StepUpdated, this.stepUpdated);
    return this;
  }
  setTerrain(terrain: TiledLevelAPI.MapTerrain) {
    return this;
  }
  setTexture(texture: Texture) {
    this.texture = texture;
    return this;
  }
  setColor(color: ColorRepresentation) {
    this.color = color;
    if (this.material) this.material.color.set(this.color);
  }
  initWithPhysics() {
    if (!this.entity || !this.physics) return;
    this.geom = new BufferGeometry();
    this.posArr = new Float32Array(this.physics.surface.length * 12);
    this.uvArr = new Float32Array(this.physics.surface.length * 8);
    this.indexArr = new Uint16Array((this.physics.surface.length - 1) * 18);
    const surface = this.physics.surface;
    for (let i = 0; i < surface.length; i++) {
      const bucket = surface[i];
      const { x, boundsMin, boundsMax } = bucket;
      // Position.
      // vtx0
      this.posArr[i * 12 + 0] = x;
      this.posArr[i * 12 + 1] = boundsMin;
      this.posArr[i * 12 + 2] = 0;
      // vtx1
      this.posArr[i * 12 + 3] = x;
      this.posArr[i * 12 + 4] = Math.max(boundsMax - 1, boundsMin);
      this.posArr[i * 12 + 5] = 0;
      // vtx2
      this.posArr[i * 12 + 6] = x;
      this.posArr[i * 12 + 7] = Math.max(boundsMax - 0.125, boundsMin);
      this.posArr[i * 12 + 8] = 0;
      // vtx3
      this.posArr[i * 12 + 9] = x;
      this.posArr[i * 12 + 10] = boundsMax;
      this.posArr[i * 12 + 11] = -5; // Note the depth change on the upper surface.
      // UV.
      const u = i / surface.length;
      // vtx0
      this.uvArr[i * 8 + 0] = u;
      this.uvArr[i * 8 + 1] = Math.max(0, 1 - (boundsMax - boundsMin));
      // vtx1
      this.uvArr[i * 8 + 2] = u;
      this.uvArr[i * 8 + 3] = Math.max(
        0,
        Math.min(0.85, 1 - (boundsMax - 1 - boundsMin) * 0.15)
      );
      // vtx2
      this.uvArr[i * 8 + 4] = u;
      this.uvArr[i * 8 + 5] = 0.95;
      // vtx3
      this.uvArr[i * 8 + 6] = u;
      this.uvArr[i * 8 + 7] = 1;
      if (i < surface.length - 1) {
        // Indexes.
        // q0
        this.indexArr[i * 18 + 0] = i * 4 + 0;
        this.indexArr[i * 18 + 1] = i * 4 + 4;
        this.indexArr[i * 18 + 2] = i * 4 + 1;
        this.indexArr[i * 18 + 3] = i * 4 + 4;
        this.indexArr[i * 18 + 4] = i * 4 + 5;
        this.indexArr[i * 18 + 5] = i * 4 + 1;
        // q1
        this.indexArr[i * 18 + 6] = i * 4 + 1;
        this.indexArr[i * 18 + 7] = i * 4 + 5;
        this.indexArr[i * 18 + 8] = i * 4 + 2;
        this.indexArr[i * 18 + 9] = i * 4 + 5;
        this.indexArr[i * 18 + 10] = i * 4 + 6;
        this.indexArr[i * 18 + 11] = i * 4 + 2;
        // q2
        this.indexArr[i * 18 + 12] = i * 4 + 2;
        this.indexArr[i * 18 + 13] = i * 4 + 6;
        this.indexArr[i * 18 + 14] = i * 4 + 3;
        this.indexArr[i * 18 + 15] = i * 4 + 6;
        this.indexArr[i * 18 + 16] = i * 4 + 7;
        this.indexArr[i * 18 + 17] = i * 4 + 3;
      }
    }
    this.geom.setAttribute("position", new BufferAttribute(this.posArr, 3));
    this.geom.setAttribute("uv", new BufferAttribute(this.uvArr, 2));
    this.geom.setIndex(new BufferAttribute(this.indexArr, 1));
    this.geom.computeBoundingBox();
    this.material = new MeshBasicMaterial({
      opacity: 0.5,
      color: this.color,
      transparent: true,
      map: this.texture,
      depthTest: true
    });
    this.mesh = new Mesh(this.geom, this.material);
    this.mesh.layers.set(RenderLayers.default);
    this.mesh.renderOrder = 1;
    this.object3D.add(this.mesh);
  }
  stepUpdated() {
    if (!this.physics || !this.geom || !this.posArr || !this.uvArr) return;
    const surface = this.physics.surface;
    for (let i = 0; i < surface.length; i++) {
      const bucket = surface[i];
      const { boundsMax, boundsMin, offset } = bucket;
      // Update position.
      this.posArr[i * 12 + 4] = Math.max(
        boundsMin,
        Math.min(boundsMax - 1, boundsMax + offset)
      );
      this.posArr[i * 12 + 7] = Math.max(boundsMin, boundsMax + offset - 0.125);
      this.posArr[i * 12 + 10] = Math.max(boundsMin, boundsMax + offset);
      // Update UV.
      this.uvArr[i * 8 + 3] = Math.max(
        0,
        Math.min(0.85, 1 + (offset - 1) * 0.125 * 2)
      );
      this.uvArr[i * 8 + 5] = Math.max(
        0,
        Math.min(0.95, 1 + (offset - 0.125) * 0.125)
      );
      this.uvArr[i * 8 + 7] = Math.max(0, Math.min(1, 1 + offset * 0.125));
    }
    this.geom.getAttribute("position").needsUpdate = true;
    this.geom.getAttribute("uv").needsUpdate = true;
  }
}
