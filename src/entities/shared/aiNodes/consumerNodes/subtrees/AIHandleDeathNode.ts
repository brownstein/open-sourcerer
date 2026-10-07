import { AINodeInput } from "src/api/ai";
import { AINode } from "src/engine/entity/AIBehaviorTree";
import { Sequence } from "src/engine/entity/AICoreNodes";
import { APIAnimationData } from "src/entities/shared/behaviors/AnimationControlBehavior";

import { IsDead } from "../AIIsDeadNode";
import { Die } from "./AIDieNode";

export const HandleDeath = <TAnimations extends string>(
  inDeathAnimationData: AINodeInput<APIAnimationData<TAnimations>>,
  inShouldRemoveFromLevel: AINodeInput<boolean> = true
) => {
  const deathAnimationData = AINode.ResolveInput(inDeathAnimationData);
  const shouldRemoveFromLevel = AINode.ResolveInput(inShouldRemoveFromLevel);

  // prettier-ignore
  return (
    Sequence(
      IsDead(),
      Die(deathAnimationData, shouldRemoveFromLevel)
    )
  );
};
