import { AINodeData, AIResult } from "src/api/ai";
import { inactiveEnemyCollisionGroup } from "src/engine/constants/collisionGroups";
import { AINode, createNode } from "src/engine/entity/AIBehaviorTree";

import { CharacterPhysicsBehavior } from "../../behaviors/CharacterPhysics";

class AIDisableCharacterPhysicsNode extends AINode {
  run(data: AINodeData): AIResult {
    const entityPhysicsBehavior = data.thisEntity.behaviors.physics;
    if (
      !entityPhysicsBehavior ||
      !(entityPhysicsBehavior instanceof CharacterPhysicsBehavior)
    )
      return AIResult.Succeeded;

    entityPhysicsBehavior.setGroup(inactiveEnemyCollisionGroup);
    entityPhysicsBehavior.disable();

    return AIResult.Succeeded;
  }
}

export const DisableCharacterPhysics = createNode(
  AIDisableCharacterPhysicsNode
);
