import { Vector2 } from "three";

import { AINodeInput } from "src/api/ai";
import { AINode } from "src/engine/entity/AIBehaviorTree";
import { Sequence } from "src/engine/entity/AICoreNodes";

import { GetPlayerPosition } from "../../producerNodes/AIGetPlayerPosition";
import { MoveToPosition } from "../AIMoveToPositionNode";

export const MoveToPlayer = (
  inStopDistanceAway: AINodeInput<number | undefined> = undefined,
  inShouldWaitForPathFollowing: AINodeInput<boolean> = false
) => {
  const stopDistanceAway = AINode.ResolveInput(inStopDistanceAway);
  const shouldWaitForPathFollowing = AINode.ResolveInput(
    inShouldWaitForPathFollowing
  );

  const playerPositionStore = AINode.CreateSharedVariable<Vector2>(
    new Vector2()
  );

  // prettier-ignore
  return (
    Sequence(
      GetPlayerPosition(playerPositionStore),
      MoveToPosition(playerPositionStore, stopDistanceAway, shouldWaitForPathFollowing)
    )
  );
};
