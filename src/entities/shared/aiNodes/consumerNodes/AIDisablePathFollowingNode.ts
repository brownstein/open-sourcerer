import { AINodeData, AIResult } from "src/api/ai";
import { ControlEvents } from "src/api/controls";
import { AINode, createNode } from "src/engine/entity/AIBehaviorTree";

import { NavPathFollowingBehavior } from "../../behaviors/NavPathFollowingBehavior";

class AIDisablePathFollowingNode extends AINode {
  run(data: AINodeData): AIResult {
    const entityPathFollowingBehavior = data.thisEntity.behaviors.pathFollowing;
    if (
      !entityPathFollowingBehavior ||
      !(entityPathFollowingBehavior instanceof NavPathFollowingBehavior)
    )
      return AIResult.Succeeded;

    entityPathFollowingBehavior.disableMotion();
    entityPathFollowingBehavior.cancelPath();
    entityPathFollowingBehavior.controlEvents.emit(
      ControlEvents.MoveHorizontally,
      0
    );

    return AIResult.Succeeded;
  }
}

export const DisablePathFollowing = createNode(AIDisablePathFollowingNode);
