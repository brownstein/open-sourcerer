import { Vector2 } from "three";

import { AINodeInput } from "src/api/ai";
import { BaseEntityType } from "src/api/entity";
import { AINode } from "src/engine/entity/AIBehaviorTree";
import { Sequence, Verify } from "src/engine/entity/AICoreNodes";

import { GetEntityAggroedWith } from "../../producerNodes/AIGetEntityAggroedWith";
import { IsEntityInVisionCone } from "../AIIsEntityInVisionConeNode";

export const IsAggroedEntityInVisionCone = (
  inConeDirection: AINodeInput<Vector2>,
  inConeRadius: AINodeInput<number>,
  inConeAngleSpread: AINodeInput<number>
) => {
  const coneDirection = AINode.ResolveInput(inConeDirection);
  const coneRadius = AINode.ResolveInput(inConeRadius);
  const coneAngleSpread = AINode.ResolveInput(inConeAngleSpread);

  const aggroedEntityStore = AINode.CreateSharedVariable<
    BaseEntityType | undefined
  >();

  // prettier-ignore
  return (
  	Sequence(
  		GetEntityAggroedWith(aggroedEntityStore),
  		Verify(() => !!aggroedEntityStore.value),
  		IsEntityInVisionCone(aggroedEntityStore as AINodeInput<BaseEntityType>, coneDirection, coneRadius, coneAngleSpread)
  	)
  );
};
