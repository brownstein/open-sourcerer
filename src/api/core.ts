import { EntityClassArray, EntityLevelAPI } from "./entity";
import { Loader } from "./loader";

export type EngineContext = {
  entityClasses: EntityClassArray;
  levels: Record<string, () => Loader<EntityLevelAPI>>;
};
