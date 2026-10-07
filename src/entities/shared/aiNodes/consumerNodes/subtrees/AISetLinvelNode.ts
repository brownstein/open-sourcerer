import { Vector2 } from "three";

import { AINodeData, AINodeInput } from "src/api/ai";
import { AINode } from "src/engine/entity/AIBehaviorTree";
import { Sequence } from "src/engine/entity/AICoreNodes";

import { GetData } from "../../producerNodes/AIGetDataNode";
import { SetLinvelToEntity } from "../AISetLinvelToEntityNode";

export const SetLinvel = (inVelocity: AINodeInput<Vector2>) => {
  const velocity = AINode.ResolveInput(inVelocity);

  const dataStore = AINode.CreateSharedVariable<AINodeData>();

  // prettier-ignore
  return (
    Sequence(
      GetData(dataStore),
      SetLinvelToEntity(() => dataStore.value.thisEntity, velocity)
    )
  );
};
