import { AINodeData, AIResult } from "src/api/ai";
import { AINode, createNode } from "src/engine/entity/AIBehaviorTree";

import { AnimationControlBehavior } from "../../behaviors/AnimationControlBehavior";

class AIWaitForAnimationLoopNode extends AINode {
  run(data: AINodeData): AIResult {
    const animationBehavior = data.thisEntity.behaviors.animation;
    if (
      !animationBehavior ||
      !(animationBehavior instanceof AnimationControlBehavior)
    )
      return AIResult.Failed;

    if (animationBehavior.hasCurrentAnimationLooped) return AIResult.Succeeded;

    return AIResult.Running;
  }
}

export const WaitForAnimationLoop = createNode(AIWaitForAnimationLoopNode);
