import { Collider, RigidBody } from "@dimforge/rapier2d-compat";
import { Box2 } from "three";

import {
  BaseEntityType,
  EntityBehavior,
  EntityLevelAPI,
  LevelAPI
} from "src/api/entity";
import { CollisionBehavior } from "src/api/physics";
import { terrainCollisionGroup } from "src/engine/constants/collisionGroups";
import * as TiledLevelAPI from "src/engine/level/tiled/api";
import { vector3To2 } from "src/engine/util/vecTypes";

export class LadderPhysicsBehavior implements EntityBehavior {
  public type = "LadderPhysics";
  public entity?: BaseEntityType;
  public terrainDef?: TiledLevelAPI.MapTerrain;
  private level?: EntityLevelAPI;
  private rigidBody?: RigidBody;
  private colliders: Collider[] = [];
  init(entity: BaseEntityType) {
    this.entity = entity;
    return this;
  }
  setTerrain(terrain: TiledLevelAPI.MapTerrain) {
    this.terrainDef = terrain;
    return this;
  }
  attachToLevel(level: LevelAPI) {
    this.level = level;

    if (!this.entity || !this.terrainDef) return;
    const { position } = this.entity;
    const _pos2 = vector3To2(position);

    // Bookkeeping for bounds.
    const box2 = new Box2();

    // Set up physics.
    const { ColliderDesc, RigidBodyDesc } = level.rapier;
    const rigidBodyDesc = RigidBodyDesc.fixed().setTranslation(
      position.x,
      position.y
    );
    const rigidBody = level.world.createRigidBody(rigidBodyDesc);
    this.rigidBody = rigidBody;
    for (const convex of this.terrainDef.convexComponentPolygons ?? []) {
      const convexArr = new Float32Array(convex.length * 2);
      for (let vi = 0; vi < convex.length; vi++) {
        const vtx = convex[vi];
        convexArr[vi * 2 + 0] = vtx.x;
        convexArr[vi * 2 + 1] = vtx.y;
        box2.expandByPoint(vtx);
      }
      const colliderDesc = ColliderDesc.convexHull(convexArr);
      if (colliderDesc === null) continue;
      colliderDesc.setActiveCollisionTypes(
        level.rapier.ActiveCollisionTypes.ALL
      );
      colliderDesc.setActiveHooks(
        level.rapier.ActiveHooks.FILTER_CONTACT_PAIRS
      );
      colliderDesc.setActiveEvents(
        level.rapier.ActiveEvents.CONTACT_FORCE_EVENTS
      );
      colliderDesc.setCollisionGroups(terrainCollisionGroup);
      const collider = level.world.createCollider(colliderDesc, rigidBody);
      this.colliders.push(collider);
    }
    level.registerEntityPhysicsHooks({
      entityId: this.entity.id,
      rigidBodyHandle: rigidBody.handle,
      acceptCollisionByDefault: false,
      beginCollision: (_thisEntity, _otherEntity, normal) => {
        return normal.y > 0.1
          ? CollisionBehavior.Collide
          : CollisionBehavior.NoCollide;
      }
    });
  }
  detachFromLevel(level: LevelAPI) {
    if (this.entity) level.removeEntityPhysicsHooks(this.entity.id);
    if (this.rigidBody) level.world.removeRigidBody(this.rigidBody);
    this.rigidBody = undefined;
    this.colliders = [];
    this.level = undefined;
  }
}
