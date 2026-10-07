import { AINodeData, AIResult } from "src/api/ai";
import { ControlEvents } from "src/api/controls";
import { AINode, createNode } from "src/engine/entity/AIBehaviorTree";

import { NavPathFollowingBehavior } from "../../behaviors/NavPathFollowingBehavior";

class AICancelPathFollowingNode extends AINode {
  run(data: AINodeData): AIResult {
    const pathFollowingBehavior = data.thisEntity.behaviors.pathFollowing;
    if (
      !pathFollowingBehavior ||
      !(pathFollowingBehavior instanceof NavPathFollowingBehavior)
    )
      return AIResult.Succeeded;

    pathFollowingBehavior.cancelPath();
    pathFollowingBehavior.controlEvents.emit(ControlEvents.MoveHorizontally, 0);
    pathFollowingBehavior.controlEvents.emit(ControlEvents.MoveVertically, 0);

    return AIResult.Succeeded;
  }
}

export const CancelPathFollowing = createNode(AICancelPathFollowingNode);
