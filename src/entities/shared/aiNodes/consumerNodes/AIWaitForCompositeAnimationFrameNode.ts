import {
  AINodeData,
  AINodeInput,
  AINodeResolvedInput,
  AIResult
} from "src/api/ai";
import { AINode, createNode } from "src/engine/entity/AIBehaviorTree";

import { AnimationControlBehavior } from "../../behaviors/AnimationControlBehavior";

class AIWaitForCompositeAnimationFrameNode extends AINode {
  private readonly partName: AINodeResolvedInput<string>;
  private readonly frameToWaitFor: AINodeResolvedInput<number>;

  private lastAnimationFrame: number | undefined = undefined;

  constructor(
    inPartName: AINodeInput<string>,
    inFrameToWaitFor: AINodeInput<number>
  ) {
    super();

    this.partName = AINode.ResolveInput(inPartName);
    this.frameToWaitFor = AINode.ResolveInput(inFrameToWaitFor);
  }

  reset(): void {
    super.reset();

    this.lastAnimationFrame = undefined;
  }

  run(data: AINodeData): AIResult {
    const animationBehavior = data.thisEntity.behaviors.animation;
    if (
      !animationBehavior ||
      !(animationBehavior instanceof AnimationControlBehavior)
    )
      return AIResult.Failed;

    const currentAnimationFrame =
      animationBehavior.getCurrentCompositeAnimationFrame(this.partName.value);

    if (currentAnimationFrame === undefined) return AIResult.Failed;

    if (this.lastAnimationFrame === undefined) {
      this.lastAnimationFrame = currentAnimationFrame;

      if (this.frameToWaitFor.value === currentAnimationFrame)
        return AIResult.Succeeded;

      return AIResult.Running;
    }

    const target = this.frameToWaitFor.value;
    const isReverse =
      animationBehavior.isCurrentCompositeAnimationReverse(
        this.partName.value
      ) ?? false;

    if (isReverse) {
      // Backward: frames decrease. Loop = frame jumped up (wrapped to endFrame).
      const animationHasLooped =
        currentAnimationFrame > this.lastAnimationFrame;

      if (!animationHasLooped) {
        // Normal backward progression: check if target was crossed going down
        if (this.lastAnimationFrame > target && target >= currentAnimationFrame)
          return AIResult.Succeeded;
      } else {
        // Looped (wrapped from startFrame back to endFrame)
        if (this.lastAnimationFrame > target) return AIResult.Succeeded;
        if (target >= currentAnimationFrame) return AIResult.Succeeded;
      }
    } else {
      // Forward: frames increase. Loop = frame jumped down (wrapped to startFrame).
      const animationHasLooped =
        currentAnimationFrame < this.lastAnimationFrame;

      if (!animationHasLooped) {
        if (this.lastAnimationFrame < target && target <= currentAnimationFrame)
          return AIResult.Succeeded;
      } else {
        if (this.lastAnimationFrame < target) return AIResult.Succeeded;
        if (target <= currentAnimationFrame) return AIResult.Succeeded;
      }
    }

    this.lastAnimationFrame = currentAnimationFrame;
    return AIResult.Running;
  }
}

export const WaitForCompositeAnimationFrame = createNode(
  AIWaitForCompositeAnimationFrameNode
);
