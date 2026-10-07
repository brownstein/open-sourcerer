import {
  AINodeData,
  AINodeInput,
  AINodeResolvedInput,
  AIResult,
  BaseEntityTypeWithPartialBehaviorMap
} from "src/api/ai";
import { AINode, createNode } from "src/engine/entity/AIBehaviorTree";

import { AIBehavior } from "../../behaviors/AIBehavior";
import { GetDirectives } from "../../util/UtilityTypes";

class AIClearEntityDirectiveNode<
  TEntity extends BaseEntityTypeWithPartialBehaviorMap,
  TKey extends keyof GetDirectives<TEntity> = keyof GetDirectives<TEntity>
> extends AINode {
  private readonly entityToClear: AINodeResolvedInput<TEntity | undefined>;
  private readonly keyToClear: AINodeResolvedInput<TKey>;

  constructor(
    inEntityToClear: AINodeInput<TEntity | undefined>,
    inKeyToClear: AINodeInput<TKey>
  ) {
    super();

    this.entityToClear = AINode.ResolveInput(inEntityToClear);
    this.keyToClear = AINode.ResolveInput(inKeyToClear);
  }

  run(_data: AINodeData): AIResult {
    const entity = this.entityToClear.value;
    if (!entity) return AIResult.Failed;

    const aiBehavior = entity.behaviors.ai;
    if (!aiBehavior || !(aiBehavior instanceof AIBehavior))
      return AIResult.Succeeded;

    aiBehavior.clearDirective(this.keyToClear.value);

    return AIResult.Succeeded;
  }
}

export const ClearEntityDirective = createNode(AIClearEntityDirectiveNode) as <
  TEntity extends BaseEntityTypeWithPartialBehaviorMap,
  TKey extends keyof GetDirectives<TEntity> = keyof GetDirectives<TEntity>
>(
  ...args: ConstructorParameters<
    typeof AIClearEntityDirectiveNode<TEntity, TKey>
  >
) => AIClearEntityDirectiveNode<TEntity, TKey>;
