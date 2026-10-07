import { Vector2 } from "three";

import { AINodeData, AINodeInput } from "src/api/ai";
import { AINode } from "src/engine/entity/AIBehaviorTree";
import { Do, Sequence } from "src/engine/entity/AICoreNodes";
import { AnimationControlBehavior } from "src/entities/shared/behaviors/AnimationControlBehavior";

import { IsAggroedEntityInVisionCone } from "./AIIsAggroedEntityInVisionConeNode";

export const IsAggroedEntityInFront = (
  inSpreadAngle: AINodeInput<number>,
  inMaxRange: AINodeInput<number> = Infinity
) => {
  const spreadAngle = AINode.ResolveInput(inSpreadAngle);
  const maxRange = AINode.ResolveInput(inMaxRange);

  const coneDirection = new Vector2(1, 0);

  const TakeIntoAccountFacingDirection = (data: AINodeData) => {
    const animationBehavior = data.thisEntity.behaviors.animation;
    if (
      !animationBehavior ||
      !(animationBehavior instanceof AnimationControlBehavior)
    ) {
      coneDirection.x = 1;
      return;
    }

    coneDirection.x = animationBehavior.facingDirection;
  };

  // prettier-ignore
  return (
    Sequence(
      Do(TakeIntoAccountFacingDirection),
      IsAggroedEntityInVisionCone(coneDirection, maxRange, spreadAngle)
    )
  );
};
