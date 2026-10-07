import { AINodeData, AIResult } from "src/api/ai";
import { AINode, createNode } from "src/engine/entity/AIBehaviorTree";

import { StatusBehavior } from "../../behaviors/StatusBehavior";

class AIIsDeadNode extends AINode {
  run(data: AINodeData): AIResult {
    const statusBehavior = data.thisEntity.behaviors.status;
    if (!statusBehavior || !(statusBehavior instanceof StatusBehavior))
      return AIResult.Failed;

    const isDead = statusBehavior.dead;
    return isDead ? AIResult.Succeeded : AIResult.Failed;
  }
}

export const IsDead = createNode(AIIsDeadNode);
