// This may or may not be the best place for this util
import RAPIER, { Collider } from "@dimforge/rapier2d-compat";

import { BaseEntityType, LevelAPI } from "src/api/entity";
import { CharacterGroundPhysicsControlBehaviorEvents } from "src/entities/shared/behaviors/CharacterGroundPhysicsController";
import { CharacterPhysicsBehavior } from "src/entities/shared/behaviors/CharacterPhysics";

// Find the player collider and return its bottom position
export function getPlayerColliderBottom(
  level: LevelAPI,
  caster: BaseEntityType
): { x: number; y: number } | null {
  if (!level.world) return null;
  // Access the physics behavior
  const physics = (caster.behaviors as { physics?: CharacterPhysicsBehavior })
    ?.physics;
  if (!physics?.colliders || physics.colliders.length === 0) return null;
  const collider = physics.colliders[0];
  const pos = collider.translation();

  const shape = (collider as any)._shape;
  let bottomY = pos.y;
  if (shape?.halfExtents) {
    bottomY = pos.y - shape.halfExtents.y;
  } else if (shape?.vertices) {
    // For polygon shapes, find the lowest vertex
    const verts = [];
    for (let i = 0; i < shape.vertices.length; i += 2) {
      verts.push(pos.y + shape.vertices[i + 1]);
    }
    bottomY = Math.min(...verts);
  }
  return { x: pos.x, y: bottomY };
}

// Find the ground collider under a given position (x, y)
export function getTerrainColliderAtPosition(
  level: LevelAPI,
  x: number,
  y: number,
  caster?: BaseEntityType
): Collider | null {
  if (!level.world) return null;
  let found: Collider | null = null;

  // Get player's colliders for filtering
  const playerColliders = caster
    ? (caster.behaviors as { physics?: CharacterPhysicsBehavior })?.physics
        ?.colliders ?? []
    : [];

  level.world.forEachCollider((collider: Collider) => {
    // Skip player's colliders
    if (playerColliders.includes(collider)) {
      return;
    }

    const shape = (collider as any)._shape;
    const pos = collider.translation();

    if (shape?.vertices && !shape.halfExtents) {
      const verts = [];
      for (let i = 0; i < shape.vertices.length; i += 2) {
        verts.push({
          x: pos.x + shape.vertices[i],
          y: pos.y + shape.vertices[i + 1]
        });
      }
      if (pointInPolygon(x, y, verts)) {
        found = collider;
        return false;
      }
    } else if (shape?.halfExtents) {
      const minX = pos.x - shape.halfExtents.x;
      const maxX = pos.x + shape.halfExtents.x;
      const minY = pos.y - shape.halfExtents.y;
      const maxY = pos.y + shape.halfExtents.y;
      if (x >= minX && x <= maxX && y >= minY && y <= maxY) {
        found = collider;
        return false;
      }
    }
  });
  return found;
}

// Point-in-polygon test
function pointInPolygon(
  x: number,
  y: number,
  polygon: { x: number; y: number }[]
): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x,
      yi = polygon[i].y;
    const xj = polygon[j].x,
      yj = polygon[j].y;
    const intersect =
      // eslint-disable-next-line no-mixed-operators
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi || 1e-10) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

// Get firewave path using projectPoint for accurate ground placement
// TODO: Firewave - fine tune slope logic
export function getGroundPathForFirewave(
  level: LevelAPI,
  caster: BaseEntityType,
  direction: number,
  spacing: number,
  numBlasts: number
): { x: number; y: number }[] {
  const playerBottom = getPlayerColliderBottom(level, caster);
  if (!playerBottom) {
    return [];
  }

  const path: { x: number; y: number }[] = [];
  const startOffset = 0.5;
  const maxRayDistance = 1.5;

  // Get player's colliders for filtering
  const physics = (caster.behaviors as { physics?: CharacterPhysicsBehavior })
    ?.physics;
  const playerColliders = physics?.colliders ?? [];

  for (let i = 0; i < numBlasts; i++) {
    const blastX = playerBottom.x + direction * (startOffset + spacing * i);
    const rayOrigin = { x: blastX, y: playerBottom.y + 1 }; // Start a bit above the player bottom
    const rayDir = { x: 0, y: -1 }; // Cast downward

    // Ray-cast in the world
    const hit = level.world.castRay(
      new RAPIER.Ray(rayOrigin, rayDir),
      maxRayDistance,
      true,
      undefined,
      undefined,
      undefined,
      undefined,
      (collider: Collider) => !playerColliders.includes(collider) // Filter out player colliders
    );

    if (hit && hit.collider) {
      const hitPoint = rayOrigin.y + rayDir.y * hit.timeOfImpact;
      path.push({ x: blastX, y: hitPoint });
    } else {
      break;
    }
  }
  return path;
}

// Wait for player to land and then get firewave path
export async function waitForGroundPathForFirewave(
  level: LevelAPI,
  caster: BaseEntityType,
  direction: number,
  spacing: number,
  numBlasts: number,
  pollMs: number = 100
): Promise<{ x: number; y: number }[]> {
  // Check if player is grounded
  const groundPhysics = (caster.behaviors as { groundPhysics?: any })
    ?.groundPhysics;
  const isGrounded = groundPhysics?.isGrounded?.();

  if (!isGrounded && groundPhysics?.events) {
    return new Promise((resolve) => {
      const handler = () => {
        const newPath = getGroundPathForFirewave(
          level,
          caster,
          direction,
          spacing,
          numBlasts
        );
        if (newPath.length > 0) {
          groundPhysics.events.off(
            CharacterGroundPhysicsControlBehaviorEvents.Land,
            handler
          );
          resolve(newPath);
        }
      };
      groundPhysics.events.on(
        CharacterGroundPhysicsControlBehaviorEvents.Land,
        handler
      );
    });
  }
  // If already grounded, try to get path immediately
  let path = getGroundPathForFirewave(
    level,
    caster,
    direction,
    spacing,
    numBlasts
  );
  if (path.length > 0) return path;

  while (true) {
    path = getGroundPathForFirewave(
      level,
      caster,
      direction,
      spacing,
      numBlasts
    );
    if (path.length > 0) return path;
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
}
