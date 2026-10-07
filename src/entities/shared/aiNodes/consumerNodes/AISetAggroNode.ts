import {
  AINodeData,
  AINodeInput,
  AINodeResolvedInput,
  AIResult
} from "src/api/ai";
import { BaseEntityType } from "src/api/entity";
import { AINode, createNode } from "src/engine/entity/AIBehaviorTree";

import { EnemyAggroBehavior } from "../../behaviors/EnemyAggroBehavior";

class AISetAggroNode extends AINode {
  private readonly entityToAggro: AINodeResolvedInput<BaseEntityType>;

  constructor(inEntityToAggro: AINodeInput<BaseEntityType>) {
    super();

    this.entityToAggro = AINode.ResolveInput(inEntityToAggro);
  }

  run(data: AINodeData): AIResult {
    const aggroBehavior = data.thisEntity.behaviors.aggro;
    if (!aggroBehavior || !(aggroBehavior instanceof EnemyAggroBehavior))
      return AIResult.Failed;

    aggroBehavior.setAggro(this.entityToAggro.value);
    return AIResult.Succeeded;
  }
}

export const SetAggro = createNode(AISetAggroNode);
