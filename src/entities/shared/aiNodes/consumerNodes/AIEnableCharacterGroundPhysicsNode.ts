import { AINodeData, AIResult } from "src/api/ai";
import { AINode, createNode } from "src/engine/entity/AIBehaviorTree";

import { CharacterGroundPhysicsControlBehavior } from "../../behaviors/CharacterGroundPhysicsController";

class AIEnableCharacterGroundPhysicsNode extends AINode {
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
      return AIResult.Failed;

    characterGroundPhysicsBehavior.enable();

    return AIResult.Succeeded;
  }
}

export const EnableCharacterGroundPhysics = createNode(
  AIEnableCharacterGroundPhysicsNode
);
