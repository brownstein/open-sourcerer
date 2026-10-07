import {
  Collider,
  ColliderShapeCastHit,
  InteractionGroups,
  QueryFilterFlags,
  RigidBody,
  World
} from "@dimforge/rapier2d-compat";
import { Vector2 } from "three";

import { BaseEntityType, LevelAPI } from "src/api/entity";
import { CentralDataStoreBehavior } from "src/entities/shared/behaviors/CentralDataStoreBehavior";
import { CharacterGroundPhysicsControlBehavior } from "src/entities/shared/behaviors/CharacterGroundPhysicsController";
import { isAnyTerrain } from "src/entities/terrain/allTerrain";

import { toRadians } from "./mathUtils";

export function getNormalBetweenRigidBodies(
  rigidBody1: RigidBody,
  rigidBody2: RigidBody,
  world: World
) {
  let normal: Vector2 = new Vector2();
  const body1NumColliders = rigidBody1.numColliders();
  const body2NumColliders = rigidBody2.numColliders();

  let collisionFound = false;

  for (let i = 0; i < body1NumColliders; i++) {
    const collider1 = rigidBody1.collider(i);
    if (collider1.isSensor()) continue;

    for (let j = 0; j < body2NumColliders; j++) {
      const collider2 = rigidBody2.collider(j);
      if (collider2.isSensor()) continue;

      // eslint-disable-next-line no-loop-func
      world.contactPair(collider1, collider2, (manifold, flipped) => {
        collisionFound = true;

        const { x, y } = manifold.normal();
        normal.set(x, y);

        if (!flipped) normal.multiplyScalar(-1);
      });

      if (collisionFound) return normal;
    }
  }

  return null;
}

export interface PathSegment {
  start: Vector2;
  end: Vector2;
}

export function getPathSegmentsFromPath(path: Vector2[]): PathSegment[] {
  const numPathPoints = path.length;
  if (numPathPoints < 2) return [];

  const pathSegments: PathSegment[] = [];

  for (const [index, currentPoint] of path.entries()) {
    let nextPoint = path.at(index + 1);

    if (!nextPoint) break;

    if (currentPoint.equals(nextPoint)) continue;

    pathSegments.push({ start: currentPoint, end: nextPoint });
  }

  return pathSegments;
}

export function getAllCollidersOfRigidBody(body: RigidBody): Collider[] {
  const allColliders: Collider[] = [];

  const numColliders = body.numColliders();
  for (let index = 0; index < numColliders; index++) {
    const collider = body.collider(index);
    allColliders.push(collider);
  }

  return allColliders;
}

export function castRigidBody(
  world: World,
  body: RigidBody,
  sweepSegment: PathSegment,
  filterFlags?: QueryFilterFlags,
  filterGroups?: InteractionGroups,
  filterExcludeCollider?: Collider,
  filterPredicate?: (collider: Collider) => boolean
): ColliderShapeCastHit | null {
  const allColliders = getAllCollidersOfRigidBody(body);
  if (allColliders.length <= 0) return null;

  const sweepVelocity = new Vector2().subVectors(
    sweepSegment.end,
    sweepSegment.start
  );

  const bodyTranslation = new Vector2().subVectors(
    sweepSegment.start,
    body.translation()
  );

  // mutated in the for loop below
  const colliderStartingSweepPosition = new Vector2();

  for (const collider of allColliders) {
    if (collider.isSensor() || !collider.isEnabled() || !collider.isValid())
      continue;

    const colliderShape = collider.shape;
    const colliderPosition = collider.translation();
    const colliderRotation = collider.rotation();

    colliderStartingSweepPosition.copy(colliderPosition).add(bodyTranslation);

    const hit = world.castShape(
      colliderStartingSweepPosition,
      colliderRotation,
      sweepVelocity,
      colliderShape,
      0.0,
      1.0,
      true,
      filterFlags,
      filterGroups,
      filterExcludeCollider,
      body,
      filterPredicate
    );

    if (hit) return hit;
  }

  return null;
}

export function castRigidBodyAlongPath(
  world: World,
  body: RigidBody,
  path: Vector2[],
  filterFlags?: QueryFilterFlags,
  filterGroups?: InteractionGroups,
  filterExcludeCollider?: Collider,
  filterPredicate?: (collider: Collider) => boolean
): ColliderShapeCastHit | null {
  const pathSegments = getPathSegmentsFromPath(path);
  if (pathSegments.length <= 0) return null;

  for (const pathSegment of pathSegments) {
    const hit = castRigidBody(
      world,
      body,
      pathSegment,
      filterFlags,
      filterGroups,
      filterExcludeCollider,
      filterPredicate
    );

    if (hit) return hit;
  }

  return null;
}

export function getPathApproximationOfJumpArc(
  jumpVelocity: Vector2,
  gravityAccel: number,
  targetLandingXOffset: number,
  numPathSubdivisions: number = 4
): Vector2[] {
  if (targetLandingXOffset === 0) return [];
  if (numPathSubdivisions <= 0) return [];

  const jumpDirection = jumpVelocity.angle();
  const jumpSpeed = jumpVelocity.length();

  if (jumpSpeed === 0) return [];

  // our equation assumes downwards gravity
  const absGravityAccel = Math.abs(gravityAccel);

  const tanAngle = Math.tan(jumpDirection);
  const cosSquaredAngle = Math.cos(jumpDirection) ** 2;
  const speedSquared = jumpSpeed ** 2;
  const getProjectileMotionYCoord = (x: number): number => {
    const xSquared = x ** 2;

    return (
      x * tanAngle -
      (absGravityAccel * xSquared) / (2 * speedSquared * cosSquaredAngle)
    );
  };

  const numPathSegments = 2 ** numPathSubdivisions;
  const numPathPoints = numPathSegments + 1;
  const approximateJumpPath: Vector2[] = [];

  for (
    let pathPointIndex = 0;
    pathPointIndex < numPathPoints;
    pathPointIndex++
  ) {
    const normalizedDistanceAlongJumpArc = pathPointIndex / numPathSegments;

    const pointXCoord = normalizedDistanceAlongJumpArc * targetLandingXOffset;
    const pointYCoord = getProjectileMotionYCoord(pointXCoord);
    const point = new Vector2(pointXCoord, pointYCoord);

    approximateJumpPath.push(point);
  }

  return approximateJumpPath;
}

export function getUnobstructedJumpVelocity(
  world: World,
  body: RigidBody,
  gravityAccel: number,
  targetLandingOffset: Vector2,
  maxJumpSpeed: number = Infinity,
  minJumpAngle?: number,
  maxJumpAngle?: number,
  shouldFindGreatestUnobstructedJumpAngle: boolean = true,
  filterFlags?: QueryFilterFlags,
  filterGroups?: InteractionGroups,
  filterExcludeCollider?: Collider,
  filterPredicate?: (collider: Collider) => boolean
): Vector2 | null {
  if (targetLandingOffset.x === 0) return null;
  if (gravityAccel === 0) return null;
  if (maxJumpSpeed <= 0) return null;

  // calculations involve only positive X offsets for simplicity
  const hasNegativeTargetXOffset = targetLandingOffset.x < 0;
  const adjustedTargetLandingOffset = new Vector2(
    Math.abs(targetLandingOffset.x),
    targetLandingOffset.y
  );

  const minJumpAngleAsymptote = Math.atan2(
    adjustedTargetLandingOffset.y,
    adjustedTargetLandingOffset.x
  );
  const maxJumpAngleAsymptote = toRadians(90);

  // avoid interacting directly on the asymptotes
  const adjustedMinJumpAngleAsymptote = minJumpAngleAsymptote + toRadians(1);
  const adjustedMaxJumpAngleAsymptote = maxJumpAngleAsymptote - toRadians(1);

  // clamp jump angles to check to the adjusted asymptotes
  const clampedMinJumpAngle = Math.max(
    minJumpAngle ?? -Infinity,
    adjustedMinJumpAngleAsymptote
  );
  const clampedMaxJumpAngle = Math.min(
    maxJumpAngle ?? Infinity,
    adjustedMaxJumpAngleAsymptote
  );

  if (clampedMaxJumpAngle < clampedMinJumpAngle) return null;

  // our equation assumes downwards gravity
  const absGravityAccel = Math.abs(gravityAccel);

  const getNeededJumpSpeedForJumpAngle = (angle: number): number => {
    const { x, y } = adjustedTargetLandingOffset;
    const cosAngle = Math.cos(angle);
    const tanAngle = Math.tan(angle);

    const radicandDenominator = 2 * (x * tanAngle - y);

    if (radicandDenominator <= 0) return Infinity;

    const radicand = absGravityAccel / radicandDenominator;

    return (x / cosAngle) * Math.sqrt(radicand);
  };

  const angleToStartCheckingAt = shouldFindGreatestUnobstructedJumpAngle
    ? clampedMaxJumpAngle
    : clampedMinJumpAngle;

  const numAmountToChangeAngleBy = shouldFindGreatestUnobstructedJumpAngle
    ? -toRadians(1)
    : toRadians(1);

  const hasExhaustedAllAngles = (angle: number) => {
    return shouldFindGreatestUnobstructedJumpAngle
      ? angle < clampedMinJumpAngle
      : angle > clampedMaxJumpAngle;
  };

  // mutated in the for loop below
  const jumpVelocity = new Vector2();
  const zero = new Vector2();
  const worldOffset = body.translation();

  for (
    let angleToCheck = angleToStartCheckingAt;
    !hasExhaustedAllAngles(angleToCheck);
    angleToCheck += numAmountToChangeAngleBy
  ) {
    const neededJumpSpeed = getNeededJumpSpeedForJumpAngle(angleToCheck);
    if (neededJumpSpeed === Infinity) continue;
    if (maxJumpSpeed < neededJumpSpeed) continue;

    jumpVelocity.set(neededJumpSpeed, 0);
    jumpVelocity.rotateAround(zero, angleToCheck);

    // now that we have a jump velocity to test,
    // we can now flip it back to a negative X offset for obstruction testing
    if (hasNegativeTargetXOffset) jumpVelocity.x *= -1;

    const approximateJumpArc = getPathApproximationOfJumpArc(
      jumpVelocity,
      absGravityAccel,
      targetLandingOffset.x // we can pass negative x offsets here
    );

    // offset the jump arc by the current rigid body position
    const avoidImmediateCollisionWithFloorVerticalOffset = 0.05;
    approximateJumpArc.forEach((arcPoint) => {
      arcPoint.add(worldOffset);
      arcPoint.y += avoidImmediateCollisionWithFloorVerticalOffset;
    });

    const hit = castRigidBodyAlongPath(
      world,
      body,
      approximateJumpArc,
      filterFlags,
      filterGroups,
      filterExcludeCollider,
      filterPredicate
    );

    if (!hit) return jumpVelocity;
  }

  return null;
}

export function willBeGroundedWithinMs(
  timeMs: number,
  level: LevelAPI,
  body: RigidBody
): boolean {
  // quick check if the attached entity is already grounded
  // sadly have to break layers and interface with entity directly here
  type EntityWithPossibleGroundedData = BaseEntityType<{
    physicsControl?: CharacterGroundPhysicsControlBehavior;
    data?: CentralDataStoreBehavior;
  }>;
  const entity = level.getEntityForRigidBody<EntityWithPossibleGroundedData>(
    body.handle
  );
  if (entity) {
    const isGrounded =
      entity.behaviors.physicsControl?.isGrounded() ||
      entity.behaviors.data?.current.isGrounded;

    if (isGrounded) return true;
  }

  if (timeMs <= 0) return false;

  const { world } = level;
  const gravityAccel = world.gravity.y * body.gravityScale();
  const absGravityAccel = Math.abs(gravityAccel);

  const bodyLinvel = new Vector2().copy(body.linvel());
  const downwardsVector = new Vector2(0, -1);
  const bodyLinvelNormalized = bodyLinvel.normalize();

  const isLinvelDownwards = downwardsVector.dot(bodyLinvelNormalized) > 0;
  if (!isLinvelDownwards) return false;

  const timeSeconds = timeMs / 1000;
  const projectedXDeltaWithinTime = bodyLinvel.x * timeSeconds;

  let approximateFallingArc: Vector2[] = [];

  const isNotFallingStraightDown = projectedXDeltaWithinTime !== 0;

  if (isNotFallingStraightDown) {
    approximateFallingArc = getPathApproximationOfJumpArc(
      bodyLinvel,
      absGravityAccel,
      projectedXDeltaWithinTime
    );
  } else {
    const projectedYDeltaWithinTime =
      bodyLinvel.y * timeSeconds - 0.5 * absGravityAccel * timeSeconds ** 2;

    approximateFallingArc = [
      new Vector2(),
      new Vector2(0, projectedYDeltaWithinTime)
    ];
  }

  const worldOffset = body.translation();
  approximateFallingArc.forEach((arcPoint) => arcPoint.add(worldOffset));

  const hasHitGround = castRigidBodyAlongPath(
    world,
    body,
    approximateFallingArc,
    undefined,
    undefined,
    undefined,
    (collider) => {
      const colliderParentRigidBody = collider.parent();
      if (!colliderParentRigidBody) return false;

      const entity = level.getEntityForRigidBody(
        colliderParentRigidBody.handle
      );
      if (!entity) return false;

      const isTerrain = isAnyTerrain(entity);
      if (!isTerrain) return false;

      return true;
    }
  );

  if (hasHitGround) {
    const upwardsVector = new Vector2(0, 1);
    const groundToBodyNormal = new Vector2().copy(hasHitGround.normal1);
    const groundToBodyNormalUpwardsAmount =
      groundToBodyNormal.dot(upwardsVector);

    if (groundToBodyNormalUpwardsAmount < 0.5) return false;
  }

  return !!hasHitGround;
}
