import { Ball, Collider } from "@dimforge/rapier2d-compat";
import { Color, DoubleSide, Mesh, Object3D, ShaderMaterial } from "three";

import { BaseEntityType, EntityLevelAPI, EntityProps } from "src/api/entity";
import { createTypedEventEmitter } from "src/api/util";
import { kInvPixelScale, kPixelScale } from "src/engine/constants/scaling";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import { arr2 } from "src/engine/util/vecTypes";
import Line2DGeometry from "src/vendor/ThreeLine2D";

import sensorShaderFrag from "./sensorShaderFrag.glsl";
import sensorShaderVert from "./sensorShaderVert.glsl";

export enum SensorEvents {
  EntityContactStart = "EntityContactStart",
  EntityContactEnd = "EntityContactEnd"
}

export type SensorEventTypes = {
  [SensorEvents.EntityContactStart]: string;
  [SensorEvents.EntityContactEnd]: string;
};

export type SensorProps = EntityProps & {
  radius?: number;
};

export class Sensor extends CoreEntity implements BaseEntityType {
  static type = "Sensor";
  public type = "Sensor";
  public object3D = new Object3D();
  public radius = 1.5;
  public events = createTypedEventEmitter<SensorEventTypes>();
  public contactingIdSet = new Set<string>();

  private followingEntity?: BaseEntityType;

  private sensorShape?: Ball;
  private collider?: Collider;
  private _projectileContactsThisFrame = new Set<string>();

  private mesh?: Mesh;
  private threeLineGeom?: Line2DGeometry;
  private material?: ShaderMaterial;
  private opacity = 0;
  private fadingAway = false;

  constructor(props: SensorProps) {
    super(props);
    if (props.size) {
      this.radius = (this.size.width + this.size.height) * 0.5;
    }
    this.object3D.position
      .copy(this.position)
      .multiplyScalar(kPixelScale)
      .round()
      .multiplyScalar(kInvPixelScale);
  }
  attachToLevel(level: EntityLevelAPI): void {
    super.attachToLevel(level);
    this.sensorShape = new level.rapier.Ball(this.radius);
    // Create a real sensor collider so projectile raycasts can detect this sensor.
    const colliderDesc = level.rapier.ColliderDesc.ball(this.radius)
      .setSensor(true)
      .setTranslation(this.position.x, this.position.y);
    this.collider = level.world.createCollider(colliderDesc);
    level.registerSensor(this.id, this.collider.handle);
    this.updateMesh();
    this.setOpacity(0.75);
  }
  detachFromLevel(level: EntityLevelAPI): void {
    if (this.collider) level.world.removeCollider(this.collider, false);
    this.collider = undefined;
    super.detachFromLevel(level);
  }
  step(ms: number) {
    super.step(ms);
    if (this.fadingAway) return;
    if (this.followingEntity) {
      this.position.copy(this.followingEntity.position);
      if (!this.level?.getEntity(this.followingEntity.id)) {
        this.followingEntity = undefined;
        this.fadeAway();
        return;
      }
    } else {
      const player = [...(this.level?.getEntities().values() ?? [])].find(
        (e) => e.type === "Player"
      );
      if (player) this.position.copy(player.position);
    }
    if (!this.sensorShape) return;
    this.object3D.position
      .copy(this.position)
      .multiplyScalar(kPixelScale)
      .round()
      .multiplyScalar(kInvPixelScale);
    // Keep the physics collider in sync with our position.
    if (this.collider) {
      this.collider.setTranslation({ x: this.position.x, y: this.position.y });
    }
    const newContactingIdSet = new Set<string>();
    this.level?.world.intersectionsWithShape(
      this.position,
      0,
      this.sensorShape,
      (coll) => {
        const entityId = this.level?.getEntityIdForCollider(coll.handle);
        if (entityId) newContactingIdSet.add(entityId);
        return true;
      }
    );
    // Merge contacts from projectile raycasts that hit our collider.
    for (const id of this._projectileContactsThisFrame) {
      newContactingIdSet.add(id);
    }
    this._projectileContactsThisFrame.clear();
    for (const entityId of newContactingIdSet) {
      if (!this.contactingIdSet.has(entityId))
        this.events.emit(SensorEvents.EntityContactStart, entityId);
    }
    for (const entityId of this.contactingIdSet) {
      if (!newContactingIdSet.has(entityId))
        this.events.emit(SensorEvents.EntityContactEnd, entityId);
    }
    this.contactingIdSet = newContactingIdSet;
  }
  updateMesh() {
    const verts: arr2[] = [];
    const vertCount = 32;
    for (let i = 0; i < vertCount; i++) {
      verts.push([
        this.radius * Math.cos((i * Math.PI * 2) / vertCount),
        this.radius * Math.sin((i * Math.PI * 2) / vertCount)
      ]);
    }
    if (this.threeLineGeom) {
      this.threeLineGeom.update(verts);
    } else {
      this.threeLineGeom = new Line2DGeometry(verts, {
        closed: true,
        distances: true
      });
    }
    if (!this.material) {
      this.material = new ShaderMaterial({
        vertexShader: sensorShaderVert,
        fragmentShader: sensorShaderFrag,
        transparent: true,
        side: DoubleSide,
        uniforms: {
          thickness: {
            value: 0.05
          },
          color: {
            value: new Color(0.5, 0.8, 1)
          },
          opacity: {
            value: this.opacity
          },
          dashSteps: {
            value: 32
          },
          dashSmooth: {
            value: 0.01
          },
          dashDistance: {
            value: 0.25
          }
        }
      });
    }
    if (!this.mesh) {
      this.mesh = new Mesh(this.threeLineGeom, this.material);
      this.object3D.add(this.mesh);
    }
  }
  /** Called by ProjectilePhysicsBehavior when a projectile raycast hits this sensor's collider. */
  notifyProjectileContact(entityId: string) {
    this._projectileContactsThisFrame.add(entityId);
  }
  destroy(): void {
    if (this.collider && this.level) {
      this.level.world.removeCollider(this.collider, false);
      this.collider = undefined;
    }
    super.destroy();
    this.threeLineGeom?.dispose();
    this.material?.dispose();
  }
  setOpacity(opacity: number, duration = 500) {
    const initialOpacity = this.opacity;
    this.scheduler.cancel("fade");
    this.scheduler.add({
      id: "fade",
      duration,
      invokeFunction: (t) => {
        this.opacity = initialOpacity * (1 - t) + opacity * t;
        if (this.material) {
          this.material.uniforms.opacity.value = this.opacity;
          this.material.uniformsNeedUpdate = true;
        }
      },
      invokeFunctionAtComplete: () => {
        this.opacity = opacity;
        if (this.material) {
          this.material.uniforms.opacity.value = this.opacity;
          this.material.uniformsNeedUpdate = true;
        }
      }
    });
  }
  fadeAway() {
    if (this.fadingAway) return;
    this.fadingAway = true;
    this.setOpacity(0);
    this.scheduler.add({
      id: "scheduledRemove",
      startIn: 500,
      invokeFunctionAtComplete: () => {
        this.level?.removeEntity(this.id);
        this.destroy();
      }
    });
  }
  extraSpellBindingData() {
    return {
      nearbyEntityIds: [...this.contactingIdSet]
    };
  }
  followEntity(entity: BaseEntityType) {
    this.followingEntity = entity;
  }
}
