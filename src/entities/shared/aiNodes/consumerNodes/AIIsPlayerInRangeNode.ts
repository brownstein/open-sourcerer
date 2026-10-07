import {
  AINodeData,
  AINodeInput,
  AINodeResolvedInput,
  AIResult
} from "src/api/ai";
import { AINode, createNode } from "src/engine/entity/AIBehaviorTree";
import { distance3DTo2D } from "src/util/mathUtils";

class AIIsPlayerInRangeNode extends AINode {
  private readonly inRangeMaxDistance: AINodeResolvedInput<number>;

  constructor(inInRangeMaxDistance: AINodeInput<number>) {
    super();

    this.inRangeMaxDistance = AINode.ResolveInput(inInRangeMaxDistance);
  }

  run(data: AINodeData): AIResult {
    if (!data.player) return AIResult.Failed;

    const distanceToPlayer = distance3DTo2D(
      data.thisEntity.position,
      data.player.position
    );

    if (distanceToPlayer <= this.inRangeMaxDistance.value)
      return AIResult.Succeeded;

    return AIResult.Failed;
  }
}

export const IsPlayerInRange = createNode(AIIsPlayerInRangeNode);
