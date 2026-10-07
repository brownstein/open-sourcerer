import { EntityHitDetails, EntityProps } from "src/api/entity";
import { CoreEntity } from "src/engine/entity/CoreEntity";

import {
  AreaHitSwitchBehavior,
  AreaHitSwitchBehaviorProps
} from "../shared/behaviors/AreaHitSwitchBehavior";

export type AreaHitSwitchProps = EntityProps & AreaHitSwitchBehaviorProps;

export class AreaHitSwitch extends CoreEntity {
  static type = "AreaHitSwitch";
  public type = "AreaHitSwitch";
  public behaviors: {
    areaSwitch: AreaHitSwitchBehavior;
  };

  get switchEvents() {
    return this.behaviors.areaSwitch.events;
  }

  constructor(props: AreaHitSwitchProps) {
    super(props);
    this.behaviors = {
      areaSwitch: new AreaHitSwitchBehavior(props)
    };
    this.behaviors.areaSwitch.init(this);
  }

  hit(hitDetails: EntityHitDetails) {
    this.behaviors.areaSwitch.onHit(hitDetails);
  }
}
