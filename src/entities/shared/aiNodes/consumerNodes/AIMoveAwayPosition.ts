import { RayColliderIntersection } from "@dimforge/rapier2d-compat";
import { Vector2 } from "three";

import {
  AINodeData,
  AINodeInput,
  AINodeResolvedInput,
  AIResult
} from "src/api/ai";
import { ControlEvents } from "src/api/controls";
import { AINode, createNode } from "src/engine/entity/AIBehaviorTree";
import { isAnyTerrain } from "src/entities/terrain/allTerrain";

import { CharacterGroundPhysicsControlBehaviorStandard } from "../../behaviors/CharacterGroundPhysicsController";
import { CharacterPhysicsBehavior } from "../../behaviors/CharacterPhysics";
import { NavPathFollowingBehavior } from "../../behaviors/NavPathFollowingBehavior";

class AIMoveAwayPositionNode extends AINode {
  private readonly targetPosition: AINodeResolvedInput<Vector2>;
  private readonly stopDistanceAway: AINodeResolvedInput<number>;

  private noEscape = 0;
  private jumpAtX = 0;
  private jumpCooldown = 0;

  constructor(
    inTargetPosition: AINodeInput<Vector2>,
    inStopDistanceAway: AINodeInput<number>
  ) {
    super();

    this.targetPosition = AINode.ResolveInput(inTargetPosition);
    this.stopDistanceAway = AINode.ResolveInput(inStopDistanceAway);
  }

  reset(): void {
    super.reset();

    this.noEscape = 0;
    this.jumpAtX = 0;
    this.jumpCooldown = 0;
  }

  run(data: AINodeData): AIResult {
    const physicsControlBehavior = data.thisEntity.behaviors.physicsControl;
    if (
      !physicsControlBehavior ||
      !(
        physicsControlBehavior instanceof
        CharacterGroundPhysicsControlBehaviorStandard
      )
    )
      return AIResult.Failed;

    const pathFollowingBehavior = data.thisEntity.behaviors.pathFollowing;
    if (
      !pathFollowingBehavior ||
      !(pathFollowingBehavior instanceof NavPathFollowingBehavior)
    )
      return AIResult.Failed;

    const physicsBehavior = data.thisEntity.behaviors.physics;
    if (
      !physicsBehavior ||
      !(physicsBehavior instanceof CharacterPhysicsBehavior)
    )
      return AIResult.Failed;

    const thisRigidBody = physicsBehavior.body;
    if (!thisRigidBody) return AIResult.Failed;

    const entity = data.thisEntity;
    const level = data.level;

    if (
      this.targetPosition.value.distanceTo(entity.position) >=
      this.stopDistanceAway.value
    ) {
      pathFollowingBehavior.controlEvents.emit(
        ControlEvents.MoveHorizontally,
        0
      );
      return AIResult.Succeeded;
    }

    // Direction to escape (away from target)
    let dir = Math.sign(entity.position.x - this.targetPosition.value.x) || 1;
    const halfW = entity.size.width * 0.5;
    const halfH = entity.size.height * 0.5;

    if (this.noEscape !== 0) {
      if (this.noEscape === dir) {
        dir *= -1;
      } else this.noEscape = 0;
    }

    // Wall check: short horizontal ray in the escape direction
    const wallRay = new level.rapier.Ray(
      { x: entity.position.x + dir * halfW, y: entity.position.y },
      { x: dir, y: 0 }
    );
    let wallAhead = false;
    let playerAhead = false;
    level.world.intersectionsWithRay(
      wallRay,
      1.0,
      true,
      (hit: RayColliderIntersection) => {
        const hitEntityId = level.getEntityIdForCollider(hit.collider.handle);
        if (!hitEntityId) return true;
        const hitEntity = level.getEntity(hitEntityId);
        if (hitEntity && isAnyTerrain(hitEntity)) {
          wallAhead = true;
          return false;
        }
        if (hitEntity?.type === "Player") {
          playerAhead = true;
        }
        return true;
      },
      undefined,
      undefined,
      undefined,
      thisRigidBody
    );

    // Hole check: downward ray slightly ahead — no ground hit means a hole
    const holeRay = new level.rapier.Ray(
      {
        x: entity.position.x + dir * (halfW + 0.3),
        y: entity.position.y - halfH
      },
      { x: 0, y: -1 }
    );
    let holeAhead = true;
    level.world.intersectionsWithRay(
      holeRay,
      2.0,
      true,
      (hit: RayColliderIntersection) => {
        const hitEntityId = level.getEntityIdForCollider(hit.collider.handle);
        if (!hitEntityId) return true;
        const hitEntity = level.getEntity(hitEntityId);
        if (hitEntity && isAnyTerrain(hitEntity)) {
          holeAhead = false;
          return false;
        }
        return true;
      },
      undefined,
      undefined,
      undefined,
      thisRigidBody
    );

    const groundInfo = physicsControlBehavior.isGrounded();
    const grounded = groundInfo && groundInfo[1].y > 0.5;
    if (playerAhead && grounded) {
      pathFollowingBehavior.controlEvents.emit(ControlEvents.JumpStart);
      this.jumpCooldown = 2;
    }

    if (this.jumpCooldown > 0) this.jumpCooldown--;

    if ((wallAhead || holeAhead) && grounded && this.jumpCooldown === 0) {
      if (Math.abs(entity.position.x - this.jumpAtX) < 0.5) {
        this.noEscape = dir;
        dir *= -1;
      } else {
        pathFollowingBehavior.controlEvents.emit(ControlEvents.JumpStart);
        this.jumpAtX = entity.position.x;
        this.jumpCooldown = 2;
      }
    }

    pathFollowingBehavior.controlEvents.emit(
      ControlEvents.MoveHorizontally,
      6 * dir
    );
    return AIResult.Running;
  }
}

export const MoveAwayPosition = createNode(AIMoveAwayPositionNode);
