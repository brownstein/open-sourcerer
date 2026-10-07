import { Vector2 } from "three";

import {
  AINodeData,
  AINodeInput,
  AINodeResolvedInput,
  AIResult
} from "src/api/ai";
import { AINode, createNode } from "src/engine/entity/AIBehaviorTree";
import { distance3DTo2D } from "src/util/mathUtils";

class AIIsPlayerInVisionConeNode extends AINode {
  private readonly coneDirection: AINodeResolvedInput<Vector2>;
  private readonly coneRadius: AINodeResolvedInput<number>;
  private readonly coneAngleSpread: AINodeResolvedInput<number>;

  constructor(
    inConeDirection: AINodeInput<Vector2>,
    inConeRadius: AINodeInput<number>,
    inConeAngleSpread: AINodeInput<number>
  ) {
    super();

    this.coneDirection = AINode.ResolveInput(inConeDirection);
    this.coneRadius = AINode.ResolveInput(inConeRadius);
    this.coneAngleSpread = AINode.ResolveInput(inConeAngleSpread);
  }

  run(data: AINodeData): AIResult {
    const player = data.player;
    if (!player) return AIResult.Failed;

    const entity = data.thisEntity;

    const distanceToPlayer = distance3DTo2D(entity.position, player.position);

    if (distanceToPlayer > this.coneRadius.value) return AIResult.Failed;

    const toPlayer = new Vector2().subVectors(player.position, entity.position);
    const visionAngle = this.coneDirection.value.angleTo(toPlayer);

    if (visionAngle > this.coneAngleSpread.value / 2) return AIResult.Failed;

    return AIResult.Succeeded;
  }
}

export const IsPlayerInVisionCone = createNode(AIIsPlayerInVisionConeNode);
