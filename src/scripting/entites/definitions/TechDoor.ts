import { autoTranslateClass, exposeProp } from "src/scripting/core/Bindings";
import { EntityInfo } from "../BaseEntityInfo";
import { spellEntitySyncFromRunner } from "src/scripting/runtime/SpellEntitySyncAPI";

type TechDoorExtraInfo = {
  open: boolean;
};

@autoTranslateClass()
export class TechDoorInfo extends EntityInfo {
  static type = "TechDoor";
  
  @exposeProp()
  open() {
    return spellEntitySyncFromRunner(this.runner)?.doMethodOnTracked(this.trackingId, "open", []);
  }

  @exposeProp()
  close() {
    return spellEntitySyncFromRunner(this.runner)?.doMethodOnTracked(this.trackingId, "close", []);
  }

  @exposeProp()
  get isOpen() {
    return (this.extra as TechDoorExtraInfo).open;
  }
}