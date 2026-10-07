import {
  AINodeData,
  AINodeInput,
  AINodeResolvedInput,
  AIResult
} from "src/api/ai";
import { AINode, createNode } from "src/engine/entity/AIBehaviorTree";
import { willBeGroundedWithinMs } from "src/util/physicsUtils";

import { CharacterPhysicsBehavior } from "../../behaviors/CharacterPhysics";

class AIIsGroundedWithinMsNode extends AINode {
  private readonly timeMs: AINodeResolvedInput<number>;

  constructor(inTimeMs: AINodeInput<number>) {
    super();

    this.timeMs = AINode.ResolveInput(inTimeMs);
  }

  run(data: AINodeData): AIResult {
    const physicsBehavior = data.thisEntity.behaviors.physics;
    if (
      !physicsBehavior ||
      !(physicsBehavior instanceof CharacterPhysicsBehavior)
    )
      return AIResult.Failed;
    if (!physicsBehavior.body) return AIResult.Failed;

    const willBeGrounded = willBeGroundedWithinMs(
      this.timeMs.value,
      data.level,
      physicsBehavior.body
    );

    return willBeGrounded ? AIResult.Succeeded : AIResult.Failed;
  }
}

export const IsGroundedWithinMs = createNode(AIIsGroundedWithinMsNode);
