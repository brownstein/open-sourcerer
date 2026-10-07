import { RigidBody } from "@dimforge/rapier2d-compat";
import { Vector2 } from "three";

import * as TiledLevelAPI from "src/engine/level/tiled/api";

// API shared by all terrain.
export type CommonTerrainAPI = {
  _isTerrain: boolean;
  // Get the map terrain definition for this terrain.
  terrain?: TiledLevelAPI.MapTerrain;
  // Is the terrain in the foreground?
  foreground?: boolean;
  // Is the terrain in the foreground faded.
  fadeForeground?: (faded: boolean) => void;
  // Get the outer polygon for this terrain.
  getVertVectors(): Vector2[];
  // Get the rigid body for this terrain.
  getRigidBody(): RigidBody | undefined;
  // Make terrain inactive without removing it from the level.
  disable(): void;
};

// Helper to determine if an entity follows the common terrain API.
export function isCommonTerrain(entity: unknown): entity is CommonTerrainAPI {
  if (!entity || typeof entity !== "object") return false;
  const asApi = entity as CommonTerrainAPI;
  if (asApi._isTerrain === true && !!asApi.terrain) return true;
  return false;
}
