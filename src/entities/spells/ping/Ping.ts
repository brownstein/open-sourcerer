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
  EntityAlignment,
  EntityLevelAPI,
  EntityLifecycleEventTypes,
  EntityLifecycleEvents,
  EntityProps
} from "src/api/entity";
import { createTypedEventEmitter } from "src/api/util";
import { RenderLayers } from "src/engine/constants/renderLayers";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import { Text as TextEntity } from "src/entities/environment/Text";
import { isAnyTerrain } from "src/entities/terrain/allTerrain";

import fragmentShader from "./shaders/pingShaderFrag.glsl";
import vertexShader from "./shaders/pingShaderVert.glsl";

export enum PingEvents {
  Complete = "Complete"
}

export type PingFoundEntity = {
  id: string;
  type: string;
  position: { x: number; y: number };
  isEnemy: boolean;
};

export type PingProps = EntityProps & {};

export class Ping extends CoreEntity implements BaseEntityType {
  static type = "Ping";
  public type = "Ping";
  public events = createTypedEventEmitter<
    EntityLifecycleEventTypes & {
      [PingEvents.Complete]: PingFoundEntity[];
    }
  >();

  public object3D = new Object3D();

  private steps = 64;
  private color = new Color(0.5, 0.8, 1);
  private radius = 0;
  private maxRadius = 15;
  private growthRate = 0.015;

  private geom: BufferGeometry;
  private indexArr: Uint16Array;
  private posArr: Float32Array;
  private colorArr: Float32Array;
  private opacityArr: Float32Array;
  private material: ShaderMaterial;
  private mesh: Mesh;
  private examinedEntitiyIds = new Set<string>();

  public foundEntities: PingFoundEntity[] = [];

  constructor(props: PingProps) {
    super(props);

    this.geom = new BufferGeometry();

    const steps = this.steps;
    const _outerRadius = 1;
    const _innerRadius = 0.5;
    this.indexArr = new Uint16Array(steps * 6);
    this.posArr = new Float32Array(steps * 6);
    this.colorArr = new Float32Array(steps * 6);
    this.opacityArr = new Float32Array(steps * 2);

    // Index circle.
    for (let vi = 0; vi < steps - 1; vi++) {
      this.indexArr[vi * 6 + 0] = vi * 2 + 2;
      this.indexArr[vi * 6 + 1] = vi * 2 + 0;
      this.indexArr[vi * 6 + 2] = vi * 2 + 1;
      this.indexArr[vi * 6 + 3] = vi * 2 + 1;
      this.indexArr[vi * 6 + 4] = vi * 2 + 2;
      this.indexArr[vi * 6 + 5] = vi * 2 + 3;
    }

    // Index wrap around to complete the ring.
    this.indexArr[(steps - 1) * 6 + 0] = 0;
    this.indexArr[(steps - 1) * 6 + 1] = (steps - 1) * 2 + 0;
    this.indexArr[(steps - 1) * 6 + 2] = (steps - 1) * 2 + 1;
    this.indexArr[(steps - 1) * 6 + 3] = (steps - 1) * 2 + 1;
    this.indexArr[(steps - 1) * 6 + 4] = 0;
    this.indexArr[(steps - 1) * 6 + 5] = 1;

    // Positions.
    this.posArr.fill(0);

    // Colors.
    for (let vi = 0; vi < steps; vi++) {
      this.color.toArray(this.colorArr, vi * 6);
      this.color.toArray(this.colorArr, vi * 6 + 3);
    }

    // Opacity (TODO).
    this.opacityArr.fill(1);
    for (let vi = 0; vi < steps; vi++) {
      this.opacityArr[vi * 2 + 1] = 0;
    }

    this.geom.setIndex(new BufferAttribute(this.indexArr, 1));
    this.geom.setAttribute("position", new BufferAttribute(this.posArr, 3));
    this.geom.setAttribute("vtxColor", new BufferAttribute(this.colorArr, 3));
    this.geom.setAttribute(
      "vtxOpacity",
      new BufferAttribute(this.opacityArr, 1)
    );
    this.geom.computeBoundingSphere();

    this.material = new ShaderMaterial({
      vertexShader,
      fragmentShader,
      side: DoubleSide,
      transparent: true,
      uniforms: {
        opacity: {
          value: 1
        },
        color: {
          value: new Color(1, 1, 1)
        }
      }
    });

    this.mesh = new Mesh(this.geom, this.material);
    this.mesh.layers.set(RenderLayers.default);

    this.object3D.add(this.mesh);
    this.object3D.position.copy(this.position);
  }
  destroy(): void {
    super.destroy();
    this.geom.dispose();
    this.material.dispose();
  }
  step(ms: number) {
    super.step(ms);
    this.radius += ms * this.growthRate;

    if (this.radius > this.maxRadius) {
      this.events.emit(PingEvents.Complete as any, this.foundEntities);
      this.level?.removeEntity(this.id);
      this.destroy();
      return;
    }

    this.updateGeometry();

    const allEntities = this.level?.getEntities();
    if (allEntities) {
      for (const [entityId, entity] of allEntities) {
        if (this.examinedEntitiyIds.has(entityId)) continue;
        const bindable = entity.canBindToVariable;
        if (bindable === false) continue;
        if (isAnyTerrain(entity) && bindable === undefined) continue;
        const entityDistance = entity.position
          .clone()
          .sub(this.position)
          .length();
        if (entityDistance <= this.radius) {
          this.examinedEntitiyIds.add(entityId);
          this.foundEntities.push({
            // This is heavily incomplete, I think we need revisions here
            // when I have more clarity.
            id: entityId,
            type: entity.type,
            position: { x: entity.position.x, y: entity.position.y },
            isEnemy: entity.alignment === EntityAlignment.Enemy
          });
          if (entity.canBindToVariable && !entity.boundToVariableName) {
            this.level?.bindEntityToVariable(entityId);
            const label = new PingLabel({
              position: entity.position.clone(),
              binding: entity.boundToVariableName,
              boundEntity: entity
            });
            this.level?.addEntity(label);
          }
        }
      }
    }
  }
  private updateGeometry() {
    const outerRadius = this.radius;
    const innerRadius = Math.max(0, this.radius - 0.5);
    const steps = this.steps;
    for (let vi = 0; vi < steps; vi++) {
      const v6 = vi * 6;
      const theta = (vi * Math.PI * 2) / steps;
      const cosTheta = Math.cos(theta);
      const sinTheta = Math.sin(theta);
      this.posArr[v6 + 0] = outerRadius * cosTheta;
      this.posArr[v6 + 1] = outerRadius * sinTheta;
      this.posArr[v6 + 3] = innerRadius * cosTheta;
      this.posArr[v6 + 4] = innerRadius * sinTheta;
    }

    this.geom.getAttribute("position").needsUpdate = true;
    this.geom.computeBoundingSphere();

    this.material.uniforms.opacity.value = 1 - this.radius / this.maxRadius;
    this.material.uniformsNeedUpdate = true;
  }
}

export type PingLabelProps = EntityProps & {
  binding?: string;
  boundEntity?: BaseEntityType;
};
export class PingLabel extends CoreEntity implements BaseEntityType {
  public type = "PingLabel";
  static type = "PingLabel";

  private variableBindingText?: TextEntity;
  private boundEntity?: BaseEntityType;
  constructor(props: PingLabelProps) {
    super(props);
    const { binding = "( no binding )", boundEntity } = props;
    this.variableBindingText = new TextEntity({
      position: boundEntity?.position.clone() ?? new Vector3(),
      text: binding,
      textFont: "Geo",
      troika: true,
      textPixelSize: 9,
      textColor: "#ffffff",
      outline: true
    });
    this.boundEntity = boundEntity;
    boundEntity?.events.on(
      EntityLifecycleEvents.DetachFromLevel,
      this.onBoundEntityDetach
    );
  }
  private readonly onBoundEntityDetach = (level: EntityLevelAPI): void => {
    this.detachFromLevel(level);
  };
  postStep(deltaMs: number): void {
    super.postStep(deltaMs);
    if (this.boundEntity && this.variableBindingText) {
      this.position.copy(this.boundEntity.position);
      const entityHasStatus = "status" in this.boundEntity.behaviors;
      this.position.y +=
        this.boundEntity.size.height * 0.5 + (entityHasStatus ? 0.5 : 0);
      const status = (this.boundEntity.behaviors as any).status;
      if (status?.healthBar?.getOpacity() > 0) {
        this.position.y += 0.3;
      }
      this.variableBindingText.position.copy(this.position);
      this.variableBindingText.object3D?.position.copy(this.position);
    }
  }
  attachToLevel(level: EntityLevelAPI): void {
    super.attachToLevel(level);
    if (this.variableBindingText) level.addEntity(this.variableBindingText);
  }
  detachFromLevel(level: EntityLevelAPI): void {
    super.detachFromLevel(level);
    if (this.variableBindingText)
      level.removeEntity(this.variableBindingText.id);
  }
  destroy(): void {
    super.destroy();
    this.boundEntity?.events.off(
      EntityLifecycleEvents.DetachFromLevel,
      this.onBoundEntityDetach
    );
    this.variableBindingText?.destroy();
    this.variableBindingText = undefined;
  }
}
