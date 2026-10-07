import { AINodeData, AIResult } from "src/api/ai";
import { AINode, createNode } from "src/engine/entity/AIBehaviorTree";

import { AnimationControlBehavior } from "../../behaviors/AnimationControlBehavior";

class AIDisableAnimationNode extends AINode {
  run(data: AINodeData): AIResult {
    const animationBehavior = data.thisEntity.behaviors.animation;
    if (
      !animationBehavior ||
      !(animationBehavior instanceof AnimationControlBehavior)
    )
      return AIResult.Succeeded;

    animationBehavior.disable();

    return AIResult.Succeeded;
  }
}

export const DisableAnimation = createNode(AIDisableAnimationNode);
