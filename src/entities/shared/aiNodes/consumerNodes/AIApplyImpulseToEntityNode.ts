import { Vector2 } from "three";

import {
  AINodeData,
  AINodeInput,
  AINodeResolvedInput,
  AIResult,
  BaseEntityTypeWithPartialBehaviorMap
} from "src/api/ai";
import { AINode, createNode } from "src/engine/entity/AIBehaviorTree";

import { CharacterPhysicsBehavior } from "../../behaviors/CharacterPhysics";

class AIApplyImpulseToEntityNode extends AINode {
  private readonly entityToActOn: AINodeResolvedInput<
    BaseEntityTypeWithPartialBehaviorMap | undefined
  >;
  private readonly impulse: AINodeResolvedInput<Vector2>;

  constructor(
    inEntityToActOn: AINodeInput<
      BaseEntityTypeWithPartialBehaviorMap | undefined
    >,
    inImpulse: AINodeInput<Vector2>
  ) {
    super();

    this.entityToActOn = AINode.ResolveInput(inEntityToActOn);
    this.impulse = AINode.ResolveInput(inImpulse);
  }

  run(_data: AINodeData): AIResult {
    const entity = this.entityToActOn.value;

    if (!entity) return AIResult.Failed;

    const physicsBehavior = entity.behaviors.physics;
    if (
      !physicsBehavior ||
      !(physicsBehavior instanceof CharacterPhysicsBehavior)
    )
      return AIResult.Failed;

    if (!physicsBehavior.body) return AIResult.Failed;

    physicsBehavior.body.applyImpulse(this.impulse.value, true);

    return AIResult.Succeeded;
  }
}

export const ApplyImpulseToEntity = createNode(AIApplyImpulseToEntityNode);
