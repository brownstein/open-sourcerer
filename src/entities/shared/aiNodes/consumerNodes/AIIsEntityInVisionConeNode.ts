import { Vector2 } from "three";

import {
  AINodeData,
  AINodeInput,
  AINodeResolvedInput,
  AIResult
} from "src/api/ai";
import { BaseEntityType } from "src/api/entity";
import { AINode, createNode } from "src/engine/entity/AIBehaviorTree";
import { distance3DTo2D } from "src/util/mathUtils";

class AIIsEntityInVisionConeNode extends AINode {
  private readonly entity: AINodeResolvedInput<BaseEntityType>;
  private readonly coneDirection: AINodeResolvedInput<Vector2>;
  private readonly coneRadius: AINodeResolvedInput<number>;
  private readonly coneAngleSpread: AINodeResolvedInput<number>;

  constructor(
    inEntity: AINodeInput<BaseEntityType>,
    inConeDirection: AINodeInput<Vector2>,
    inConeRadius: AINodeInput<number>,
    inConeAngleSpread: AINodeInput<number>
  ) {
    super();

    this.entity = AINode.ResolveInput(inEntity);
    this.coneDirection = AINode.ResolveInput(inConeDirection);
    this.coneRadius = AINode.ResolveInput(inConeRadius);
    this.coneAngleSpread = AINode.ResolveInput(inConeAngleSpread);
  }

  run(data: AINodeData): AIResult {
    const targetEntity = this.entity.value;
    const thisEntity = data.thisEntity;

    const distanceToEntity = distance3DTo2D(
      thisEntity.position,
      targetEntity.position
    );
    if (distanceToEntity > this.coneRadius.value) return AIResult.Failed;

    const toEntity = new Vector2().subVectors(
      targetEntity.position,
      thisEntity.position
    );
    const visionAngle = this.coneDirection.value.angleTo(toEntity);

    if (visionAngle > this.coneAngleSpread.value / 2) return AIResult.Failed;

    return AIResult.Succeeded;
  }
}

export const IsEntityInVisionCone = createNode(AIIsEntityInVisionConeNode);
