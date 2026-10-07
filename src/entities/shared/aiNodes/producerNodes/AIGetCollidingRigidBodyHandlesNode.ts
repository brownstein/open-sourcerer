import { AINodeData, AINodeOutput, AIResult } from "src/api/ai";
import { AINode, createNode } from "src/engine/entity/AIBehaviorTree";

import { CharacterPhysicsBehavior } from "../../behaviors/CharacterPhysics";

class AIGetCollidingRigidBodyHandlesNode extends AINode {
  private readonly collidingHandles: AINodeOutput<number[]>;

  constructor(outCollidingHandles: AINodeOutput<number[]>) {
    super();

    this.collidingHandles = outCollidingHandles;
  }

  run(data: AINodeData): AIResult {
    const physicsBehavior = data.thisEntity.behaviors.physics;
    if (
      !physicsBehavior ||
      !(physicsBehavior instanceof CharacterPhysicsBehavior)
    )
      return AIResult.Failed;

    const body = physicsBehavior.body;
    if (!body) return AIResult.Failed;

    this.collidingHandles.value = [
      ...data.level.getRigidBodiesCollidingWith(body.handle)
    ];

    return AIResult.Succeeded;
  }
}

export const GetCollidingRigidBodyHandles = createNode(
  AIGetCollidingRigidBodyHandlesNode
);
