import { Vector2 } from "three";

import { AINode } from "src/engine/entity/AIBehaviorTree";
import { Sequence } from "src/engine/entity/AICoreNodes";

import { GetPlayerPosition } from "../../producerNodes/AIGetPlayerPosition";
import { MoveToAttackPosition } from "../AIMoveToAttackPositionNode";

export const AttackChasePlayer = () => {
  const playerPositionStore = AINode.CreateSharedVariable<Vector2>(
    new Vector2()
  );

  // prettier-ignore
  return (
    Sequence(
      GetPlayerPosition(playerPositionStore),
      MoveToAttackPosition(playerPositionStore)
    )
  );
};
