import { Collider, RigidBody } from "@dimforge/rapier2d-compat";
import { Box2, Vector2 } from "three";

import {
  BaseEntityType,
  EntityBehavior,
  EntityLevelAPI,
  EntityLevelEvents
} from "src/api/entity";
import { createTypedEventEmitter } from "src/api/util";
import { terrainCollisionGroup } from "src/engine/constants/collisionGroups";
import * as TiledLevelAPI from "src/engine/level/tiled/api";
import { vector3To2 } from "src/engine/util/vecTypes";

import { isTerrain } from "../BaseTerrain";
import { CommonTerrainAPI, isCommonTerrain } from "../commonTerrainApi";

// NOTE: i know this is probably messy, but i could not quickly find how else the depth values
//        of each terrain tile can be passed down. the tiled API typed can be modified, but that
//        doesn't seem great also since it is only needed in this specific scenario right now.
//        a more in depth solution is probably needed, but this is my quick fix for now
type MultiLayerMapTerrain = Omit<TiledLevelAPI.MapTerrain, "decalTiles"> & {
  decalTiles: (TiledLevelAPI.MapTile & { depth: number })[];
};

export enum TerrainIntersectionEvents {
  TerrainIntersected = "TerrainIntersected"
}

type TerrainIntersectionEventTypes = {
  [TerrainIntersectionEvents.TerrainIntersected]: {
    mergedTerrain: MultiLayerMapTerrain;
    body: RigidBody;
    colliders: Collider[];
  };
};

export class TerrainIntersectionBehavior implements EntityBehavior {
  static type = "TerrainIntersection";
  public type = TerrainIntersectionBehavior.type;
  public events = createTypedEventEmitter<TerrainIntersectionEventTypes>();

  private entity?: BaseEntityType;
  private level?: EntityLevelAPI;
  private bodyType: "kinematic" | "default" = "kinematic";

  init(entity: BaseEntityType) {
    this.entity = entity;
    return this;
  }

  setBodyType(bodyType: typeof this.bodyType) {
    this.bodyType = bodyType;
    return this;
  }

  attachToLevel(level: EntityLevelAPI) {
    this.level = level;
    if (level.fullyPreLoaded) {
      this.intersectTerrain();
    } else {
      level.on(EntityLevelEvents.PreloadComplete, this.intersectTerrain);
    }
  }

  detachFromLevel(level: EntityLevelAPI) {
    level.off(EntityLevelEvents.PreloadComplete, this.intersectTerrain);
    this.level = undefined;
  }

  readonly intersectTerrain = () => {
    if (!this.entity || !this.level) return;
    const intersectsTerrain = new Map<
      string,
      BaseEntityType & CommonTerrainAPI
    >();

    // Also query for entities within the bounding box of this shape to make
    // sure we get relevant decals.
    const initialBBox = new Box2()
      .expandByPoint(vector3To2(this.entity.position))
      .expandByVector(
        new Vector2(this.entity.size.width * 0.5, this.entity.size.height * 0.5)
      );
    const otherBBox = new Box2();
    for (const entity of this.level.getEntities().values()) {
      if (entity === this.entity || !isCommonTerrain(entity)) continue;
      if (isTerrain(entity) && entity.parallax !== undefined) continue;

      otherBBox
        .makeEmpty()
        .expandByPoint(vector3To2(entity.position))
        .expandByVector(
          new Vector2(entity.size.width * 0.5, entity.size.height * 0.5)
        );

      if (initialBBox.containsBox(otherBBox)) {
        intersectsTerrain.set(entity.id, entity);
      }
    }

    const mergedTerrain: MultiLayerMapTerrain = {
      id: this.entity.id,
      pos: vector3To2(this.entity.position),
      bbox: new Box2(),
      polygon: [],
      convexComponentPolygons: [],
      decalTiles: []
    };

    for (const [_terrainId, terrain] of intersectsTerrain) {
      this.entity.position.z = terrain.position.z;
      terrain.disable();
      if (!terrain.terrain) continue;
      const terrainOffset = terrain.terrain.pos.clone().sub(mergedTerrain.pos);
      for (const decal of terrain.terrain.decalTiles) {
        mergedTerrain.decalTiles.push({
          pos: decal.pos.clone().add(terrainOffset),
          def: decal.def,
          flipOptions: decal.flipOptions,
          collisionPolygon: decal.collisionPolygon?.map((vtx) =>
            vtx.clone().add(terrainOffset)
          ),
          depth: terrain.position.z
        });
      }
      if (terrain.terrain.tileType === TiledLevelAPI.TileType.decal) continue;

      // These two assignments are limiting - these should be multiples.
      mergedTerrain.tileType = terrain.terrain.tileType;
      mergedTerrain.polygon = terrain.terrain.polygon;

      for (const convex of terrain.terrain.convexComponentPolygons) {
        mergedTerrain.convexComponentPolygons.push(
          convex.map((pos) => pos.clone().add(terrainOffset))
        );
      }
    }

    if (!mergedTerrain.convexComponentPolygons.length) return;

    const { ColliderDesc, RigidBodyDesc } = this.level.rapier;
    const rigidBodyDesc =
      this.bodyType === "kinematic"
        ? RigidBodyDesc.kinematicPositionBased()
        : RigidBodyDesc.dynamic();
    const body = this.level.world.createRigidBody(rigidBodyDesc);
    body.setTranslation(
      {
        x: this.entity.position.x,
        y: this.entity.position.y
      },
      true
    );

    const colliders: Collider[] = [];
    for (const convex of mergedTerrain.convexComponentPolygons ?? []) {
      const convexArr = new Float32Array(convex.length * 2);
      for (let vi = 0; vi < convex.length; vi++) {
        const vtx = convex[vi];
        convexArr[vi * 2 + 0] = vtx.x;
        convexArr[vi * 2 + 1] = vtx.y;
      }
      const colliderDesc = ColliderDesc.convexHull(convexArr);
      if (colliderDesc === null) continue;
      colliderDesc.setActiveCollisionTypes(
        this.level.rapier.ActiveCollisionTypes.ALL
      );
      colliderDesc.setActiveEvents(
        this.level.rapier.ActiveEvents.CONTACT_FORCE_EVENTS
      );
      colliderDesc.setCollisionGroups(terrainCollisionGroup);
      const collider = this.level.world.createCollider(colliderDesc, body);
      colliders.push(collider);
    }

    this.events.emit(TerrainIntersectionEvents.TerrainIntersected, {
      mergedTerrain,
      body,
      colliders
    });
  };
}
