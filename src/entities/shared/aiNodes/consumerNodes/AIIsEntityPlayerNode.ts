import {
  AINodeData,
  AINodeInput,
  AINodeResolvedInput,
  AIResult
} from "src/api/ai";
import { BaseEntityType, EntityAlignment } from "src/api/entity";
import { AINode, createNode } from "src/engine/entity/AIBehaviorTree";
import { isPlayerAPI } from "src/entities/player/PlayerAPI";

class AIIsEntityPlayerNode extends AINode {
  private readonly entity: AINodeResolvedInput<BaseEntityType | undefined>;

  constructor(inEntity: AINodeInput<BaseEntityType | undefined>) {
    super();

    this.entity = AINode.ResolveInput(inEntity);
  }

  run(_data: AINodeData): AIResult {
    const isPlayer = isPlayerAPI(this.entity.value);
    const hasPlayerAlignment =
      this.entity.value?.alignment === EntityAlignment.Player;

    if (!isPlayer && !hasPlayerAlignment) return AIResult.Failed;

    return AIResult.Succeeded;
  }
}

export const IsEntityPlayer = createNode(AIIsEntityPlayerNode);
