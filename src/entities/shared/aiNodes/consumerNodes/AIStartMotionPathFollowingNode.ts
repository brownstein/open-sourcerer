import { AINodeData, AIResult } from "src/api/ai";
import { AINode, createNode } from "src/engine/entity/AIBehaviorTree";

import { MotionPathFollowingBehavior } from "../../behaviors/MotionPath";

class AIStartMotionPathFollowingNode extends AINode {
  run(data: AINodeData): AIResult {
    const motionPathFollowingBehavior =
      data.thisEntity.behaviors.motionPathFollowing;
    if (
      !motionPathFollowingBehavior ||
      !(motionPathFollowingBehavior instanceof MotionPathFollowingBehavior)
    )
      return AIResult.Failed;

    motionPathFollowingBehavior.enable();

    return AIResult.Succeeded;
  }
}

export const StartMotionPathFollowing = createNode(AIStartMotionPathFollowingNode);
