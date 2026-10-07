import {
  AINodeData,
  AINodeInput,
  AINodeOutput,
  AINodeResolvedInput,
  AIResult
} from "src/api/ai";
import { BaseEntityType } from "src/api/entity";
import { AINode, createNode } from "src/engine/entity/AIBehaviorTree";
import { distance3DTo2D } from "src/util/mathUtils";

class AIGetFilteredInRangeEntitiesNode extends AINode {
  private readonly matchedEntities: AINodeOutput<BaseEntityType[]>;
  private readonly filterCallbackFn: (entity: BaseEntityType) => boolean;
  private readonly radius: AINodeResolvedInput<number>;
  private readonly shouldIncludeSelf: AINodeResolvedInput<boolean>;

  constructor(
    outMatchedEntities: AINodeOutput<BaseEntityType[]>,
    inFilterCallbackFn: (entity: BaseEntityType) => boolean,
    inRadius: AINodeInput<number> = Infinity,
    inShouldIncludeSelf: AINodeInput<boolean> = true
  ) {
    super();

    this.matchedEntities = outMatchedEntities;
    this.filterCallbackFn = inFilterCallbackFn;
    this.radius = AINode.ResolveInput(inRadius);
    this.shouldIncludeSelf = AINode.ResolveInput(inShouldIncludeSelf);
  }

  run(data: AINodeData): AIResult {
    const thisEntity = data.thisEntity;
    const matchedEntities: BaseEntityType[] = [];

    for (const [id, entity] of data.level.getEntities()) {
      if (!this.shouldIncludeSelf.value && id === thisEntity.id) continue;
      if (
        distance3DTo2D(thisEntity.position, entity.position) > this.radius.value
      )
        continue;
      if (!this.filterCallbackFn(entity)) continue;

      matchedEntities.push(entity);
    }

    this.matchedEntities.value = matchedEntities;
    return AIResult.Succeeded;
  }
}

export const GetFilteredInRangeEntities = createNode(
  AIGetFilteredInRangeEntitiesNode
);
