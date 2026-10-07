import {
  AINodeData,
  AINodeInput,
  AINodeResolvedInput,
  AIResult
} from "src/api/ai";
import { BaseEntityType } from "src/api/entity";
import { AINode, createNode } from "src/engine/entity/AIBehaviorTree";
import { distance3DTo2D } from "src/util/mathUtils";

class AIIsEntityInRangeNode extends AINode {
  private readonly entity: AINodeResolvedInput<BaseEntityType>;
  private readonly inRangeMaxDistance: AINodeResolvedInput<number>;

  constructor(
    inEntity: AINodeInput<BaseEntityType>,
    inInRangeMaxDistance: AINodeInput<number>
  ) {
    super();

    this.entity = AINode.ResolveInput(inEntity);
    this.inRangeMaxDistance = AINode.ResolveInput(inInRangeMaxDistance);
  }

  run(data: AINodeData): AIResult {
    const distanceToEntity = distance3DTo2D(
      data.thisEntity.position,
      this.entity.value.position
    );

    if (distanceToEntity > this.inRangeMaxDistance.value)
      return AIResult.Failed;

    return AIResult.Succeeded;
  }
}

export const IsEntityInRange = createNode(AIIsEntityInRangeNode);
