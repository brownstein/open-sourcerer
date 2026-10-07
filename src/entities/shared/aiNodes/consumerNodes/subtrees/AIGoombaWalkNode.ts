import { Vector2 } from "three";

import { AINodeData, AINodeInput } from "src/api/ai";
import { ControlEvents } from "src/api/controls";
import { BaseEntityType } from "src/api/entity";
import { AINode } from "src/engine/entity/AIBehaviorTree";
import {
  Do,
  Selector,
  Sequence,
  Setup,
  Succeeder,
  Verify
} from "src/engine/entity/AICoreNodes";
import { CentralDataStoreBehavior } from "src/entities/shared/behaviors/CentralDataStoreBehavior";

import { GetCollidingEntitiesToNormal } from "../../producerNodes/AIGetCollidingEntitiesToNormalNode";
import { GetData } from "../../producerNodes/AIGetDataNode";
import { DetectLedge } from "../AIDetectLedgeNode";
import { IsGrounded } from "../AIIsGroundedNode";

export const GoombaWalk = (
  inLedgeDetectionXOffset: AINodeInput<number> = 0
) => {
  const ledgeDetectionXOffset = AINode.ResolveInput(inLedgeDetectionXOffset);

  const dataStore = AINode.CreateSharedVariable<AINodeData>();
  const collidingEntitiesToNormalStore = AINode.CreateSharedVariable<
    Map<BaseEntityType, Vector2>
  >(new Map());

  let currentDirection = 1;
  const HORIZONTAL_NORMAL_THRESHOLD = 0.7;

  const DetectWall = (): boolean => {
    for (const [, normal] of collidingEntitiesToNormalStore.value) {
      const isHorizontal = Math.abs(normal.x) > HORIZONTAL_NORMAL_THRESHOLD;
      const doesBlockOurMovement = Math.sign(normal.x) === currentDirection;

      if (isHorizontal && doesBlockOurMovement) return true;
    }

    return false;
  };

  const FlipDirection = () => {
    currentDirection *= -1;

    const dataStoreBehavior = dataStore.value.thisEntity.behaviors.data;
    if (!(dataStoreBehavior instanceof CentralDataStoreBehavior)) return;

    dataStoreBehavior.controlEvents.emit(
      ControlEvents.MoveHorizontally,
      currentDirection
    );
  };

  // prettier-ignore
  return (
    Sequence(
      GetData(dataStore),
      GetCollidingEntitiesToNormal(collidingEntitiesToNormalStore),
      Setup(
        Do(FlipDirection)
      ),
      Succeeder(
        Sequence(
          IsGrounded(),
          Selector(
            DetectLedge(ledgeDetectionXOffset),
            Verify(DetectWall)
          ),
          Do(FlipDirection)
        )
      ),
    )
  );
};
