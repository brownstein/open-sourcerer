// TODO: migrate to new camera
// @ts-nocheck

import { Vector2 } from "three";

import { EntityLevelEvents } from "src/api/entity";
import { LevelDefinitionAPI } from "src/engine/level/LevelLoaderAPI";
import { Layers } from "src/engine/level/tiled/Layers";
import { AreaTrigger } from "src/entities/environment/AreaTrigger";
import { ShrineEntranceBackground } from "src/entities/environment/ShrineEntranceBackground";
import { Player } from "src/entities/player/Player";
import { AreaSensorEvents } from "src/entities/shared/behaviors/AreaSensorBehavior";
import { BaseTerrain, isTerrain } from "src/entities/terrain/BaseTerrain";

export const Area1_4_ShrineEntrance: LevelDefinitionAPI = {
  id: "Area1_4_ShrineEntrance",
  mapJson: async () => (await import("../../../tiled/maps/area1-intro/a4-shrine-entrance.tmj")).default,
  setup: (level) => {
    let player: Player | undefined;
    for (const entity of level.getEntities().values()) {
      if (entity.type === Player.type) {
        player = entity as Player;
        continue;
      }
      if (isTerrain(entity) && entity.layerName === "Invisible Tiles")
        entity.behaviors.tiles.setOpacity(0);
    }

    const door = level.getEntityForName<ShrineEntranceBackground>("BG");
    const entranceCinematicMarker = level.getEntityForName("Cinematic");
    const openTrigger = level.getEntityForName<AreaTrigger>("TriggerOpen");
    if (!player || !door || !entranceCinematicMarker || !openTrigger) return;

    const controlZoom = () => {
      const zoom = new Vector2(24, 24);
      const deltaX = player.position.x - entranceCinematicMarker.position.x;
      if (deltaX < 0) {
        zoom.multiplyScalar(Math.max(0.25, 1 + deltaX * 0.05));
      }
      player.behaviors.camera.zoomToSize(zoom, 0);
      player.behaviors.camera.offset.y =
        Math.max(0, 5 - Math.abs(deltaX)) ** 0.5 * 1.5;
    };
    controlZoom();
    level.on(EntityLevelEvents.Step, controlZoom);
    level.on(EntityLevelEvents.TransitionStep, controlZoom);

    openTrigger.behaviors.sensor.events.on(
      AreaSensorEvents.EntityContact,
      (e) => {
        if (e === player) {
          door.open();
        }
      }
    );
  }
};
