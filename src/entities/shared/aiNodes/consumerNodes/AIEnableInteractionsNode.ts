import { AINodeData, AIResult } from "src/api/ai";
import { AINode, createNode } from "src/engine/entity/AIBehaviorTree";
import { InteractionBehavior } from "src/entities/environment/behaviors/InteractionBehavior";

class AIEnableInteractionsNode extends AINode {
  run(data: AINodeData): AIResult {
    const interactionBehavior = data.thisEntity.behaviors.interaction;
    if (
      !interactionBehavior ||
      !(interactionBehavior instanceof InteractionBehavior)
    )
      return AIResult.Failed;

    interactionBehavior.enable();

    return AIResult.Succeeded;
  }
}

export const EnableInteractions = createNode(AIEnableInteractionsNode);
