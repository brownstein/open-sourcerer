import { AINodeData, AIResult } from "src/api/ai";
import { AINode, createNode } from "src/engine/entity/AIBehaviorTree";
import { InteractionBehavior } from "src/entities/environment/behaviors/InteractionBehavior";

class AIDisableInteractionsNode extends AINode {
  run(data: AINodeData): AIResult {
    const interactionBehavior = data.thisEntity.behaviors.interaction;
    if (
      !interactionBehavior ||
      !(interactionBehavior instanceof InteractionBehavior)
    )
      return AIResult.Succeeded;

    interactionBehavior.disable();
    interactionBehavior.setFocused(false);

    return AIResult.Succeeded;
  }
}

export const DisableInteractions = createNode(AIDisableInteractionsNode);
