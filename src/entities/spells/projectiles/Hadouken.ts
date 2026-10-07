import { Object3D, Vector2 } from "three";

import { BaseEntityType, ElementalType, EntityProps } from "src/api/entity";
import { kInvPixelScale, kPixelScale } from "src/engine/constants/scaling";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import { getAsset, setAssetDependencies } from "src/engine/entity/decorators";
import { kWorldGravity } from "src/engine/level/Level";
import type { EntityNetSummary } from "src/multiplayer/api";
import {
  ProjectilePhysicsBehavior,
  ProjectilePhysicsEvents
} from "src/entities/shared/behaviors/ProjectilePhysics";

import * as wtsTypes from "../../enemies/sprites/walker-that-shoot/walker-that-shoot-types";

export type HadoukenProps = EntityProps & {
  damage?: number;
};

@setAssetDependencies(() => ["walkerThatShootSprite"])
export class Hadouken extends CoreEntity {
  static type = "Hadouken";
  public type = "Hadouken";
  public object3D = new Object3D();
  public behaviors = {
    projectilePhysics: new ProjectilePhysicsBehavior()
  };

  public sprite = getAsset("walkerThatShootSprite").getSprite<
    wtsTypes.sprite_layers,
    wtsTypes.sprite_animations
  >();

  public damage = 5;
  private sourceEntity?: BaseEntityType;
  private _crashing = false;

  constructor(props: HadoukenProps) {
    super(props);
    this.damage = props.damage ?? this.damage;

    this.behaviors.projectilePhysics.init(this);
    this.behaviors.projectilePhysics.velocity.set(1, 0);

    this.behaviors.projectilePhysics.events.on(
      ProjectilePhysicsEvents.CollideWithEntity,
      ([entity, pos]) => {
        if (this._crashing) return;
        this._crashing = true;
        this.behaviors.projectilePhysics.enabled = false;
        this.position.x = pos.x;
        this.position.y = pos.y;
        this.object3D.position.x = pos.x;
        this.object3D.position.y = pos.y;

        this.sprite.gotoAnimation("bulletcrash");
        this.sprite.setAnimationLooping(false);
        this.sprite.setAnimationSpeed(1);

        // Remove the entity once the crash animation finishes.
        // Using manual off() to replicate once() since the sprite may fire
        // "animationLooped" on every frame after a non-looping animation ends.
        const onCrashComplete = () => {
          this.sprite.events.off("animationLooped", onCrashComplete);
          this.level?.removeEntity(this.id);
          this.destroy();
        };
        this.sprite.events.on("animationLooped", onCrashComplete);

        entity.hit?.({
          hittingEntity: this,
          sourceEntity: this.sourceEntity ?? this,
          hitImpulse: this.behaviors.projectilePhysics.velocity
            .clone()
            .normalize()
            .multiplyScalar(2),
          damage: this.damage,
          elementalDamageType: ElementalType.Wind
        });
      }
    );

    this.sprite.hideLayers("reference");

    // Set animation before center() so it bounds only the bullet layer,
    // not the full walker canvas.
    this.sprite.gotoAnimation("loop");
    this.sprite.setAnimationLooping(true);
    this.sprite.setAnimationSpeed(1);

    this.sprite.center();
    this.sprite.mesh.position
      .multiplyScalar(kPixelScale)
      .round()
      .multiplyScalar(kInvPixelScale);
    this.sprite.mesh.scale.multiplyScalar(kInvPixelScale);
    this.sprite.mesh.scale.y *= -1;

    this.object3D.add(this.sprite.mesh);
    this.object3D.position.copy(this.position);
  }

  ignoreEntity(entityId: string) {
    this.behaviors.projectilePhysics.ignoreEntityIds.add(entityId);
    return this;
  }

  setSourceEntity(sourceEntity: BaseEntityType) {
    this.sourceEntity = sourceEntity;
    return this;
  }

  setVelocity(velocity: Vector2) {
    this.behaviors.projectilePhysics.velocity.copy(velocity);
    // Sprite faces left by default; negate scale.x for rightward shots.
    const absScaleX = Math.abs(this.sprite.mesh.scale.x);
    this.sprite.mesh.scale.x = velocity.x >= 0 ? -absScaleX : absScaleX;
    return this;
  }

  setGravity(gravityScale: number) {
    this.behaviors.projectilePhysics.gravity = {
      x: kWorldGravity.x * gravityScale,
      y: kWorldGravity.y * gravityScale
    };
  }

  step(ms: number) {
    super.step(ms);
    this.sprite.advance(ms);
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

  /** Multiplayer summary for remote HadoukenStubs. */
  getNetSummary(): EntityNetSummary {
    const projectile = this.behaviors.projectilePhysics;
    return {
      pos: { x: this.position.x, y: this.position.y },
      vel: { x: projectile.velocity.x, y: projectile.velocity.y },
      acc: { x: projectile.gravity.x, y: projectile.gravity.y },
      damage: this.damage,
      element: ElementalType.Wind,
      flying: projectile.enabled
    };
  }
}
