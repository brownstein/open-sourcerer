import {
  AINodeData,
  AINodeInput,
  AINodeResolvedInput,
  AIResult,
  BaseAIBehaviorTree
} from "src/api/ai";
import { AINode, createNode } from "src/engine/entity/AIBehaviorTree";

import { AIBehavior } from "../../behaviors/AIBehavior";

class AISwapAIBehaviorNode extends AINode {
  private readonly behaviorTreeToSwapTo: AINodeResolvedInput<BaseAIBehaviorTree>;

  constructor(inBehaviorTreeToSwapTo: AINodeInput<BaseAIBehaviorTree>) {
    super();

    this.behaviorTreeToSwapTo = AINode.ResolveInput(inBehaviorTreeToSwapTo);
  }

  run(data: AINodeData): AIResult {
    const aiBehavior = data.thisEntity.behaviors.ai;
    if (!aiBehavior || !(aiBehavior instanceof AIBehavior))
      return AIResult.Failed;

    aiBehavior.behaviorTree = this.behaviorTreeToSwapTo.value;

    return AIResult.Succeeded;
  }
}

export const SwapAIBehavior = createNode(AISwapAIBehaviorNode);
