import { RigidBody } from "@dimforge/rapier2d-compat";
import { Object3D, Vector2, Vector3 } from "three";

import {
  DamageType,
  ElementalType,
  EntityAlignment,
  EntityLevelAPI,
  EntityLifecycleEventTypes,
  EntityProps
} from "src/api/entity";
import { createTypedEventEmitter } from "src/api/util";
import { kInvPixelScale, kPixelScale } from "src/engine/constants/scaling";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import { kWorldGravity } from "src/engine/level/Level";
import * as TiledLevelAPI from "src/engine/level/tiled/api";
import { AdvancedTerrainRenderBehavior } from "src/entities/terrain/behaviors/AdvancedRenderBehavior";
import {
  TerrainIntersectionBehavior,
  TerrainIntersectionEvents
} from "src/entities/terrain/behaviors/TerrainIntersectionBehavior";
import { isCommonTerrain } from "src/entities/terrain/commonTerrainApi";

export type FallingTerrainProps = EntityProps & {};

export enum FallingTerrainEvents {
  ImpactedTerrain = "ImpactedTerrain"
}

type FallingTerrainEventTypes = {
  [FallingTerrainEvents.ImpactedTerrain]: void;
};

export class FallingTerrain extends CoreEntity {
  static type = "FallingTerrain";
  public type = FallingTerrain.type;
  public object3D = new Object3D();
  public events = createTypedEventEmitter<
    EntityLifecycleEventTypes & FallingTerrainEventTypes
  >();

  public alignment = EntityAlignment.EnvironmentalHazard;

  public behaviors = {
    render: new AdvancedTerrainRenderBehavior(),
    terrainIntersection: new TerrainIntersectionBehavior()
  };

  private body?: RigidBody;
  private crumbling = false;
  private crumbled = false;
  private damage = 10;
  private damageInterval = 500;
  private damagedAt = new Map<string, number>();
  private mapTerrain?: TiledLevelAPI.MapTerrain;
  private initialPosition = new Vector3();
  private initialAngle = 0;

  constructor(props: FallingTerrainProps) {
    super(props);

    this.position
      .multiplyScalar(kPixelScale)
      .round()
      .multiplyScalar(kInvPixelScale);
    this.initialPosition.copy(this.position);
    this.initialAngle = this.angle;

    this.object3D.position.copy(this.position);

    // Set up terrain intersection.
    this.behaviors.terrainIntersection.init(this).setBodyType("default");
    this.behaviors.terrainIntersection.events.on(
      TerrainIntersectionEvents.TerrainIntersected,
      ({ mergedTerrain, body }) => {
        this.mapTerrain = mergedTerrain;
        this.body = body;
        this.behaviors.render
          .init(this)
          .setTiles(mergedTerrain.decalTiles)
          .buildTileMeshes()
          .apply();

        this.level?.registerEntityPhysicsHooks({
          entityId: this.id,
          rigidBodyHandle: this.body.handle,
          acceptCollisionByDefault: true,
          beginCollision: (_this, other, normal) => {
            if (this.crumbling) return;
            if (!other) {
              return;
            }
            if (isCommonTerrain(other)) {
              const thisLinVel = this.body?.linvel();
              const otherLinVel = other.getRigidBody()?.linvel();
              if (!thisLinVel || !otherLinVel) {
                console.warn("Unable to obtain lin vel delta...");
                return;
              }
              const velDelta = new Vector2(
                thisLinVel.x - otherLinVel.x,
                thisLinVel.y - otherLinVel.y
              );
              const dot = normal.dot(velDelta);
              if (dot > 1) {
                this.crumble();
                this.events.emit(FallingTerrainEvents.ImpactedTerrain);
              }
            }
            const lastHit = this.damagedAt.get(other.id) ?? 0;
            const now = this.scheduler.currentTime();
            if (now - lastHit < this.damageInterval) return;
            this.damagedAt.set(other.id, now);
            other?.hit?.({
              hittingEntity: this,
              sourceEntity: this,
              damage: this.damage,
              damageType: DamageType.Blunt,
              elementalDamageType: ElementalType.Earth
            });
          }
        });

        this.body.setEnabled(false);
        this.body.setGravityScale(1, false);
      }
    );
  }

  setDamage(damage: number) {
    this.damage = damage;
    return this;
  }

  detachFromLevel(level: EntityLevelAPI): void {
    super.detachFromLevel(level);
    level.removeEntityPhysicsHooks(this.id);
    if (this.body) {
      level.world.removeRigidBody(this.body);
      this.body = undefined;
    }
  }

  step(ms: number) {
    super.step(ms);
    if (this.crumbling || this.crumbled) {
      if (this.body?.isEnabled()) this.body.setEnabled(false);
      if (this.crumbling) {
        this.behaviors.render.updateAllTilesWithVelocity(ms);
      }
      return;
    }
    if (this.body?.isEnabled()) {
      const bodyPos = this.body.translation();
      const bodyAngle = this.body.rotation();
      this.position.x = bodyPos.x;
      this.position.y = bodyPos.y;
      this.angle = bodyAngle;
      this.object3D.position
        .copy(this.position)
        .multiplyScalar(kPixelScale)
        .round()
        .multiplyScalar(kInvPixelScale);
      this.object3D.rotation.z = this.angle;
    }
  }

  fall() {
    this.body?.setEnabled(true);
    return this;
  }

  crumble() {
    if (this.crumbling || this.crumbled) return;
    this.crumbling = true;
    this.behaviors.render.applyToAllTiles((tile) => {
      tile.vel.x += (-0.5 + Math.random()) * 3;
      tile.vel.y += (-0.5 + Math.random()) * 3;
      tile.acc.set(kWorldGravity.x, kWorldGravity.y);
      tile.angVel = (Math.random() - 0.5) * Math.PI * 4;
    });
    this.scheduler.cancel("fadeIn");
    this.scheduler.add({
      id: "fadeOut",
      duration: 500,
      invokeFunction: (t) => {
        this.behaviors.render.setOpacity(1 - t);
        this.behaviors.render.applyToAllTiles((tile) => {
          tile.scale = 1 - t;
        });
      },
      invokeFunctionAtComplete: () => {
        this.crumbling = false;
        this.crumbled = true;
        this.object3D.visible = false;
        this.behaviors.render.destroy();
      }
    });
    return this;
  }

  reset() {
    if (!(this.crumbled || this.crumbling)) return this;
    this.crumbling = false;
    this.crumbled = false;
    this.position.copy(this.initialPosition);
    this.angle = this.initialAngle;
    this.body?.setEnabled(false);
    this.body?.setTranslation(
      {
        x: this.position.x,
        y: this.position.y
      },
      false
    );
    this.body?.setRotation(this.angle, false);
    this.body?.setLinvel({ x: 0, y: 0 }, false);
    this.body?.setAngvel(0, false);
    this.behaviors.render.destroy();
    this.behaviors.render.buildTileMeshes();
    this.object3D.visible = true;
    this.behaviors.render.setOpacity(0);
    this.behaviors.render.applyToAllTiles((tile) => {
      tile.scale = 1;
    });
    this.scheduler.cancel("fadeOut");
    this.scheduler.add({
      id: "fadeIn",
      duration: 500,
      invokeFunction: (t) => {
        this.behaviors.render.setOpacity(t);
      }
    });
    this.object3D.position
      .copy(this.position)
      .multiplyScalar(kPixelScale)
      .round()
      .multiplyScalar(kInvPixelScale);
    this.object3D.rotation.z = this.angle;
    return this;
  }
}
