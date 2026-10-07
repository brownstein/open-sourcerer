import { Vector2 } from "three";

import { AINodeInput } from "src/api/ai";
import { AINode } from "src/engine/entity/AIBehaviorTree";
import {
  Do,
  Sequence,
  Setup,
  Succeeder,
  Timeout,
  Verify,
  Wait
} from "src/engine/entity/AICoreNodes";

import { GetPosition } from "../../producerNodes/AIGetPositionNode";
import { MoveToPosition } from "../AIMoveToPositionNode";

export const GroundPatrol = (
  inMinPatrolRadius: AINodeInput<number>,
  inMaxPatrolRadius: AINodeInput<number>,
  inPauseDurationMs: AINodeInput<number> = 0,
  inPatrolAroundHomePosition: AINodeInput<boolean> = false,
  inShouldInitiallyMoveRight: AINodeInput<boolean> = true
) => {
  const minPatrolRadius = AINode.ResolveInput(inMinPatrolRadius);
  const maxPatrolRadius = AINode.ResolveInput(inMaxPatrolRadius);
  const pauseDurationMs = AINode.ResolveInput(inPauseDurationMs);
  const patrolAroundHomePosition = AINode.ResolveInput(
    inPatrolAroundHomePosition
  );
  const shouldInitiallyMoveRight = AINode.ResolveInput(
    inShouldInitiallyMoveRight
  );

  const targetPositionStore = AINode.CreateSharedVariable(new Vector2());

  let hasLastMovedRight = !shouldInitiallyMoveRight.value;
  const homePosition = new Vector2();

  const AddRandomHorizontalOffsetToTargetPosition = () => {
    const absoluteRandomOffset =
      minPatrolRadius.value +
      Math.random() * (maxPatrolRadius.value - minPatrolRadius.value);
    const directionalOffset = hasLastMovedRight
      ? -absoluteRandomOffset
      : absoluteRandomOffset;

    hasLastMovedRight = !hasLastMovedRight;

    targetPositionStore.value.x += directionalOffset;
  };

  let varyingPauseDurationMs = pauseDurationMs.value;

  const RandomizeWaitTime = () => {
    varyingPauseDurationMs =
      (Math.random() * 0.5 + 0.5) * pauseDurationMs.value;
  };

  // prettier-ignore
  return (
    Sequence(
      GetPosition(targetPositionStore),
      Succeeder(
        Sequence(
          Verify(patrolAroundHomePosition),
          Setup(
            Do(() => homePosition.copy(targetPositionStore.value))
          ),
          Do(() => targetPositionStore.value.copy(homePosition))
        )
      ),
      Do(AddRandomHorizontalOffsetToTargetPosition),
      Succeeder(
        Timeout(5000,
          MoveToPosition(targetPositionStore, 0, true)
        )
      ),
      Do(RandomizeWaitTime),
      Wait(() => varyingPauseDurationMs)
    )
  );
};
