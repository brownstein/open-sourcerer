import { AINodeData, AIResult } from "src/api/ai";
import { AINode, createNode } from "src/engine/entity/AIBehaviorTree";

import { CentralDataStoreBehavior } from "../../behaviors/CentralDataStoreBehavior";

class AIIsGroundedNode extends AINode {
  run(data: AINodeData): AIResult {
    const dataBehavior = data.thisEntity.behaviors.data;
    if (!dataBehavior || !(dataBehavior instanceof CentralDataStoreBehavior))
      return AIResult.Failed;

    const isGrounded = dataBehavior.current.isGrounded;

    return isGrounded ? AIResult.Succeeded : AIResult.Failed;
  }
}

export const IsGrounded = createNode(AIIsGroundedNode);
