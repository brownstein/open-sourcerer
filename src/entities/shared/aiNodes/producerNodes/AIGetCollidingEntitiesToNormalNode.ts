import { Vector2 } from "three";

import { AINodeData, AINodeOutput, AIResult } from "src/api/ai";
import { BaseEntityType } from "src/api/entity";
import { AINode, createNode } from "src/engine/entity/AIBehaviorTree";

import { CharacterPhysicsBehavior } from "../../behaviors/CharacterPhysics";

class AIGetCollidingEntitiesToNormalNode extends AINode {
  private readonly collidedEntitiesToNormal: AINodeOutput<
    Map<BaseEntityType, Vector2>
  >;

  constructor(
    outCollidedEntitiesToNormal: AINodeOutput<Map<BaseEntityType, Vector2>>
  ) {
    super();

    this.collidedEntitiesToNormal = outCollidedEntitiesToNormal;
  }

  run(data: AINodeData): AIResult {
    const physicsBehavior = data.thisEntity.behaviors.physics;
    if (
      !physicsBehavior ||
      !(physicsBehavior instanceof CharacterPhysicsBehavior)
    )
      return AIResult.Failed;

    this.collidedEntitiesToNormal.value = new Map(
      physicsBehavior.collidedEntitiesToNormal
    );
    return AIResult.Succeeded;
  }
}

export const GetCollidingEntitiesToNormal = createNode(
  AIGetCollidingEntitiesToNormalNode
);
