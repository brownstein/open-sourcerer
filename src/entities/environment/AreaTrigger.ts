import { BaseEntityType, EntityProps } from "src/api/entity";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import { EntityTypeName } from "src/entities/metadata/entityTypeNames";

import {
  AreaSensorBehavior,
  AreaSensorEvents
} from "../shared/behaviors/AreaSensorBehavior";
import { SignalConnectionBehavior } from "../shared/behaviors/SignalConnectionBehavior";

export type AreaTriggerProps = EntityProps & {
  entityFilter?: EntityTypeName[];
};

export class AreaTrigger extends CoreEntity {
  static type = "AreaTrigger";
  public type = "AreaTrigger";
  public entityFilter?: EntityTypeName[];
  public behaviors = {
    sensor: new AreaSensorBehavior(),
    signal: new SignalConnectionBehavior()
  };
  constructor(props: AreaTriggerProps) {
    super(props);
    this.entityFilter = props.entityFilter;
    this.behaviors.sensor.init(this);
    this.behaviors.signal
      .setShape({
        type: "aabb",
        width: this.size.width,
        height: this.size.height,
        angle: this.angle
      })
      .init(this);
    this.behaviors.sensor.events.on(
      AreaSensorEvents.EntityContact,
      (entity) => {
        if (!this.matchesFilter(entity)) return;
        this.behaviors.signal.transmit({ value: true });
      }
    );
    this.behaviors.sensor.events.on(
      AreaSensorEvents.EntityContactEnd,
      (entity) => {
        if (!this.matchesFilter(entity)) return;
        this.behaviors.signal.transmit({ value: false });
      }
    );
  }
  private matchesFilter(entity: BaseEntityType): boolean {
    if (!this.entityFilter || this.entityFilter.length === 0) return true;
    const filter: readonly string[] = this.entityFilter;
    return filter.includes(entity.type);
  }
}
