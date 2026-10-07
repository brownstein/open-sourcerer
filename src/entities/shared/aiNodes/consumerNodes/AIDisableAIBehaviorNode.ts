import { AINodeData, AIResult } from "src/api/ai";
import { AINode, createNode } from "src/engine/entity/AIBehaviorTree";

import { AIBehavior } from "../../behaviors/AIBehavior";

class AIDisableAIBehaviorNode extends AINode {
  run(data: AINodeData): AIResult {
    const aiBehavior = data.thisEntity.behaviors.ai;
    if (!aiBehavior || !(aiBehavior instanceof AIBehavior))
      return AIResult.Succeeded;

    aiBehavior.disable();

    return AIResult.Succeeded;
  }
}

export const DisableAIBehavior = createNode(AIDisableAIBehaviorNode);
