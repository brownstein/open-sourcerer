import { Vector2 } from "three";

import { AINodeInput } from "src/api/ai";
import { AINode } from "src/engine/entity/AIBehaviorTree";

import { IsPlayerInVisionCone } from "../AIIsPlayerInVisionConeNode";

export const IsPlayerBelow = (
  inSpreadAngle: AINodeInput<number>,
  inMaxRange: AINodeInput<number> = Infinity
) => {
  const spreadAngle = AINode.ResolveInput(inSpreadAngle);
  const maxRange = AINode.ResolveInput(inMaxRange);

  const belowDirection = new Vector2(0, -1);

  // prettier-ignore
  return (
    IsPlayerInVisionCone(belowDirection, maxRange, spreadAngle)
  );
};
