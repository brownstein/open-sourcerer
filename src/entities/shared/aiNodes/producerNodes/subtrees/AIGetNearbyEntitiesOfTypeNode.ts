import { AINodeInput, AINodeOutput } from "src/api/ai";
import { BaseEntityType } from "src/api/entity";
import { AINode } from "src/engine/entity/AIBehaviorTree";

import { GetFilteredInRangeEntities } from "../AIGetFilteredInRangeEntitiesNode";

export const GetNearbyEntitiesOfType = (
  outMatchedEntities: AINodeOutput<BaseEntityType[]>,
  inType: AINodeInput<string>,
  inRadius: AINodeInput<number> = Infinity,
  inShouldIncludeSelf: AINodeInput<boolean> = true
) => {
  const matchedEntities = outMatchedEntities;
  const type = AINode.ResolveInput(inType);
  const radius = AINode.ResolveInput(inRadius);
  const shouldIncludeSelf = AINode.ResolveInput(inShouldIncludeSelf);

  // prettier-ignore
  return (
    GetFilteredInRangeEntities(
      matchedEntities, 
      (entity) => entity.type === type.value,
      radius,
      shouldIncludeSelf
    )
  );
};
