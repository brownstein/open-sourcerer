import { Vector2 } from "three";

import { AINodeInput, AINodeOutput } from "src/api/ai";
import { AINode } from "src/engine/entity/AIBehaviorTree";
import { Sequence, Verify } from "src/engine/entity/AICoreNodes";

import { GetUnobstructedJumpVelocityToPosition } from "../../producerNodes/subtrees/AIGetUnobstructedJumpVelocityToPositionNode";
import { PerformJump } from "./AIPerformJumpNode";

/**
 * @param inPosition The position you want the FEET of the entity to jump to
 */
export const JumpToPosition = (
  inPosition: AINodeInput<Vector2>,
  inMaxJumpSpeed: AINodeInput<number | undefined> = undefined,
  inMinJumpAngle: AINodeInput<number | undefined> = undefined,
  inMaxJumpAngle: AINodeInput<number | undefined> = undefined,
  inShouldFindGreatestUnobstructedJumpAngle: AINodeInput<boolean> = true,
  inShouldControlCharacterGroundPhysics: AINodeInput<boolean> = true
) => {
  const position = AINode.ResolveInput(inPosition);
  const maxJumpSpeed = AINode.ResolveInput(inMaxJumpSpeed);
  const minJumpAngle = AINode.ResolveInput(inMinJumpAngle);
  const maxJumpAngle = AINode.ResolveInput(inMaxJumpAngle);
  const shouldFindGreatestUnobstructedJumpAngle = AINode.ResolveInput(
    inShouldFindGreatestUnobstructedJumpAngle
  );
  const shouldControlCharacterGroundPhysics = AINode.ResolveInput(
    inShouldControlCharacterGroundPhysics
  );

  const unobstructedJumpVelocityStore =
    AINode.CreateSharedVariable<Vector2 | null>();

  // prettier-ignore
  return (
    Sequence(
      GetUnobstructedJumpVelocityToPosition(
        unobstructedJumpVelocityStore,
        position,
        maxJumpSpeed,
        minJumpAngle,
        maxJumpAngle,
        shouldFindGreatestUnobstructedJumpAngle
      ),
      Verify(() => !!unobstructedJumpVelocityStore.value),
      PerformJump(
        unobstructedJumpVelocityStore as AINodeOutput<Vector2>,
        position,
        shouldControlCharacterGroundPhysics
      )
    )
  );
};
