import { LevelDefinitionAPI } from "src/engine/level/LevelLoaderAPI";
import { AreaHitSwitch } from "src/entities/environment/AreaHitSwitch";
import { AreaTrigger } from "src/entities/environment/AreaTrigger";
import { ShrineDoor } from "src/entities/environment/ShrineDoor";
import { AreaSensorEvents } from "src/entities/shared/behaviors/AreaSensorBehavior";
import { AreaHitSwitchEvents } from "src/entities/shared/behaviors/AreaHitSwitchBehavior";
import mapJson from "src/levels/tiled/maps/dev/LegoPuzzle1.tmj";

export const LegoPuzzle1: LevelDefinitionAPI = {
  id: "LegoPuzzle1",
  mapJson,
  setup(level) {
    const trigger = level.getEntityForName<AreaTrigger>("DoorTrigger");
    const areaSwitch = level.getEntityForName<AreaHitSwitch>("DoorSwitch");
    const door = level.getEntityForName<ShrineDoor>("PuzzleDoor");

    trigger?.behaviors.sensor.events.on(AreaSensorEvents.EntityContact, () => {
      door?.open();
    });
    trigger?.behaviors.sensor.events.on(
      AreaSensorEvents.EntityContactEnd,
      () => {
        if (trigger.behaviors.sensor.contactedEntityIds.size <= 1) {
          door?.close();
        }
      }
    );

    areaSwitch?.switchEvents.on(AreaHitSwitchEvents.SwitchOn, () => {
      door?.open();
    });
    areaSwitch?.switchEvents.on(AreaHitSwitchEvents.SwitchOff, () => {
      door?.close();
    });
  }
};
