import { EntityLevelAPI } from "src/api/entity";
import { isPlayerAPI } from "src/entities/player/PlayerAPI";

export function getPlayer(level: EntityLevelAPI) {
  for (const entity of level.getEntities().values()) {
    if (isPlayerAPI(entity)) return entity;
  }
  return null;
}
