import { Vector2 } from "three";

import { AINodeData, AINodeOutput, AIResult } from "src/api/ai";
import { AINode, createNode } from "src/engine/entity/AIBehaviorTree";
import { vector3To2 } from "src/engine/util/vecTypes";

import { EnemyAggroBehavior } from "../../behaviors/EnemyAggroBehavior";

class AIGetAggroedEntityPositionNode extends AINode {
  private readonly targetPosition: AINodeOutput<Vector2>;

  constructor(outTargetPosition: AINodeOutput<Vector2>) {
    super();

    this.targetPosition = outTargetPosition;
  }

  run(data: AINodeData): AIResult {
    const aggroBehavior = data.thisEntity.behaviors.aggro;
    if (!aggroBehavior || !(aggroBehavior instanceof EnemyAggroBehavior))
      return AIResult.Failed;

    const target = aggroBehavior.resolveCurrentTarget();
    if (!target) return AIResult.Failed;
    this.targetPosition.value.copy(vector3To2(target.position));
    return AIResult.Succeeded;
  }
}

export const GetAggroedEntityPosition = createNode(
  AIGetAggroedEntityPositionNode
);
