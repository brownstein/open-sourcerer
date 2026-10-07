import { Vector2 } from "three";

import {
  AINodeData,
  AINodeInput,
  AINodeResolvedInput,
  AIResult
} from "src/api/ai";
import { EntityAlignment } from "src/api/entity";
import { RemoveIndex } from "src/api/util";
import { AINode, createNode } from "src/engine/entity/AIBehaviorTree";
import { vector2To3 } from "src/engine/util/vecTypes";

import { HitArea, HitAreaProps } from "../../HitArea";
import {
  AnimationControlBehavior,
  SpriteFacingDirection
} from "../../behaviors/AnimationControlBehavior";

type HitAreaOptions = Omit<RemoveIndex<HitAreaProps>, "position"> & {
  offset?: Vector2;
};

class AISpawnHitAreaNode extends AINode {
  private readonly hitAreaOptions: AINodeResolvedInput<HitAreaOptions>;
  private readonly shouldAdjustOptionsForFacingDirection: AINodeResolvedInput<boolean>;

  constructor(
    inHitAreaOptions: AINodeInput<HitAreaOptions>,
    inShouldAdjustOptionsForFacingDirection: AINodeInput<boolean> = true
  ) {
    super();

    this.hitAreaOptions = AINode.ResolveInput(inHitAreaOptions);
    this.shouldAdjustOptionsForFacingDirection = AINode.ResolveInput(
      inShouldAdjustOptionsForFacingDirection
    );
  }

  run(data: AINodeData): AIResult {
    const finalOffset = new Vector2();
    const finalImpulse = new Vector2();

    if (this.hitAreaOptions.value.offset)
      finalOffset.copy(this.hitAreaOptions.value.offset);
    if (this.hitAreaOptions.value.hitImpulse)
      finalImpulse.copy(this.hitAreaOptions.value.hitImpulse);

    const entityPosition = data.thisEntity.position.clone();
    const animationBehavior = data.thisEntity.behaviors.animation;
    const facingDirection =
      animationBehavior && animationBehavior instanceof AnimationControlBehavior
        ? animationBehavior.facingDirection
        : undefined;
    const shouldFlipOffsetAndImpulse =
      facingDirection === SpriteFacingDirection.LEFT &&
      this.shouldAdjustOptionsForFacingDirection.value;

    if (shouldFlipOffsetAndImpulse) {
      finalOffset.x *= -1;
      finalImpulse.x *= -1;
    }

    const targetAlignment =
      this.hitAreaOptions.value.targetAlignment !== undefined
        ? this.hitAreaOptions.value.targetAlignment
        : data.thisEntity.alignment === EntityAlignment.Player
          ? EntityAlignment.Enemy
          : EntityAlignment.Player;

    const hitArea = new HitArea({
      ...this.hitAreaOptions.value,
      targetAlignment,
      position: entityPosition.add(vector2To3(finalOffset)),
      hitImpulse: finalImpulse
    });

    data.level.addEntity(hitArea);

    return AIResult.Succeeded;
  }
}

export const SpawnHitArea = createNode(AISpawnHitAreaNode);
