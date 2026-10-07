import { Vector2 } from "three";

import { AINodeData, AINodeInput, AINodeOutput } from "src/api/ai";
import { AINode } from "src/engine/entity/AIBehaviorTree";
import { Do, Sequence, Verify } from "src/engine/entity/AICoreNodes";
import { vector3To2 } from "src/engine/util/vecTypes";

import { GetUnobstructedJumpVelocity } from "../AIGetUnobstructedJumpVelocityNode";

/**
 * @param inPosition The position you want the FEET of the entity to jump to
 */
export const GetUnobstructedJumpVelocityToPosition = (
  outUnobstructedJumpVelocity: AINodeOutput<Vector2 | null>,
  inPosition: AINodeInput<Vector2>,
  inMaxJumpSpeed: AINodeInput<number | undefined> = undefined,
  inMinJumpAngle: AINodeInput<number | undefined> = undefined,
  inMaxJumpAngle: AINodeInput<number | undefined> = undefined,
  inShouldFindGreatestUnobstructedJumpAngle: AINodeInput<boolean> = true
) => {
  const unobstructedJumpVelocity = outUnobstructedJumpVelocity;
  const position = AINode.ResolveInput(inPosition);
  const maxJumpSpeed = AINode.ResolveInput(inMaxJumpSpeed);
  const minJumpAngle = AINode.ResolveInput(inMinJumpAngle);
  const maxJumpAngle = AINode.ResolveInput(inMaxJumpAngle);
  const shouldFindGreatestUnobstructedJumpAngle = AINode.ResolveInput(
    inShouldFindGreatestUnobstructedJumpAngle
  );

  const targetFeetLandingOffset = new Vector2();
  const CalculateTargetFeetLandingOffset = (data: AINodeData) => {
    const thisEntityFeetPosition = vector3To2(data.thisEntity.position).sub({
      x: 0,
      y: data.thisEntity.size.height / 2
    });

    targetFeetLandingOffset.subVectors(position.value, thisEntityFeetPosition);
  };

  // prettier-ignore
  return (
    Sequence(
      Do(CalculateTargetFeetLandingOffset),
      GetUnobstructedJumpVelocity(
        unobstructedJumpVelocity,
        () => targetFeetLandingOffset,
        maxJumpSpeed,
        minJumpAngle,
        maxJumpAngle,
        shouldFindGreatestUnobstructedJumpAngle
      ),
      Verify(() => !!unobstructedJumpVelocity.value)
    )
  );
};
