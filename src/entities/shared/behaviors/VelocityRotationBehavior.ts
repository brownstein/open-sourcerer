import { Object3D } from "three";

import {
  BaseEntityType,
  EntityBehavior,
  EntityLevelAPI,
  EntityLevelEvents
} from "src/api/entity";

import { CentralDataStoreBehavior } from "./CentralDataStoreBehavior";
import { CharacterPhysicsBehavior } from "./CharacterPhysics";

type CompatibleEntity = BaseEntityType<{
  physics: CharacterPhysicsBehavior;
  data: CentralDataStoreBehavior;
}>;

/**
 * Rotates an entity's object3D based on its physics velocity while a
 * configurable condition is met (default: while airborne).
 *
 * Default formula: `vel.x * vel.y * rotationFactor` — produces a natural
 * tumbling arc during parabolic jumps. Override with `setRotationFormula`
 * for flying enemies or other use cases (e.g. tilt based on vertical
 * velocity only).
 */
export class VelocityRotationBehavior
  implements EntityBehavior<CompatibleEntity>
{
  public readonly type = "VelocityRotation";

  private entity?: CompatibleEntity;
  private dataStore?: CentralDataStoreBehavior;
  private target?: Object3D;

  private rotationFactor = 0.02;
  private maxRotation = Math.PI / 3;
  private lerpWeight = 0.9;
  private isActiveFn?: () => boolean;
  private rotationFormula: (
    velX: number,
    velY: number,
    factor: number
  ) => number = (vx, vy, f) => vx * vy * f;

  setRotationFactor(factor: number): VelocityRotationBehavior {
    this.rotationFactor = factor;
    return this;
  }

  setMaxRotation(max: number): VelocityRotationBehavior {
    this.maxRotation = max;
    return this;
  }

  setLerpWeight(weight: number): VelocityRotationBehavior {
    this.lerpWeight = weight;
    return this;
  }

  /**
   * Sets the Object3D whose rotation.z will be modified.
   * Defaults to `entity.object3D`.
   */
  setTarget(target: Object3D): VelocityRotationBehavior {
    this.target = target;
    return this;
  }

  /**
   * Determines when rotation is applied. Defaults to "while not grounded".
   * When the condition is false, rotation lerps back to 0.
   */
  setActiveCondition(fn: () => boolean): VelocityRotationBehavior {
    this.isActiveFn = fn;
    return this;
  }

  /**
   * Overrides the default `vel.x * vel.y * factor` formula.
   * Receives the current velocity components and the rotation factor,
   * and should return a raw (unclamped) rotation in radians.
   */
  setRotationFormula(
    fn: (velX: number, velY: number, factor: number) => number
  ): VelocityRotationBehavior {
    this.rotationFormula = fn;
    return this;
  }

  init(entity: CompatibleEntity): VelocityRotationBehavior {
    this.entity = entity;
    this.dataStore = entity.behaviors.data;
    return this;
  }

  attachToLevel(level: EntityLevelAPI): void {
    level.on(EntityLevelEvents.Step, this.step);
  }

  detachFromLevel(level: EntityLevelAPI): void {
    level.off(EntityLevelEvents.Step, this.step);
  }

  readonly step = (): void => {
    if (!this.entity || !this.dataStore) return;

    const body = this.entity.behaviors.physics.body;
    if (!body) return;

    const mesh = this.target ?? this.entity.object3D;
    if (!mesh) return;

    const isActive = this.isActiveFn
      ? this.isActiveFn()
      : !this.dataStore.current.isGrounded;

    if (isActive) {
      const vel = body.linvel();
      const rawRot = this.rotationFormula(vel.x, vel.y, this.rotationFactor);
      const clamped = Math.min(
        this.maxRotation,
        Math.max(-this.maxRotation, rawRot)
      );
      mesh.rotation.z =
        mesh.rotation.z * (1 - this.lerpWeight) + clamped * this.lerpWeight;
    } else {
      // Lerp back to 0 at the same rate
      mesh.rotation.z *= 1 - this.lerpWeight;
    }
  };
}
