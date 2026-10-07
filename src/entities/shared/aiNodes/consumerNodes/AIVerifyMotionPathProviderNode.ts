import { AINodeData, AIResult } from "src/api/ai";
import { AINode, createNode } from "src/engine/entity/AIBehaviorTree";

import { MotionPathFollowingBehavior } from "../../behaviors/MotionPath";

class AIVerifyMotionPathProviderNode extends AINode {
  run(data: AINodeData): AIResult {
    const motionPathFollowingBehavior =
      data.thisEntity.behaviors.motionPathFollowing;
    if (
      !motionPathFollowingBehavior ||
      !(motionPathFollowingBehavior instanceof MotionPathFollowingBehavior)
    )
      return AIResult.Failed;

    return motionPathFollowingBehavior.pathProvider
      ? AIResult.Succeeded
      : AIResult.Failed;
  }
}

export const VerifyMotionPathProvider = createNode(AIVerifyMotionPathProviderNode);
