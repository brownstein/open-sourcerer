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

class AISetLinvelToEntityNode extends AINode {
  private readonly entityToActOn: AINodeResolvedInput<
    BaseEntityTypeWithPartialBehaviorMap | undefined
  >;
  private readonly velocity: AINodeResolvedInput<Vector2>;

  constructor(
    inEntityToActOn: AINodeInput<
      BaseEntityTypeWithPartialBehaviorMap | undefined
    >,
    inVelocity: AINodeInput<Vector2>
  ) {
    super();

    this.entityToActOn = AINode.ResolveInput(inEntityToActOn);
    this.velocity = AINode.ResolveInput(inVelocity);
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

    physicsBehavior.body.setLinvel(this.velocity.value, true);

    return AIResult.Succeeded;
  }
}

export const SetLinvelToEntity = createNode(AISetLinvelToEntityNode);
