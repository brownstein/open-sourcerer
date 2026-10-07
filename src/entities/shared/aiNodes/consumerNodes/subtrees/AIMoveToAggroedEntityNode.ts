import { Vector2 } from "three";

import { AINodeInput } from "src/api/ai";
import { AINode } from "src/engine/entity/AIBehaviorTree";
import { Sequence } from "src/engine/entity/AICoreNodes";

import { GetAggroedEntityPosition } from "../../producerNodes/AIGetAggroedEntityPositionNode";
import { MoveToPosition } from "../AIMoveToPositionNode";

export const MoveToAggroedEntity = (
  inStopDistanceAway: AINodeInput<number | undefined> = undefined,
  inShouldWaitForPathFollowing: AINodeInput<boolean> = false
) => {
  const stopDistanceAway = AINode.ResolveInput(inStopDistanceAway);
  const shouldWaitForPathFollowing = AINode.ResolveInput(
    inShouldWaitForPathFollowing
  );

  const targetPositionStore = AINode.CreateSharedVariable<Vector2>(
    new Vector2()
  );

  // prettier-ignore
  return (
    Sequence(
      GetAggroedEntityPosition(targetPositionStore),
      MoveToPosition(targetPositionStore, stopDistanceAway, shouldWaitForPathFollowing)
    )
  );
};
