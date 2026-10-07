import { Ray } from "@dimforge/rapier2d-compat";

import {
  AINodeData,
  AINodeInput,
  AINodeResolvedInput,
  AIResult
} from "src/api/ai";
import { AINode, createNode } from "src/engine/entity/AIBehaviorTree";
import { isAnyTerrain } from "src/entities/terrain/allTerrain";

import { AnimationControlBehavior } from "../../behaviors/AnimationControlBehavior";

class AIDetectLedgeNode extends AINode {
  private readonly forwardOffsetX: AINodeResolvedInput<number>;
  
  private readonly ledgeDetectionRay = new Ray({ x: 0, y: 0 }, { x: 0, y: -1 });

  constructor(inForwardOffsetX: AINodeInput<number> = 0) {
    super();

    this.forwardOffsetX = AINode.ResolveInput(inForwardOffsetX);
  }

  run(data: AINodeData): AIResult {
    const thisPosition = data.thisEntity.position;
    const thisHeight = data.thisEntity.size.height;

    const animationController = data.thisEntity.behaviors.animation;
    const facingDirection =
      animationController &&
      animationController instanceof AnimationControlBehavior
        ? animationController.facingDirection
        : null;

    const xOffset = facingDirection
      ? this.forwardOffsetX.value * facingDirection
      : 0;

    this.ledgeDetectionRay.origin.x = thisPosition.x + xOffset;
    this.ledgeDetectionRay.origin.y = thisPosition.y;

    const world = data.level.world;
    const hasHitGround = world.castRay(
      this.ledgeDetectionRay,
      thisHeight,
      true,
      undefined,
      undefined,
      undefined,
      undefined,
      (collider) => {
        const colliderParentRigidBody = collider.parent();
        if (!colliderParentRigidBody) return false;

        const entity = data.level.getEntityForRigidBody(
          colliderParentRigidBody.handle
        );
        if (!entity) return false;

        const isTerrain = isAnyTerrain(entity);
        if (!isTerrain) return false;

        return true;
      }
    );

    if (hasHitGround) return AIResult.Failed;

    return AIResult.Succeeded;
  }
}

export const DetectLedge = createNode(AIDetectLedgeNode);
