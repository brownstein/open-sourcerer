import { autoTranslateClass, exposeProp } from "src/scripting/core/Bindings";
import { spellEntitySyncFromRunner } from "src/scripting/runtime/SpellEntitySyncAPI";

import { EntityInfo } from "../BaseEntityInfo";

@autoTranslateClass()
export class MovingTerrain extends EntityInfo {
  static type = "MovingTerrain";
  public type = "MovingTerrain";

  @exposeProp()
  start() {
    return spellEntitySyncFromRunner(this.runner)?.doMethodOnTracked(
      this.trackingId,
      "start",
      []
    );
  }

  @exposeProp()
  stop() {
    return spellEntitySyncFromRunner(this.runner)?.doMethodOnTracked(
      this.trackingId,
      "stop",
      []
    );
  }
}
