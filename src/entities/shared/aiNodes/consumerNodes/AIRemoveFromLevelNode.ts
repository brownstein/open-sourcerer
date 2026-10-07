import { AINodeData, AIResult } from "src/api/ai";
import { AINode, createNode } from "src/engine/entity/AIBehaviorTree";

class AIRemoveFromLevelNode extends AINode {
  run(data: AINodeData): AIResult {
    data.level.removeEntity(data.thisEntity.id);

    return AIResult.Succeeded;
  }
}

export const RemoveFromLevel = createNode(AIRemoveFromLevelNode);
