import { RayColliderIntersection, RigidBody } from "@dimforge/rapier2d-compat";

import { LevelAPI } from "src/api/entity";
import { isAnyPlatform, isAnyTerrain } from "src/entities/terrain/allTerrain";

/**
 * Checks whether a straight-line path between two points is free of solid
 * (non-platform) terrain. Returns `true` when no terrain blocks the path.
 */
export function isLineOfSightClear(
  level: LevelAPI,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  excludeRigidBody?: RigidBody
): boolean {
  const dx = toX - fromX;
  const dy = toY - fromY;
  const distance = Math.sqrt(dx * dx + dy * dy);
  if (distance < 0.001) return true;

  const ray = new level.rapier.Ray(
    { x: fromX, y: fromY },
    { x: dx / distance, y: dy / distance }
  );

  let blocked = false;

  level.world.intersectionsWithRay(
    ray,
    distance,
    false,
    (hit: RayColliderIntersection) => {
      if (hit.collider.isSensor()) return true;
      const hitEntityId = level.getEntityIdForCollider(hit.collider.handle);
      if (!hitEntityId) return true;
      const hitEntity = level.getEntity(hitEntityId);
      if (!hitEntity) return true;
      if (isAnyTerrain(hitEntity) && !isAnyPlatform(hitEntity)) {
        blocked = true;
        return false;
      }
      return true;
    },
    undefined,
    undefined,
    undefined,
    excludeRigidBody
  );

  return !blocked;
}
