import { AINodeData, AIResult } from "src/api/ai";
import { AINode, createNode } from "src/engine/entity/AIBehaviorTree";
import { InteractionBehavior } from "src/entities/environment/behaviors/InteractionBehavior";

class AIHasBeenInteractedWithNode extends AINode {
  run(data: AINodeData): AIResult {
    const interactionBehavior = data.thisEntity.behaviors.interaction;
    if (
      !interactionBehavior ||
      !(interactionBehavior instanceof InteractionBehavior)
    )
      return AIResult.Failed;

    const hasBeenInteractedWith = interactionBehavior.hasBeenInteractedWith;

    return hasBeenInteractedWith ? AIResult.Succeeded : AIResult.Failed;
  }
}

export const HasBeenInteractedWith = createNode(AIHasBeenInteractedWithNode);
