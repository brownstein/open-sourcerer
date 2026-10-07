import { RigidBody } from "@dimforge/rapier2d-compat";
import { Object3D } from "three";

import {
  DamageType,
  ElementalType,
  EntityAlignment,
  EntityLevelAPI,
  EntityProps
} from "src/api/entity";
import { kInvPixelScale, kPixelScale } from "src/engine/constants/scaling";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import { AdvancedTerrainRenderBehavior } from "src/entities/terrain/behaviors/AdvancedRenderBehavior";
import {
  TerrainIntersectionBehavior,
  TerrainIntersectionEvents
} from "src/entities/terrain/behaviors/TerrainIntersectionBehavior";

export type SpikesProps = EntityProps & {};

export class Spikes extends CoreEntity {
  static type = "Spikes";
  public type = Spikes.type;
  public object3D = new Object3D();

  public alignment = EntityAlignment.EnvironmentalHazard;

  public behaviors = {
    render: new AdvancedTerrainRenderBehavior(),
    terrainIntersection: new TerrainIntersectionBehavior()
  };

  private body?: RigidBody;
  private damage = 10;
  private damageInterval = 500;
  private damagedAt = new Map<string, number>();

  constructor(props: SpikesProps) {
    super(props);

    this.position
      .multiplyScalar(kPixelScale)
      .round()
      .multiplyScalar(kInvPixelScale);

    this.object3D.position.copy(this.position);

    // Set up terrain intersection.
    this.behaviors.terrainIntersection.init(this).setBodyType("kinematic");
    this.behaviors.terrainIntersection.events.on(
      TerrainIntersectionEvents.TerrainIntersected,
      ({ mergedTerrain, body }) => {
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
          beginCollision: (_this, other) => {
            if (!other) return;
            const lastHit =
              this.damagedAt.get(other.id) ?? -this.damageInterval;
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

        this.body.setEnabled(true);
        this.body.setGravityScale(0, false);
      }
    );
  }
  detachFromLevel(level: EntityLevelAPI): void {
    super.detachFromLevel(level);
    level.removeEntityPhysicsHooks(this.id);
    if (this.body) {
      level.world.removeRigidBody(this.body);
      this.body = undefined;
    }
  }
}
