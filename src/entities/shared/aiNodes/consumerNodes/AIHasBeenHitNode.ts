import { AINodeData, AIResult } from "src/api/ai";
import { AINode, createNode } from "src/engine/entity/AIBehaviorTree";

import { StatusBehavior } from "../../behaviors/StatusBehavior";

class AIHasBeenHitNode extends AINode {
  run(data: AINodeData): AIResult {
    const statusBehavior = data.thisEntity.behaviors.status;
    if (!statusBehavior || !(statusBehavior instanceof StatusBehavior))
      return AIResult.Failed;

    const hasBeenHit = statusBehavior.hasBeenHit;

    return hasBeenHit ? AIResult.Succeeded : AIResult.Failed;
  }
}

export const HasBeenHit = createNode(AIHasBeenHitNode);
