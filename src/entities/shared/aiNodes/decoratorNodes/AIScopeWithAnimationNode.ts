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

class AIScopeWithAnimationNode<
  TAnimations extends string
> extends AIDecoratorNode {
  private readonly animationData: AINodeResolvedInput<
    APIAnimationData<TAnimations>
  >;

  private animationControlBehavior?: AnimationControlBehavior<TAnimations>;

  constructor(
    inAnimationData: AINodeInput<APIAnimationData<TAnimations>>,
    child: AINode
  ) {
    super(child);

    this.animationData = AINode.ResolveInput(inAnimationData);
  }

  reset(): void {
    super.reset();

    if (this.animationControlBehavior) {
      this.animationControlBehavior.clearOverride(this.animationData.value);
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
        this.animationControlBehavior.requestOverride(this.animationData.value);
      if (!wasOverrideSuccessful) return AIResult.Failed;
    }

    const result = this.child.run(data);

    if (result !== AIResult.Running) this.child.reset();

    return result;
  }
}

export const ScopeWithAnimation = createNode(AIScopeWithAnimationNode) as <
  TAnimations extends string
>(
  ...args: ConstructorParameters<typeof AIScopeWithAnimationNode<TAnimations>>
) => AIScopeWithAnimationNode<TAnimations>;
