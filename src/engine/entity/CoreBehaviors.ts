import {
  BaseEntityType,
  EntityBehavior,
  EntityBehaviorMap,
  EntityLevelAPI
} from "src/api/entity";

export abstract class CoreBehavior {
  abstract type: string;
}

export function createBehavior<
  Deps extends EntityBehaviorMap = {},
  Props extends unknown[] = [],
  BehaviorType extends EntityBehavior<BaseEntityType<Deps>> = EntityBehavior<
    BaseEntityType<Deps>
  >,
  Func = (...props: Props) => BehaviorType
>(creator: Func) {
  return creator;
}
export class PhysicsBehavior extends CoreBehavior implements EntityBehavior {
  public type = "physics";
  constructor() {
    super();
  }
  attachToLevel(level: EntityLevelAPI) {
    const world = level.world;
  }
}
