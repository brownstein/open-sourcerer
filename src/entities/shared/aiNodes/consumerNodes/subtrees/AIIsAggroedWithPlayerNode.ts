import { BaseEntityType } from "src/api/entity";
import { AINode } from "src/engine/entity/AIBehaviorTree";
import { Sequence } from "src/engine/entity/AICoreNodes";

import { GetEntityAggroedWith } from "../../producerNodes/AIGetEntityAggroedWith";
import { IsEntityPlayer } from "../AIIsEntityPlayerNode";

export const IsAggroedWithPlayer = () => {
  const entityAggroedWithStore = AINode.CreateSharedVariable<
    BaseEntityType | undefined
  >();

  // prettier-ignore
  return (
    Sequence(
      GetEntityAggroedWith(entityAggroedWithStore),
      IsEntityPlayer(entityAggroedWithStore)
    )
  );
};
