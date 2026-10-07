import { Vector2 } from "three";

import {
  AINodeData,
  AINodeInput,
  AINodeResolvedInput,
  AIResult
} from "src/api/ai";
import { AINode, createNode } from "src/engine/entity/AIBehaviorTree";

import { NavPathFollowingBehavior } from "../../behaviors/NavPathFollowingBehavior";

class AIMoveToPositionNode extends AINode {
  private readonly targetPosition: AINodeResolvedInput<Vector2>;
  private readonly stopDistanceAway: AINodeResolvedInput<number | undefined>;
  private readonly shouldWaitForPathFollowing: AINodeResolvedInput<boolean>;

  private pathFollowingBehavior?: NavPathFollowingBehavior;
  private hasInitiatedPathFollowing = false;

  constructor(
    inTargetPosition: AINodeInput<Vector2>,
    inStopDistanceAway: AINodeInput<number | undefined> = undefined,
    inShouldWaitForPathFollowing: AINodeInput<boolean> = false
  ) {
    super();

    this.targetPosition = AINode.ResolveInput(inTargetPosition);
    this.stopDistanceAway = AINode.ResolveInput(inStopDistanceAway);
    this.shouldWaitForPathFollowing = AINode.ResolveInput(
      inShouldWaitForPathFollowing
    );
  }

  reset(): void {
    this.hasInitiatedPathFollowing = false;

    if (this.pathFollowingBehavior && this.shouldWaitForPathFollowing.value)
      this.pathFollowingBehavior.cancelPath();
  }

  run(data: AINodeData): AIResult {
    const pathFollowingBehavior = data.thisEntity.behaviors.pathFollowing;
    if (
      !pathFollowingBehavior ||
      !(pathFollowingBehavior instanceof NavPathFollowingBehavior)
    )
      return AIResult.Failed;
    this.pathFollowingBehavior = pathFollowingBehavior;

    if (!this.hasInitiatedPathFollowing) {
      this.pathFollowingBehavior.planAndFollowPathToPosition(
        this.targetPosition.value,
        this.stopDistanceAway.value
      );

      this.hasInitiatedPathFollowing = true;
    }

    if (!this.shouldWaitForPathFollowing.value) return AIResult.Succeeded;

    if (this.pathFollowingBehavior.isPathFollowing()) return AIResult.Running;

    this.hasInitiatedPathFollowing = false;

    // TODO: find out how to determine if path finding failed so we return failure. not really useful right now
    return AIResult.Succeeded;
  }
}

export const MoveToPosition = createNode(AIMoveToPositionNode);
