import { Collider, RigidBody } from "@dimforge/rapier2d-compat";
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Mesh,
  MeshBasicMaterial
} from "three";

import { BaseEntityType, EntityBehavior, LevelAPI } from "src/api/entity";
import { CollisionBehavior } from "src/api/physics";
import { terrainCollisionGroup } from "src/engine/constants/collisionGroups";
import { RenderLayers } from "src/engine/constants/renderLayers";
import * as TiledLevelAPI from "src/engine/level/tiled/api";

export class TerrainPhysicsBehavior implements EntityBehavior {
  public type = "BaseTerrain";
  public entity?: BaseEntityType;
  public terrainDef?: TiledLevelAPI.MapTerrain;
  public body?: RigidBody;
  public colliders?: Collider[];
  public isForeground = false;
  public filterable = false;
  init(entity: BaseEntityType) {
    this.entity = entity;
    return this;
  }
  setTerrain(terrain: TiledLevelAPI.MapTerrain) {
    this.terrainDef = terrain;
    return this;
  }
  setForeground(isForeground: boolean) {
    this.isForeground = isForeground;
    return this;
  }
  setFilterable(filterable = true) {
    this.filterable = filterable;
    return this;
  }
  attachToLevel(level: LevelAPI) {
    if (!this.entity || !this.terrainDef) return;
    const isDecal = this.terrainDef.tileType === TiledLevelAPI.TileType.decal;
    let isPlatform = false;
    switch (this.terrainDef.tileType) {
      case TiledLevelAPI.TileType.platform:
      case TiledLevelAPI.TileType.platformStairsLeft:
      case TiledLevelAPI.TileType.platformStairsRight:
        isPlatform = true;
        break;
      default:
        break;
    }
    if (isDecal) return;

    const isFilterable = isPlatform || this.isForeground || this.filterable;

    const { ColliderDesc, RigidBodyDesc } = level.rapier;
    // Don't use fixed here because it limits out ability to move terrain
    // and detect it with sensors.
    const rigidBodyDesc = RigidBodyDesc.kinematicPositionBased();
    this.body = level.world.createRigidBody(rigidBodyDesc);
    this.body.setTranslation(
      {
        x: this.entity?.position.x ?? 0,
        y: this.entity?.position.y ?? 0
      },
      true
    );

    this.colliders = [];
    for (const convex of this.terrainDef.convexComponentPolygons ?? []) {
      const convexArr = new Float32Array(convex.length * 2);
      for (let vi = 0; vi < convex.length; vi++) {
        const vtx = convex[vi];
        convexArr[vi * 2 + 0] = vtx.x;
        convexArr[vi * 2 + 1] = vtx.y;
      }
      const colliderDesc = ColliderDesc.convexHull(convexArr);
      if (colliderDesc === null) continue;
      colliderDesc.setCollisionGroups(terrainCollisionGroup);
      const collider = level.world.createCollider(colliderDesc, this.body);
      if (isFilterable) {
        collider.setActiveEvents(level.rapier.ActiveEvents.COLLISION_EVENTS);
        collider.setActiveHooks(level.rapier.ActiveHooks.FILTER_CONTACT_PAIRS);
      }

      this.colliders.push(collider);
    }

    // When entities collide with platforms, they should pass through
    // if they are passing upwards and collide if they are passing
    // downwards.
    level.registerEntityPhysicsHooks({
      entityId: this.entity.id,
      rigidBodyHandle: this.body.handle,
      acceptCollisionByDefault: !isFilterable,
      beginCollision: isFilterable
        ? (_thisEntity, _otherEntity, normal) => {
            if (this.isForeground) return CollisionBehavior.NoCollide;
            return (isPlatform ? normal.y > 0.1 : true)
              ? CollisionBehavior.Collide
              : CollisionBehavior.NoCollide;
          }
        : undefined
    });
  }
  disable() {
    if (this.colliders) {
      for (const collider of this.colliders) {
        collider.setEnabled(false);
      }
    }
  }
  enable() {
    if (this.colliders) {
      for (const collider of this.colliders) {
        collider.setEnabled(true);
      }
    }
  }
  detachFromLevel(level: LevelAPI) {
    if (this.entity) level.removeEntityPhysicsHooks(this.entity.id);
    if (this.colliders) {
      for (const collider of this.colliders)
        level.world.removeCollider(collider, false);
    }
    if (this.body) level.world.removeRigidBody(this.body);
  }
  // This is depricated. Use the PhysicsDebugger entity if you need to debug physics.
  buildDebugMesh() {
    const { entity, terrainDef } = this;
    if (!entity || !terrainDef) return;

    const geom = new BufferGeometry();
    let positionCount = 0;
    let triangleCount = 0;
    for (const convex of terrainDef.convexComponentPolygons) {
      positionCount += convex.length;
      triangleCount += convex.length - 2;
    }
    const indexArr = new Uint16Array(triangleCount * 3);
    const posArr = new Float32Array(positionCount * 3);
    let posIncr = 0;
    let indexIncr = 0;
    for (const convex of terrainDef.convexComponentPolygons) {
      const convexIndexStart = posIncr;
      for (let i = 0; i < convex.length; i++) {
        const vtx = convex[i];
        posArr[posIncr * 3 + 0] = vtx.x;
        posArr[posIncr * 3 + 1] = vtx.y;
        posIncr++;
      }
      for (let i = 2; i < convex.length; i++) {
        const index = convexIndexStart + i;
        indexArr[indexIncr * 3 - 0] = convexIndexStart;
        indexArr[indexIncr * 3 + 1] = index - 1;
        indexArr[indexIncr * 3 + 2] = index;
        indexIncr++;
      }
    }
    geom.setIndex(new BufferAttribute(indexArr, 1));
    geom.setAttribute("position", new BufferAttribute(posArr, 3));
    const mat = new MeshBasicMaterial({
      color: new Color(
        Math.floor(0xffffff * Math.random() * 0.5) + Math.floor(0xffffff * 0.5)
      ),
      side: DoubleSide,
      wireframe: true
    });
    const mesh = new Mesh(geom, mat);
    mesh.layers.set(RenderLayers.text);
    return mesh;
  }
}
