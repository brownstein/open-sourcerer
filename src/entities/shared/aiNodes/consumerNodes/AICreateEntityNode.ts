import {
  AINodeData,
  AINodeInput,
  AINodeResolvedInput,
  AIResult
} from "src/api/ai";
import { BaseEntityType } from "src/api/entity";
import { AINode, createNode } from "src/engine/entity/AIBehaviorTree";

class AICreateEntityNode extends AINode {
  private readonly entity: AINodeResolvedInput<BaseEntityType>;

  constructor(inEntity: AINodeInput<BaseEntityType>) {
    super();

    this.entity = AINode.ResolveInput(inEntity);
  }

  run(data: AINodeData): AIResult {
    data.level.addEntity(this.entity.value);

    return AIResult.Succeeded;
  }
}

export const CreateEntity = createNode(AICreateEntityNode);
