import { AINodeInput } from "src/api/ai";
import { AINode } from "src/engine/entity/AIBehaviorTree";
import { Debounce, Succeeder } from "src/engine/entity/AICoreNodes";

import { MoveToAggroedEntity } from "./AIMoveToAggroedEntityNode";

export const ChaseAggroedEntity = (
  inStopDistanceAway: AINodeInput<number | undefined> = undefined
) => {
  const stopDistanceAway = AINode.ResolveInput(inStopDistanceAway);

  // prettier-ignore
  return (
    Succeeder(
      Debounce(500,
        MoveToAggroedEntity(stopDistanceAway)
      )
    )
  );
};
