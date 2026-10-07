import { RigidBody } from "@dimforge/rapier2d-compat";
import { Color, Object3D } from "three";

import { EntityAlignment, EntityLevelAPI, EntityProps } from "src/api/entity";
import { CollisionBehavior } from "src/api/physics";
import { SignalConnectionEvents } from "src/api/signal";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import { SignalConnectionBehavior } from "src/entities/shared/behaviors/SignalConnectionBehavior";

import { TerrainRenderBehavior } from "../terrain/BaseTerrain";
import {
  TerrainIntersectionBehavior,
  TerrainIntersectionEvents
} from "../terrain/behaviors/TerrainIntersectionBehavior";

export type ToggleableTerrainProps = EntityProps & {
  shouldStartActivated?: boolean;
};

export class ToggleableTerrain extends CoreEntity {
  static readonly type = "ToggleableTerrain";
  public readonly type = ToggleableTerrain.type;

  public alignment = EntityAlignment.TemporaryTerrain;
  public object3D = new Object3D();

  public behaviors = {
    terrainIntersection: new TerrainIntersectionBehavior(),
    render: new TerrainRenderBehavior(),
    signal: new SignalConnectionBehavior()
  };

  private isActivated = false;
  private body?: RigidBody;

  private readonly INACTIVE_OPACITY = 0.25;
  private readonly INACTIVE_TINT = new Color(0.5, 0.5, 0.5);
  private readonly ACTIVE_OPACITY = 1;
  private readonly ACTIVE_TINT = new Color(1, 1, 1);

  constructor(props: ToggleableTerrainProps) {
    super(props);

    this.isActivated = props.shouldStartActivated ?? false;

    this.object3D.position.copy(this.position);

    this.behaviors.terrainIntersection.init(this);
    this.behaviors.render.init(this);
    this.behaviors.signal.init(this);

    this.behaviors.signal.events.on(
      SignalConnectionEvents.SignalReceived,
      ({ signal }) => {
        if (signal.value) this.activate();
        else this.deactivate();
      }
    );

    this.behaviors.terrainIntersection.events.on(
      TerrainIntersectionEvents.TerrainIntersected,
      ({ mergedTerrain, body, colliders }) => {
        this.body = body;
        if (this.level) {
          this.level.registerEntityPhysicsHooks({
            entityId: this.id,
            rigidBodyHandle: body.handle,
            colliderHandles: colliders.map((collider) => collider.handle)
          });
        }

        this.behaviors.render
          .setTiles(mergedTerrain.decalTiles)
          .buildTileMeshes()
          .apply();

        if (this.isActivated) this.activate();
        else this.deactivate();
      }
    );
  }

  activate(): void {
    this.isActivated = true;

    if (!this.level) return;

    this.body?.setEnabled(true);

    this.level.updateEntityPhysicsHooks({
      entityId: this.id,
      acceptCollisionByDefault: true,
      beginCollision: () => CollisionBehavior.Collide
    });

    this.behaviors.render
      .setOpacity(this.ACTIVE_OPACITY)
      .setTint(this.ACTIVE_TINT);
  }

  deactivate(): void {
    this.isActivated = false;

    if (!this.level) return;

    this.body?.setEnabled(false);

    this.level.updateEntityPhysicsHooks({
      entityId: this.id,
      acceptCollisionByDefault: false,
      beginCollision: () => CollisionBehavior.NoCollide
    });

    this.behaviors.render
      .setOpacity(this.INACTIVE_OPACITY)
      .setTint(this.INACTIVE_TINT);
  }

  toggle(): void {
    this.isActivated = !this.isActivated;

    if (this.isActivated) this.activate();
    else this.deactivate();
  }

  detachFromLevel(level: EntityLevelAPI): void {
    super.detachFromLevel(level);
    level.removeEntityPhysicsHooks(this.id);
    if (this.body) level.world.removeRigidBody(this.body);
    this.body = undefined;
  }

  destroy(): void {
    super.destroy();
  }
}
