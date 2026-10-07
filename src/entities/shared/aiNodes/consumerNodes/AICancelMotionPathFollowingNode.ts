import { AINodeData, AIResult } from "src/api/ai";
import { AINode, createNode } from "src/engine/entity/AIBehaviorTree";

import { MotionPathFollowingBehavior } from "../../behaviors/MotionPath";

class AICancelMotionPathFollowingNode extends AINode {
  run(data: AINodeData): AIResult {
    const motionPathFollowingBehavior =
      data.thisEntity.behaviors.motionPathFollowing;
    if (
      !motionPathFollowingBehavior ||
      !(motionPathFollowingBehavior instanceof MotionPathFollowingBehavior)
    )
      return AIResult.Succeeded;

    motionPathFollowingBehavior.disable();

    return AIResult.Succeeded;
  }
}

export const CancelMotionPathFollowing = createNode(AICancelMotionPathFollowingNode);
