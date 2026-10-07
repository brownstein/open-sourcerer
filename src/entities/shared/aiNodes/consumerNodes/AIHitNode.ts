import {
  AINodeData,
  AINodeInput,
  AINodeResolvedInput,
  AIResult
} from "src/api/ai";
import { BaseEntityType, EntityHitDetails } from "src/api/entity";
import { AINode, createNode } from "src/engine/entity/AIBehaviorTree";

export type AIHitNodeHitDetails = Omit<
  EntityHitDetails,
  "hittingEntity" | "sourceEntity"
> &
  Partial<Pick<EntityHitDetails, "hittingEntity" | "sourceEntity">>;

class AIHitNode extends AINode {
  private readonly hitDetails: AINodeResolvedInput<AIHitNodeHitDetails>;
  private readonly entityToHit: AINodeResolvedInput<BaseEntityType | undefined>;

  constructor(
    inEntityToHit: AINodeInput<BaseEntityType | undefined>,
    inHitDetails: AINodeInput<AIHitNodeHitDetails>
  ) {
    super();

    this.hitDetails = AINode.ResolveInput(inHitDetails);
    this.entityToHit = AINode.ResolveInput(inEntityToHit);
  }

  run(data: AINodeData): AIResult {
    if (!this.entityToHit.value) return AIResult.Failed;
    if (!this.entityToHit.value.hit) return AIResult.Failed;

    this.entityToHit.value.hit({
      ...this.hitDetails.value,
      hittingEntity: this.hitDetails.value.hittingEntity ?? data.thisEntity,
      sourceEntity: this.hitDetails.value.sourceEntity ?? data.thisEntity
    });

    return AIResult.Succeeded;
  }
}

export const Hit = createNode(AIHitNode);
