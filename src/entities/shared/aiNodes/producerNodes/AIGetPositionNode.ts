import { Vector2 } from "three";

import { AINodeData, AINodeOutput, AIResult } from "src/api/ai";
import { AINode, createNode } from "src/engine/entity/AIBehaviorTree";
import { vector3To2 } from "src/engine/util/vecTypes";

class AIGetPositionNode extends AINode {
  private readonly position: AINodeOutput<Vector2>;

  constructor(outPosition: AINodeOutput<Vector2>) {
    super();

    this.position = outPosition;
  }

  run(data: AINodeData): AIResult {
    this.position.value.copy(vector3To2(data.thisEntity.position));

    return AIResult.Succeeded;
  }
}

export const GetPosition = createNode(AIGetPositionNode);
