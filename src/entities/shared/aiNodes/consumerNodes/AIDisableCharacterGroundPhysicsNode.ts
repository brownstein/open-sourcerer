import { AINodeData, AIResult } from "src/api/ai";
import { AINode, createNode } from "src/engine/entity/AIBehaviorTree";

import { CharacterGroundPhysicsControlBehavior } from "../../behaviors/CharacterGroundPhysicsController";

class AIDisableCharacterGroundPhysicsNode extends AINode {
  run(data: AINodeData): AIResult {
    const characterGroundPhysicsBehavior =
      data.thisEntity.behaviors.physicsControl;
    if (
      !characterGroundPhysicsBehavior ||
      !(
        characterGroundPhysicsBehavior instanceof
        CharacterGroundPhysicsControlBehavior
      )
    )
      return AIResult.Succeeded;

    characterGroundPhysicsBehavior.disable();

    return AIResult.Succeeded;
  }
}

export const DisableCharacterGroundPhysics = createNode(
  AIDisableCharacterGroundPhysicsNode
);
