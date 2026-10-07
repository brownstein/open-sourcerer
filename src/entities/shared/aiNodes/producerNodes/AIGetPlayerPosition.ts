import { Vector2 } from "three";

import { AINodeData, AINodeOutput, AIResult } from "src/api/ai";
import { AINode, createNode } from "src/engine/entity/AIBehaviorTree";
import { vector3To2 } from "src/engine/util/vecTypes";

class AIGetPlayerPositionNode extends AINode {
  private readonly playerPosition: AINodeOutput<Vector2>;

  constructor(outPlayerPosition: AINodeOutput<Vector2>) {
    super();

    this.playerPosition = outPlayerPosition;
  }

  run(data: AINodeData): AIResult {
    if (!data.player) return AIResult.Failed;

    this.playerPosition.value.copy(vector3To2(data.player.position));
    return AIResult.Succeeded;
  }
}

export const GetPlayerPosition = createNode(AIGetPlayerPositionNode);
