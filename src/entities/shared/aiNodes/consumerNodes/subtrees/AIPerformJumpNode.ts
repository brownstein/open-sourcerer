import { Vector2 } from "three";

import { AINodeData, AINodeInput, AIResult } from "src/api/ai";
import { AINode } from "src/engine/entity/AIBehaviorTree";
import {
  Do,
  Execute,
  Inverter,
  Selector,
  Sequence,
  Succeeder,
  Verify,
  WaitUntilSuccess
} from "src/engine/entity/AICoreNodes";

import { DisableCharacterGroundPhysics } from "../AIDisableCharacterGroundPhysicsNode";
import { EnableCharacterGroundPhysics } from "../AIEnableCharacterGroundPhysicsNode";
import { IsGrounded } from "../AIIsGroundedNode";
import { SetLinvel } from "./AISetLinvelNode";

export const PerformJump = (
  inJumpVelocity: AINodeInput<Vector2>,
  inTargetLandingPosition: AINodeInput<Vector2>,
  inShouldControlCharacterGroundPhysics: AINodeInput<boolean> = true
) => {
  const jumpVelocity = AINode.ResolveInput(inJumpVelocity);
  const targetLandingPosition = AINode.ResolveInput(inTargetLandingPosition);
  const shouldControlCharacterGroundPhysics = AINode.ResolveInput(
    inShouldControlCharacterGroundPhysics
  );

  const initialEntityPosition = new Vector2();
  const targetLandingOffset = new Vector2();

  const DetermineIfWeHaveReachedTargetPosition = (
    data: AINodeData
  ): AIResult => {
    const targetPositionXCoord = targetLandingPosition.value.x;
    const isJumpingRight = targetLandingOffset.x > 0;
    const currentEntityPosition = data.thisEntity.position;

    const hasReachedTargetPosition = isJumpingRight
      ? currentEntityPosition.x >= targetPositionXCoord
      : currentEntityPosition.x <= targetPositionXCoord;

    return hasReachedTargetPosition ? AIResult.Succeeded : AIResult.Failed;
  };

  // prettier-ignore
  return (
    Sequence(
      Do((data: AINodeData) => initialEntityPosition.set(data.thisEntity.position.x, data.thisEntity.position.y)),
      Do(() => targetLandingOffset.subVectors(targetLandingPosition.value, initialEntityPosition)),
      Succeeder(
        Sequence(
          Verify(() => shouldControlCharacterGroundPhysics.value),
          DisableCharacterGroundPhysics()
        )
      ),
      SetLinvel(jumpVelocity),
      WaitUntilSuccess(
        Inverter(
          IsGrounded()
        )
      ),
      WaitUntilSuccess(
        Selector(
          Execute(DetermineIfWeHaveReachedTargetPosition),
          IsGrounded()
        )
      ),
      Succeeder(
        Sequence(
          Verify(() => shouldControlCharacterGroundPhysics.value),
          EnableCharacterGroundPhysics()
        )
      )
    )
  );
};
