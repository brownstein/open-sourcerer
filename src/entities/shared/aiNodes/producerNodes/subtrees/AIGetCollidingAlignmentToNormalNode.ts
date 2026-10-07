import { Vector2 } from "three";

import { AINodeInput, AINodeOutput } from "src/api/ai";
import { BaseEntityType, EntityAlignment } from "src/api/entity";
import { AINode } from "src/engine/entity/AIBehaviorTree";
import { Do, Sequence } from "src/engine/entity/AICoreNodes";

import { GetCollidingEntitiesToNormal } from "../AIGetCollidingEntitiesToNormalNode";

export const GetCollidingAlignmentToNormal = (
  inTargetAlignment: AINodeInput<EntityAlignment>,
  outCollidedAlignmentToNormal: AINodeOutput<Map<BaseEntityType, Vector2>>
) => {
  const targetAlignment = AINode.ResolveInput(inTargetAlignment);

  const FilterForTargetAlignment = () =>
    outCollidedAlignmentToNormal.value.forEach((_normal, entity) => {
      if (entity.alignment !== targetAlignment.value)
        outCollidedAlignmentToNormal.value.delete(entity);
    });

  // prettier-ignore
  return (
    Sequence(
      GetCollidingEntitiesToNormal(outCollidedAlignmentToNormal),
      Do(FilterForTargetAlignment)
    )
  );
};
