import { AINodeData, AIResult } from "src/api/ai";
import { AINode, createNode } from "src/engine/entity/AIBehaviorTree";

import { EnemyAggroBehavior } from "../../behaviors/EnemyAggroBehavior";

class AIIsAggroedNode extends AINode {
  run(data: AINodeData): AIResult {
    const aggroBehavior = data.thisEntity.behaviors.aggro;
    if (!aggroBehavior || !(aggroBehavior instanceof EnemyAggroBehavior))
      return AIResult.Failed;

    if (!aggroBehavior.resolveCurrentTarget()) return AIResult.Failed;

    return AIResult.Succeeded;
  }
}

export const IsAggroed = createNode(AIIsAggroedNode);
