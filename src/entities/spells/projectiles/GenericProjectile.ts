import { Color, Object3D, Vector2, Vector3 } from "three";

import {
  BaseEntityType,
  DamageType,
  ElementalType,
  EntityProps
} from "src/api/entity";
import { createTypedEventEmitter } from "src/api/util";
import { kInvPixelScale } from "src/engine/constants/scaling";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import { kWorldGravity } from "src/engine/level/Level";
import { vector3To2 } from "src/engine/util/vecTypes";
import type { EntityNetSummary } from "src/multiplayer/api";
import {
  ProjectilePhysicsBehavior,
  ProjectilePhysicsEvents
} from "src/entities/shared/behaviors/ProjectilePhysics";
import {
  SmokeParticleSettings,
  SmokeParticlesBehavior
} from "src/entities/shared/behaviors/SmokeParticles";
import { isAnyPlatform, isAnyTerrain } from "src/entities/terrain/allTerrain";

import {
  TrailRenderingBehavior,
  TravelEvents,
  TravelEventsTypes
} from "./TrailRendering";

export { TravelEvents };
export type { TravelEventsTypes };

export type GenericProjectileProps = EntityProps & {
  damage?: number;
  elementalType?: ElementalType;
  damageType?: DamageType;
  colorInner?: Color;
  colorOuter?: Color;
  colorTrail?: Color;
  opacityInner?: number;
  opacityOuter?: number;
  radius?: number;
  gravity?: number;
  enableParticles?: boolean;
  particleColor?: Color;
  trailMaxLength?: number;
  trailLengthMs?: number;
};

type ElementalDefaults = {
  colorInner: Color;
  colorOuter: Color;
  colorTrail: Color;
  gravity: number;
  particleSettings?: SmokeParticleSettings;
  trailJitter?: number;
  trailTurbulence?: number;
  trailDelta?: Vector3;
};

export function getElementalDefaultGravityCoefficient(type: ElementalType): number {
  return getElementalDefaults(type).gravity;
}

export function getElementalDefaults(type: ElementalType): ElementalDefaults {
  switch (type) {
    case ElementalType.Mana:
      return {
        colorInner: new Color(0.25, 0.8, 1),
        colorOuter: new Color(0.15, 0.6, 0.8),
        colorTrail: new Color(0.15, 0.6, 0.8),
        gravity: 0
      };
    case ElementalType.Fire:
      return {
        colorInner: new Color(1, 1, 0),
        colorOuter: new Color(1, 0.3, 0),
        colorTrail: new Color(0.3, 0.3, 0.3),
        gravity: 1
      };
    case ElementalType.Ice:
      return {
        colorInner: new Color(0.6, 0.9, 1.0),
        colorOuter: new Color(0.2, 0.6, 0.9),
        colorTrail: new Color(0.1, 0.3, 0.7),
        gravity: 0.5,
        particleSettings: {
          color: new Color(1, 1, 1),
          msBetweenSpawn: 15,
          lifetimeMs: 600,
          lifetimeMsVariance: 200,
          roundPositions: true,
          transform: (particle, ms) => {
            if (ms === 0) {
              particle.size = 0;
              particle.opacity = 1;
              particle.color.setRGB(
                0.8 + Math.random() * 0.2,
                0.9 + Math.random() * 0.1,
                1.0
              );
              particle.velocity.x = (Math.random() - 0.5) * 0.003;
              particle.velocity.y = (Math.random() - 0.5) * 0.002 - 0.001;
            } else {
              const t = ms / particle.lifetimeMs;
              particle.size = 0.15;
              particle.opacity = (1 - t) * 0.9;
              particle.velocity.x += Math.sin(ms * 0.012) * 0.00004;
              particle.velocity.y -= 0.000005;
            }
          }
        }
      };
    case ElementalType.Earth:
      return {
        colorInner: new Color(0.8, 0.7, 0.4),
        colorOuter: new Color(0.5, 0.35, 0.15),
        colorTrail: new Color(0.3, 0.2, 0.1),
        gravity: 2
      };
    case ElementalType.Wind:
      return {
        colorInner: new Color(1, 1, 1),
        colorOuter: new Color(0.7, 0.9, 0.7),
        colorTrail: new Color(0.4, 0.7, 0.4),
        gravity: 0
      };
    case ElementalType.Electricity:
      return {
        colorInner: new Color(1, 1, 1),
        colorOuter: new Color(1, 1, 0.5),
        colorTrail: new Color(0.3, 0.5, 1.0),
        gravity: 0.3,
        trailJitter: 0.03,
        trailTurbulence: 0.01,
        trailDelta: new Vector3(0, 0, 0),
        particleSettings: {
          color: new Color(1, 1, 0.6),
          msBetweenSpawn: 10,
          lifetimeMs: 200,
          lifetimeMsVariance: 100,
          roundPositions: true,
          transform: (particle, ms) => {
            if (ms === 0) {
              particle.size = 0;
              particle.opacity = 1;
              particle.color.setRGB(
                0.9 + Math.random() * 0.1,
                0.9 + Math.random() * 0.1,
                0.3 + Math.random() * 0.7
              );
              particle.velocity.x = (Math.random() - 0.5) * 0.006;
              particle.velocity.y = (Math.random() - 0.5) * 0.006;
            } else {
              const t = ms / particle.lifetimeMs;
              particle.size = 0.12 * (1 - t);
              particle.opacity = 1 - t;
            }
          }
        }
      };
    case ElementalType.Nature:
      return {
        colorInner: new Color(0.5, 1.0, 0.3),
        colorOuter: new Color(0.1, 0.7, 0.1),
        colorTrail: new Color(0.0, 0.4, 0.1),
        gravity: 0.8
      };
  }
}

export class GenericProjectile extends CoreEntity {
  static type = "GenericProjectile";
  public type = "GenericProjectile";
  public object3D = new Object3D();
  public behaviors = {
    projectilePhysics: new ProjectilePhysicsBehavior(),
    trailRender: new TrailRenderingBehavior(),
    smokeRender: new SmokeParticlesBehavior()
  };
  public damage = 5;
  public elementalType: ElementalType;
  public targetPos?: Vector2;
  public travelEvents = createTypedEventEmitter<TravelEventsTypes>();

  private damageType?: DamageType;
  private sourceEntity?: BaseEntityType;

  constructor(props: GenericProjectileProps) {
    super(props);
    this.damage = props.damage ?? this.damage;
    this.elementalType = props.elementalType ?? ElementalType.Fire;
    this.damageType = props.damageType;

    // Get elemental defaults, then let explicit props override
    const defaults = getElementalDefaults(this.elementalType);

    // Configure trail colors before init (defaults first, then overrides)
    this.behaviors.trailRender.colorInner.copy(
      props.colorInner ?? defaults.colorInner
    );
    this.behaviors.trailRender.colorOuter.copy(
      props.colorOuter ?? defaults.colorOuter
    );
    this.behaviors.trailRender.colorTrail.copy(
      props.colorTrail ?? defaults.colorTrail
    );
    if (props.opacityInner !== undefined)
      this.behaviors.trailRender.opacityInner = props.opacityInner;
    if (props.opacityOuter !== undefined)
      this.behaviors.trailRender.opacityOuter = props.opacityOuter;

    // Apply trail shape from elemental defaults
    if (defaults.trailJitter !== undefined)
      this.behaviors.trailRender.trailJitter = defaults.trailJitter;
    if (defaults.trailTurbulence !== undefined)
      this.behaviors.trailRender.trailTurbulence = defaults.trailTurbulence;
    if (defaults.trailDelta !== undefined)
      this.behaviors.trailRender.trailDelta.copy(defaults.trailDelta);

    this.behaviors.projectilePhysics.init(this);
    this.behaviors.projectilePhysics.velocity.set(1, 0);
    this.behaviors.projectilePhysics.events.on(
      ProjectilePhysicsEvents.CollideWithEntity,
      ([entity, pos]) => {
        this.behaviors.projectilePhysics.enabled = false;
        this.behaviors.smokeRender.enableSpawn = false;
        this.position.x = pos.x;
        this.position.y = pos.y;
        this.object3D.position.x = pos.x;
        this.object3D.position.y = pos.y;
        this.scheduler.add({
          id: "projectileCollisionFade",
          duration: 100,
          invokeFunction: (t) => {
            this.behaviors.trailRender.setOpacity(1 - t);
          },
          invokeFunctionAtComplete: () => {
            this.level?.removeEntity(this.id);
            this.destroy();
          }
        });
        entity.hit?.({
          hittingEntity: this,
          sourceEntity: this.sourceEntity ?? this,
          hitImpulse: this.behaviors.projectilePhysics.velocity
            .clone()
            .normalize()
            .multiplyScalar(2),
          damage: this.damage,
          elementalDamageType: this.elementalType,
          damageType: this.damageType
        });
      }
    );

    this.travelEvents.on(TravelEvents.reachedDestination, () => {
      this.setVelocity(new Vector2(0, 0));
      this.setGravity(0);
      this.targetPos = undefined;
    });

    this.travelEvents.on(TravelEvents.notReachedDestination, () => {
      this.setVelocity(new Vector2(0, 0));
      this.setGravity(1);
      this.targetPos = undefined;
    });

    this.behaviors.trailRender.radius =
      props.radius ?? Math.sqrt(this.damage) * kInvPixelScale * 0.8;
    // Configure trail length — longer default than Fireball
    this.behaviors.trailRender.trailMaxLength = props.trailMaxLength ?? 35;
    this.behaviors.trailRender.trailLengthMs = props.trailLengthMs ?? 250;
    this.behaviors.trailRender.init(this);

    // Configure smoke particles
    if (props.enableParticles === false) {
      this.behaviors.smokeRender.enableSpawn = false;
    }
    if (defaults.particleSettings) {
      // Use elemental particle settings (ice snowflakes, electricity sparks, etc.)
      this.behaviors.smokeRender.particleSettings = defaults.particleSettings;
    } else {
      // Default smoke: use explicit particleColor, or trail color from defaults
      if (props.particleColor) {
        this.behaviors.smokeRender.particleSettings.color.copy(
          props.particleColor
        );
      } else {
        this.behaviors.smokeRender.particleSettings.color.copy(
          props.colorTrail ?? defaults.colorTrail
        );
      }
    }
    this.behaviors.smokeRender.init(this);

    // Apply gravity coefficient (explicit prop overrides elemental default)
    const gravity =
      props.gravity ?? defaults.gravity;
    this.behaviors.projectilePhysics.gravity = {
      x: kWorldGravity.x * gravity,
      y: kWorldGravity.y * gravity
    };

    this.object3D.position.copy(this.position);
  }

  ignoreEntity(entityId: string) {
    this.behaviors.projectilePhysics.ignoreEntityIds.add(entityId);
    return this;
  }

  setSourceEntity(sourceEntity: BaseEntityType) {
    this.sourceEntity = sourceEntity;
    this.behaviors.projectilePhysics.ignoreEntityIds.add(sourceEntity.id);
    return this;
  }

  setVelocity(velocity: Vector2) {
    this.behaviors.projectilePhysics.velocity.copy(velocity);
    return this;
  }

  moveTo(position: Vector2, speed: number) {
    if (this.level == null) return;

    if (this.targetPos != null)
      this.travelEvents.emit(TravelEvents.notReachedDestination);

    const delta = position.clone().sub(vector3To2(this.position));
    if (!this.checkLineOfSightOpen(position)) return false;

    this.setGravity(0);
    this.setVelocity(delta.normalize().multiplyScalar(speed));
    this.targetPos = position;

    return true;
  }
  
  checkLineOfSightOpen(position: Vector2) {
    const { level } = this;
    if (!level) return false;

    const delta = position.clone().sub(vector3To2(this.position));
    if (delta.length() === 0) return true;

    const ray = new level.rapier.Ray(
      { x: this.position.x, y: this.position.y },
      { x: delta.x, y: delta.y }
    );
    let hitTerrain = false;
    
    const hitCb = (hit: {
      collider: { handle: number };
      timeOfImpact: number;
    }) => {
      const hitEntityId = level.getEntityIdForCollider(hit.collider.handle);
      if (!hitEntityId) return true;

      const hitEntity = level.getEntity(hitEntityId);
      if (!hitEntity) return true;

      // Don't hit the caster!
      if (hitEntity === this.sourceEntity) return true;

      if (isAnyTerrain(hitEntity)) {
        if (isAnyPlatform(hitEntity)) {
          const hitDistance = hit.timeOfImpact;
          const hitPos = vector3To2(this.position).add(
            delta.clone().multiplyScalar(hitDistance)
          );
          if (this.position.y < hitPos.y) return true;
        }

        hitTerrain = true;
        return false;
      }
      return true;
    };

    level.world.intersectionsWithRay(ray, 1, false, hitCb);

    return !hitTerrain;
  }

  deflect(newVelocity: Vector2, deflectorId: string) {
    this.scheduler.cancel("projectileCollisionFade");
    this.behaviors.projectilePhysics.enabled = true;
    this.behaviors.projectilePhysics.velocity.copy(newVelocity);
    this.behaviors.trailRender.setOpacity(1);
    this.behaviors.projectilePhysics.ignoreEntityIds.clear();
    this.behaviors.projectilePhysics.ignoreEntityIds.add(deflectorId);
    return this;
  }

  setGravity(gravityScale: number) {
    this.behaviors.projectilePhysics.gravity = {
      x: kWorldGravity.x * gravityScale,
      y: kWorldGravity.y * gravityScale
    };
  }

  destroy() {
    super.destroy();
    if (this.targetPos != null)
      this.travelEvents.emit(TravelEvents.notReachedDestination);
  }

  die() {
    this.behaviors.projectilePhysics.enabled = false;
    this.level?.removeEntity(this.id);
    this.destroy();
  }

  step(ms: number) {
    super.step(ms);

    if (this.targetPos != null)
      if (
        this.targetPos &&
        this.targetPos.clone().sub(vector3To2(this.position)).lengthSq() < 0.1
      ) {
        this.travelEvents.emit(TravelEvents.reachedDestination);
      }
  }

  extraSpellBindingData() {
    const vel = this.behaviors.projectilePhysics.velocity;
    return {
      velocity: {
        x: vel.x,
        y: vel.y
      }
    };
  }

  /** Multiplayer summary; appearance reconstructs peer-side from element +
   *  radius via the same elemental defaults. */
  getNetSummary(): EntityNetSummary {
    const projectile = this.behaviors.projectilePhysics;
    return {
      pos: { x: this.position.x, y: this.position.y },
      vel: { x: projectile.velocity.x, y: projectile.velocity.y },
      acc: { x: projectile.gravity.x, y: projectile.gravity.y },
      damage: this.damage,
      element: this.elementalType,
      radius: this.behaviors.trailRender.radius,
      flying: projectile.enabled
    };
  }
}
