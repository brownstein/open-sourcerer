import { autoTranslateClass, exposeProp } from "src/scripting/core/Bindings";
import { spellEntitySyncFromRunner } from "src/scripting/runtime/SpellEntitySyncAPI";

import { EntityInfo } from "../BaseEntityInfo";

type PistonExtraInfo = {
  state: string;
  extended: boolean;
  timeBetweenThrustsMs: number;
};

@autoTranslateClass()
export class PistonInfo extends EntityInfo {
  static type = "Piston";

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

  @exposeProp()
  extend() {
    return spellEntitySyncFromRunner(this.runner)?.doMethodOnTracked(
      this.trackingId,
      "extend",
      []
    );
  }

  @exposeProp()
  retract() {
    return spellEntitySyncFromRunner(this.runner)?.doMethodOnTracked(
      this.trackingId,
      "retract",
      []
    );
  }

  @exposeProp()
  get state() {
    return (this.extra as PistonExtraInfo).state;
  }

  @exposeProp()
  get extended() {
    return (this.extra as PistonExtraInfo).extended;
  }

  @exposeProp()
  get timeBetweenThrustsMs() {
    return (this.extra as PistonExtraInfo).timeBetweenThrustsMs;
  }

  set timeBetweenThrustsMs(value: number) {
    spellEntitySyncFromRunner(this.runner)?.doMethodOnTracked(
      this.trackingId,
      "setTimeBetweenThrustsMs",
      [value]
    );
  }
}
