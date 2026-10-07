import {
  AINodeData,
  AINodeInput,
  AINodeOutput,
  AINodeResolvedInput,
  AIResult,
  BaseEntityTypeWithPartialBehaviorMap
} from "src/api/ai";
import { AINode, createNode } from "src/engine/entity/AIBehaviorTree";

import { AIBehavior } from "../../behaviors/AIBehavior";
import { GetDirectives } from "../../util/UtilityTypes";

class AIReadDirectiveNode<
  TEntity extends BaseEntityTypeWithPartialBehaviorMap,
  TKey extends keyof GetDirectives<TEntity> = keyof GetDirectives<TEntity>,
  TValue extends GetDirectives<TEntity>[TKey] = GetDirectives<TEntity>[TKey]
> extends AINode {
  private readonly entityToReadFrom: AINodeResolvedInput<TEntity | undefined>;
  private readonly directiveToRead: AINodeResolvedInput<TKey>;
  private readonly directiveValue: AINodeOutput<TValue | undefined>;

  constructor(
    inEntityToReadFrom: AINodeInput<TEntity | undefined>,
    inDirectiveToRead: AINodeInput<TKey>,
    outDirectiveValue: AINodeOutput<TValue | undefined>
  ) {
    super();

    this.entityToReadFrom = AINode.ResolveInput(inEntityToReadFrom);
    this.directiveToRead = AINode.ResolveInput(inDirectiveToRead);
    this.directiveValue = outDirectiveValue;
  }

  run(_data: AINodeData): AIResult {
    const entity = this.entityToReadFrom.value;
    if (!entity) return AIResult.Failed;

    const aiBehavior = entity.behaviors.ai;
    if (!aiBehavior || !(aiBehavior instanceof AIBehavior))
      return AIResult.Failed;

    this.directiveValue.value = aiBehavior.readDirective(
      this.directiveToRead.value
    );

    if (this.directiveValue.value === undefined) return AIResult.Failed;

    return AIResult.Succeeded;
  }
}

export const ReadDirective = createNode(AIReadDirectiveNode) as <
  TEntity extends BaseEntityTypeWithPartialBehaviorMap,
  TKey extends keyof GetDirectives<TEntity> = keyof GetDirectives<TEntity>,
  TValue extends GetDirectives<TEntity>[TKey] = GetDirectives<TEntity>[TKey]
>(
  ...args: ConstructorParameters<
    typeof AIReadDirectiveNode<TEntity, TKey, TValue>
  >
) => AIReadDirectiveNode<TEntity, TKey, TValue>;
