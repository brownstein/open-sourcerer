import { EntityLevelAPI } from "src/api/entity";
import { AppStore } from "src/redux/store";

export type GameContext = {
  store?: AppStore;
  level?: EntityLevelAPI;
};
