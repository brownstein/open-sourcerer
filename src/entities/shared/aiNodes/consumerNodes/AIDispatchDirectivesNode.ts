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

class AIDispatchDirectivesNode<
  TEntity extends BaseEntityTypeWithPartialBehaviorMap,
  TDirectives extends Partial<GetDirectives<TEntity>> = Partial<
    GetDirectives<TEntity>
  >
> extends AINode {
  private readonly entityToDispatchTo: AINodeResolvedInput<TEntity | undefined>;
  private readonly directives: AINodeResolvedInput<TDirectives>;

  constructor(
    inEntityToDispatchTo: AINodeInput<TEntity | undefined>,
    inDirectives: AINodeInput<TDirectives>
  ) {
    super();

    this.entityToDispatchTo = AINode.ResolveInput(inEntityToDispatchTo);
    this.directives = AINode.ResolveInput(inDirectives);
  }

  run(_data: AINodeData): AIResult {
    const entity = this.entityToDispatchTo.value;
    if (!entity) return AIResult.Failed;

    const aiBehavior = entity.behaviors.ai;
    if (!aiBehavior || !(aiBehavior instanceof AIBehavior))
      return AIResult.Failed;

    for (const [key, value] of Object.entries(this.directives.value)) {
      const directiveKey = key as keyof TDirectives;
      const keyValue = value as TDirectives[typeof directiveKey];

      aiBehavior.dispatchDirective(directiveKey, keyValue);
    }

    return AIResult.Succeeded;
  }
}

export const DispatchDirectives = createNode(AIDispatchDirectivesNode) as <
  TEntity extends BaseEntityTypeWithPartialBehaviorMap,
  TDirectives extends Partial<GetDirectives<TEntity>> = Partial<
    GetDirectives<TEntity>
  >
>(
  ...args: ConstructorParameters<
    typeof AIDispatchDirectivesNode<TEntity, TDirectives>
  >
) => AIDispatchDirectivesNode<TEntity, TDirectives>;
