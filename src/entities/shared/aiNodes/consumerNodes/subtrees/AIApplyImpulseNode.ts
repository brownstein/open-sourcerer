import { Vector2 } from "three";

import { AINodeData, AINodeInput } from "src/api/ai";
import { AINode } from "src/engine/entity/AIBehaviorTree";
import { Sequence } from "src/engine/entity/AICoreNodes";

import { GetData } from "../../producerNodes/AIGetDataNode";
import { ApplyImpulseToEntity } from "../AIApplyImpulseToEntityNode";

export const ApplyImpulse = (inImpulse: AINodeInput<Vector2>) => {
  const impulse = AINode.ResolveInput(inImpulse);

  const dataStore = AINode.CreateSharedVariable<AINodeData>();

  // prettier-ignore
  return (
    Sequence(
      GetData(dataStore),
      ApplyImpulseToEntity(() => dataStore.value.thisEntity, impulse)
    )
  );
};
