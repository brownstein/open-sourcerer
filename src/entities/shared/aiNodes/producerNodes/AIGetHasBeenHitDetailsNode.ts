import { AINodeData, AINodeOutput, AIResult } from "src/api/ai";
import { EntityHitDetails } from "src/api/entity";
import { AINode, createNode } from "src/engine/entity/AIBehaviorTree";

import { StatusBehavior } from "../../behaviors/StatusBehavior";

class AIGetHasBeenHitDetailsNode extends AINode {
  private readonly hitDetails: AINodeOutput<EntityHitDetails>;

  constructor(outHitDetails: AINodeOutput<EntityHitDetails>) {
    super();

    this.hitDetails = outHitDetails;
  }

  run(data: AINodeData): AIResult {
    const statusBehavior = data.thisEntity.behaviors.status;
    if (!statusBehavior || !(statusBehavior instanceof StatusBehavior))
      return AIResult.Failed;

    const hasBeenHitDetails = statusBehavior.hasBeenHitDetails;
    if (!hasBeenHitDetails) return AIResult.Failed;

    this.hitDetails.value = hasBeenHitDetails;
    return AIResult.Succeeded;
  }
}

export const GetHasBeenHitDetails = createNode(AIGetHasBeenHitDetailsNode);
