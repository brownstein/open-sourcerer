import { savedSpellToItemData } from "src/api/spells";
import { LevelDefinitionAPI } from "src/engine/level/LevelLoaderAPI";
import { Turret } from "src/entities/enemies/robots/turret/Turret";
import { AreaTrigger } from "src/entities/environment/AreaTrigger";
import { Chest } from "src/entities/environment/Chest";
import { ShrineDoor } from "src/entities/environment/ShrineDoor";
import { AreaSensorEvents } from "src/entities/shared/behaviors/AreaSensorBehavior";
import { builtInSpells } from "src/scripting/builtinScripts";

import LegoEarthLevelScreenshot from "./LegoEarthLevel.png";

export const LegoEarthLevel: LevelDefinitionAPI = {
  id: "LegoEarthLevel",
  screenshotImage: LegoEarthLevelScreenshot,
  mapJson: async () =>
    (await import("src/levels/tiled/maps/dev/LegoEarthLevel.tmj")).default,
  setup(level) {
    const trigger = level.getEntityForName<AreaTrigger>("DoorTrigger");
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

    //The other puzzle

    const spikeDoor = level.getEntityForName<ShrineDoor>("SpikeDoor");
    const spikeTrigger = [
      level.getEntityForName<AreaTrigger>("SpikeTrigger1"),
      level.getEntityForName<AreaTrigger>("SpikeTrigger2"),
      level.getEntityForName<AreaTrigger>("SpikeTrigger3"),
      level.getEntityForName<AreaTrigger>("SpikeTrigger4"),
      level.getEntityForName<AreaTrigger>("SpikeTrigger5")
    ];

    for (let sTrigger of spikeTrigger) {
      sTrigger?.behaviors.sensor.events.on(
        AreaSensorEvents.EntityContact,
        () => {
          for (let st of spikeTrigger) {
            if (st === sTrigger) continue;
            if ((st?.behaviors.sensor.contactedEntityIds.size ?? 1) === 0)
              return;
          }
          spikeDoor?.open();
        }
      );
    }

    //The turrets
    for (const turret of level.getEntitiesForType(Turret)) {
      turret.behaviors.status.setMaxHealth(100);
    }

    //The chests
    const chest = level.getEntityForName<Chest>("StartChest");
    if (chest) {
      chest.behaviors.inventory.items = [
        { type: "Sword" },
        savedSpellToItemData(builtInSpells.EarthShield),
        savedSpellToItemData(builtInSpells.EarthDraw),
        savedSpellToItemData(builtInSpells.EarthSpike)
      ];
    }
  }
};
