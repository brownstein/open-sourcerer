import {
  AINodeData,
  AINodeInput,
  AINodeResolvedInput,
  AIResult
} from "src/api/ai";
import { AINode, createNode } from "src/engine/entity/AIBehaviorTree";

import {
  APIPhysicsAnimationDataMap,
  AnimationControlBehavior
} from "../../behaviors/AnimationControlBehavior";

class AISetPhysicsAnimationsNode<TAnimations extends string> extends AINode {
  private readonly apiPhysicsAnimationsDataMap: AINodeResolvedInput<
    APIPhysicsAnimationDataMap<TAnimations>
  >;

  constructor(
    inAPIPhysicsAnimationsDataMap: AINodeInput<
      APIPhysicsAnimationDataMap<TAnimations>
    >
  ) {
    super();

    this.apiPhysicsAnimationsDataMap = AINode.ResolveInput(
      inAPIPhysicsAnimationsDataMap
    );
  }

  run(data: AINodeData): AIResult {
    const animationBehavior = data.thisEntity.behaviors.animation;
    if (
      !animationBehavior ||
      !(animationBehavior instanceof AnimationControlBehavior)
    )
      return AIResult.Failed;

    animationBehavior.setPhysicsAnimations(
      this.apiPhysicsAnimationsDataMap.value
    );

    return AIResult.Succeeded;
  }
}

export const SetPhysicsAnimations = createNode(AISetPhysicsAnimationsNode);
