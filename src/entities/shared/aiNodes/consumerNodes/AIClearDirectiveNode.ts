import {
  AIDirectives,
  AINodeData,
  AINodeInput,
  AINodeResolvedInput,
  AIResult
} from "src/api/ai";
import { AINode, createNode } from "src/engine/entity/AIBehaviorTree";

import { AIBehavior } from "../../behaviors/AIBehavior";

class AIClearDirectiveNode<TDirective extends AIDirectives> extends AINode {
  private readonly keyToClear: AINodeResolvedInput<keyof TDirective>;

  constructor(inKeyToClear: AINodeInput<keyof TDirective>) {
    super();

    this.keyToClear = AINode.ResolveInput(inKeyToClear);
  }

  run(data: AINodeData): AIResult {
    const aiBehavior = data.thisEntity.behaviors.ai;
    if (!aiBehavior || !(aiBehavior instanceof AIBehavior))
      return AIResult.Succeeded;

    aiBehavior.clearDirective(this.keyToClear.value);

    return AIResult.Succeeded;
  }
}

export const ClearDirective = createNode(AIClearDirectiveNode) as <
  TDirective extends AIDirectives
>(
  ...args: ConstructorParameters<typeof AIClearDirectiveNode<TDirective>>
) => AIClearDirectiveNode<TDirective>;
