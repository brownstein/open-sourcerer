import { AINodeData, AINodeOutput, AIResult } from "src/api/ai";
import { BaseEntityType } from "src/api/entity";
import { AINode, createNode } from "src/engine/entity/AIBehaviorTree";

import { EnemyAggroBehavior } from "../../behaviors/EnemyAggroBehavior";

class AIGetEntityAggroedWithNode extends AINode {
  private readonly entityAggroedWith: AINodeOutput<BaseEntityType | undefined>;

  constructor(outEntityAggroedWith: AINodeOutput<BaseEntityType | undefined>) {
    super();

    this.entityAggroedWith = outEntityAggroedWith;
  }

  run(data: AINodeData): AIResult {
    const aggroBehavior = data.thisEntity.behaviors.aggro;

    if (!aggroBehavior || !(aggroBehavior instanceof EnemyAggroBehavior)) {
      this.entityAggroedWith.value = undefined;
      return AIResult.Failed;
    }

    this.entityAggroedWith.value = aggroBehavior.resolveCurrentTarget();

    return AIResult.Succeeded;
  }
}

export const GetEntityAggroedWith = createNode(AIGetEntityAggroedWithNode);
