import { Vector2 } from "three";

import { AINode } from "src/engine/entity/AIBehaviorTree";
import { Sequence } from "src/engine/entity/AICoreNodes";

import { GetAggroedEntityPosition } from "../../producerNodes/AIGetAggroedEntityPositionNode";
import { MoveToAttackPosition } from "../AIMoveToAttackPositionNode";

export const AttackChaseAggroedEntity = () => {
  const targetPositionStore = AINode.CreateSharedVariable<Vector2>(
    new Vector2()
  );

  // prettier-ignore
  return (
    Sequence(
      GetAggroedEntityPosition(targetPositionStore),
      MoveToAttackPosition(targetPositionStore)
    )
  );
};
