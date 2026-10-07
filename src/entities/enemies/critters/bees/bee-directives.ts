import { AINodeInput } from "src/api/ai";
import {
  BaseEntityType,
  EntityClassArray,
  EntityHitDetails
} from "src/api/entity";
import { AINode } from "src/engine/entity/AIBehaviorTree";
import {
  Failure,
  ForEach,
  ScopeWithDirective,
  Selector,
  Sequence
} from "src/engine/entity/AICoreNodes";
import { ClearDirective } from "src/entities/shared/aiNodes/consumerNodes/AIClearDirectiveNode";
import { DispatchDirectives } from "src/entities/shared/aiNodes/consumerNodes/AIDispatchDirectivesNode";
import { SetAggro } from "src/entities/shared/aiNodes/consumerNodes/AISetAggroNode";
import { GetFilteredInRangeEntities } from "src/entities/shared/aiNodes/producerNodes/AIGetFilteredInRangeEntitiesNode";
import { GetHasBeenHitDetails } from "src/entities/shared/aiNodes/producerNodes/AIGetHasBeenHitDetailsNode";

import { RapierBee } from "./RapierBee";
import { SpellingBee } from "./SpellingBee";
import { WorkerBee } from "./WorkerBee";

export type BeeDirectives = {
  beeSwarmAggro: BaseEntityType;
};

export const DispatchBeeSwarmAggroToNearbyBees = (
  inEntityToAggro: AINodeInput<BaseEntityType>,
  inSwarmRadius: AINodeInput<number>
) => {
  const allBeeEnemies = [
    WorkerBee,
    RapierBee,
    SpellingBee
  ] satisfies EntityClassArray;
  type BeeEnemy = InstanceType<(typeof allBeeEnemies)[number]>;

  const entityToAggro = AINode.ResolveInput(inEntityToAggro);
  const swarmRadius = AINode.ResolveInput(inSwarmRadius);

  const nearbyBeesStore = AINode.CreateSharedVariable<BeeEnemy[]>();
  const currentBeeStore = AINode.CreateSharedVariable<BeeEnemy>();

  // prettier-ignore
  return (
    Sequence(
      GetFilteredInRangeEntities(
        nearbyBeesStore,
        (entity) => {
          const entityType = entity.type;
          const isTypeInBeeArray = !!allBeeEnemies.find((beeClass) => beeClass.type === entityType);

          return isTypeInBeeArray;
        },
        swarmRadius,
        false
      ),
      ForEach(nearbyBeesStore, currentBeeStore, undefined,
        DispatchDirectives(currentBeeStore, () => ({ beeSwarmAggro: entityToAggro.value }))
      )
    )
  );
};

export const PerformBeeDirectiveBehaviors = (
  inSwarmRadius: AINodeInput<number>
) => {
  const swarmRadius = AINode.ResolveInput(inSwarmRadius);

  const dispatchedSwarmAggroEntity =
    AINode.CreateSharedVariable<BaseEntityType>();
  const hasBeenHitDetailsStore =
    AINode.CreateSharedVariable<EntityHitDetails>();

  // prettier-ignore
  return (
    Selector(
      Failure(
        Sequence(
          GetHasBeenHitDetails(hasBeenHitDetailsStore),
          DispatchBeeSwarmAggroToNearbyBees(() => hasBeenHitDetailsStore.value.sourceEntity, swarmRadius)
        )
      ),
      ScopeWithDirective<BeeDirectives>("beeSwarmAggro", dispatchedSwarmAggroEntity,
        Sequence(
          SetAggro(dispatchedSwarmAggroEntity),
          ClearDirective<BeeDirectives>("beeSwarmAggro")
        )
      )
    )
  );
};
