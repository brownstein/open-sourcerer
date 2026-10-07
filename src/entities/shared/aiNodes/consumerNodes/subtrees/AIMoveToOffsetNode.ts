import { Vector2 } from "three";

import { AINodeInput } from "src/api/ai";
import { AINode } from "src/engine/entity/AIBehaviorTree";
import { Do, Sequence } from "src/engine/entity/AICoreNodes";

import { GetPosition } from "../../producerNodes/AIGetPositionNode";
import { MoveToPosition } from "../AIMoveToPositionNode";

export const MoveToOffset = (
  inOffset: AINodeInput<Vector2>,
  inStopDistanceAway: AINodeInput<number | undefined> = undefined,
  inShouldWaitForPathFollowing: AINodeInput<boolean> = false
) => {
  const offset = AINode.ResolveInput(inOffset);
  const stopDistanceAway = AINode.ResolveInput(inStopDistanceAway);
  const shouldWaitForPathFollowing = AINode.ResolveInput(
    inShouldWaitForPathFollowing
  );

  const targetPositionStore = AINode.CreateSharedVariable<Vector2>();

  // prettier-ignore
  return (
    Sequence(
      GetPosition(targetPositionStore),
      Do(() => targetPositionStore.value.add(offset.value)),
      MoveToPosition(targetPositionStore, stopDistanceAway, shouldWaitForPathFollowing)
    )
  );
};
