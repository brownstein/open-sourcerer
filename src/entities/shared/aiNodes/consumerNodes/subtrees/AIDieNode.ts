import { AINodeInput } from "src/api/ai";
import { AINode } from "src/engine/entity/AIBehaviorTree";
import { Sequence, Succeeder, Verify } from "src/engine/entity/AICoreNodes";
import { APIAnimationData } from "src/entities/shared/behaviors/AnimationControlBehavior";

import { ScopeWithAnimation } from "../../decoratorNodes/AIScopeWithAnimationNode";
import { DisableAnimation } from "../AIDisableAnimationNode";
import { DisableCharacterPhysics } from "../AIDisableCharacterPhysicsNode";
import { DisablePathFollowing } from "../AIDisablePathFollowingNode";
import { RemoveFromLevel } from "../AIRemoveFromLevelNode";
import { WaitForAnimationLoop } from "../AIWaitForAnimationLoopNode";

export const Die = <TAnimations extends string>(
  inDeathAnimationData: AINodeInput<APIAnimationData<TAnimations>>,
  inShouldRemoveFromLevel: AINodeInput<boolean> = true
) => {
  const deathAnimationData = AINode.ResolveInput(inDeathAnimationData);
  const shouldRemoveFromLevel = AINode.ResolveInput(inShouldRemoveFromLevel);

  // prettier-ignore
  return (
    Sequence(
      DisableCharacterPhysics(),
      DisablePathFollowing(),
      ScopeWithAnimation(deathAnimationData,
        Sequence(
          WaitForAnimationLoop(),
          DisableAnimation(),
          Succeeder(
            Sequence(
              Verify(shouldRemoveFromLevel),
              RemoveFromLevel()
            )
          )
        )
      )
    )
  );
};
