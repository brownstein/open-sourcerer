import {
  AINodeData,
  AINodeInput,
  AINodeResolvedInput,
  AIResult
} from "src/api/ai";
import {
  AIDecoratorNode,
  AINode,
  createNode
} from "src/engine/entity/AIBehaviorTree";

import {
  APIAnimationData,
  AnimationControlBehavior
} from "../../behaviors/AnimationControlBehavior";

export type ScopeWithCompositeAnimationOptions = {
  /**
   * When true, physics-independent parts (e.g. lower body) will mirror this
   * override animation while the entity is idle. Useful for whole-body
   * animations like sword swings where both halves should participate.
   * When false (default), only the targeted parts play the override.
   */
  mirrorToIdleParts?: boolean;
};

/**
 * Like ScopeWithAnimation but targets specific named composite sprite parts.
 * Requests override on only the specified parts while the child runs. Enables
 * "upper body attacks while lower body keeps walking" for any composite entity.
 */
class AIScopeWithCompositeAnimationNode<
  TAnimations extends string
> extends AIDecoratorNode {
  private readonly animationData: AINodeResolvedInput<
    APIAnimationData<TAnimations>
  >;
  private readonly targetParts: string[];
  private readonly mirrorToIdleParts: boolean;

  private animationControlBehavior?: AnimationControlBehavior<TAnimations>;

  constructor(
    inAnimationData: AINodeInput<APIAnimationData<TAnimations>>,
    targetParts: string[],
    child: AINode,
    options?: ScopeWithCompositeAnimationOptions
  ) {
    super(child);

    this.animationData = AINode.ResolveInput(inAnimationData);
    this.targetParts = targetParts;
    this.mirrorToIdleParts = options?.mirrorToIdleParts ?? false;
  }

  reset(): void {
    super.reset();

    if (this.animationControlBehavior) {
      this.animationControlBehavior.clearOverride(this.animationData.value, {
        targetParts: this.targetParts
      });
      this.animationControlBehavior = undefined;
    }
  }

  run(data: AINodeData): AIResult {
    if (!this.animationControlBehavior) {
      const animationBehavior = data.thisEntity.behaviors.animation;
      if (
        !animationBehavior ||
        !(animationBehavior instanceof AnimationControlBehavior)
      )
        return AIResult.Failed;

      this.animationControlBehavior = animationBehavior;
      const wasOverrideSuccessful =
        this.animationControlBehavior.requestOverride(
          this.animationData.value,
          {
            targetParts: this.targetParts,
            mirrorToIdleParts: this.mirrorToIdleParts
          }
        );
      if (!wasOverrideSuccessful) return AIResult.Failed;
    }

    const result = this.child.run(data);

    if (result !== AIResult.Running) this.child.reset();

    return result;
  }
}

export const ScopeWithCompositeAnimation = createNode(
  AIScopeWithCompositeAnimationNode
) as <TAnimations extends string>(
  ...args: ConstructorParameters<
    typeof AIScopeWithCompositeAnimationNode<TAnimations>
  >
) => AIScopeWithCompositeAnimationNode<TAnimations>;
