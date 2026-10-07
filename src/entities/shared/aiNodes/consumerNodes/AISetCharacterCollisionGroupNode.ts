import {
  AINodeData,
  AINodeInput,
  AINodeResolvedInput,
  AIResult
} from "src/api/ai";
import { AINode, createNode } from "src/engine/entity/AIBehaviorTree";

import { CharacterPhysicsBehavior } from "../../behaviors/CharacterPhysics";

class AISetCharacterCollisionGroupNode extends AINode {
  private readonly collisionGroupToSet: AINodeResolvedInput<number>;

  constructor(inCollisionGroupToSet: AINodeInput<number>) {
    super();

    this.collisionGroupToSet = AINode.ResolveInput(inCollisionGroupToSet);
  }

  run(data: AINodeData): AIResult {
    const physicsBehavior = data.thisEntity.behaviors.physics;
    if (
      !physicsBehavior ||
      !(physicsBehavior instanceof CharacterPhysicsBehavior)
    )
      return AIResult.Failed;

    physicsBehavior.setGroup(this.collisionGroupToSet.value);

    return AIResult.Succeeded;
  }
}

export const SetCharacterCollisionGroup = createNode(
  AISetCharacterCollisionGroupNode
);
