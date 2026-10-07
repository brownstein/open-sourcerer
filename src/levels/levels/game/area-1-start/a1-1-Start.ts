import { EntityLifecycleEvents } from "src/api/entity";
import { LevelDefinitionAPI } from "src/engine/level/LevelLoaderAPI";
import { Layers } from "src/engine/level/tiled/Layers";
import { vector3To2 } from "src/engine/util/vecTypes";
import { IntroDeer } from "src/entities/enemies/critters/IntroDeer";
import { AreaTrigger } from "src/entities/environment/AreaTrigger";
import { Marker } from "src/entities/environment/Marker";
import { Player } from "src/entities/player/Player";
import { AreaSensorEvents } from "src/entities/shared/behaviors/AreaSensorBehavior";
import { PathFollowingBehaviorEvents } from "src/entities/shared/behaviors/NavPathFollowingBehavior";
import { isTerrain } from "src/entities/terrain/BaseTerrain";
import { isDestructableTerrain } from "src/entities/terrain/DestructableTerrain";
import { AnyTerrain, isAnyTerrain } from "src/entities/terrain/allTerrain";
import { PopoverConversation } from "src/entities/ui/PopoverConversation";
import { store } from "src/redux/store";
import { EnableElements, enableUIElements } from "src/redux/ui/slice";

export const Area1_1_Start: LevelDefinitionAPI = {
  id: "Area1_1_Start",
  mapJson: async () => (await import("src/levels/tiled/maps/area1-intro/a1-start.tmj")).default,
  layers: new Layers({
    defaultInclude: true
  }),
  setup: (level) => {
    level.state.setValue("allowFallToNextLevel", true);

    let player: Player | undefined;
    const deer = level.getEntityForName<IntroDeer>("Deer");
    const tempTerrain: AnyTerrain[] = [];
    const deerFleeTrigger =
      level.getEntityForName<AreaTrigger>("DeerFleeTrigger");
    const earthquakeTrigger =
      level.getEntityForName<AreaTrigger>("TriggerEarthquake");
    const marker1 = level.getEntityForName<Marker>("DeerGoal1");
    const marker2 = level.getEntityForName<Marker>("DeerGoal2");
    for (const entity of level.getEntities().values()) {
      if (entity.type === Player.type) {
        player = entity as Player;
        continue;
      }
      if (isAnyTerrain(entity) && entity.layerName === "Break")
        tempTerrain.push(entity);
    }
    if (
      !player ||
      !deer ||
      !earthquakeTrigger ||
      !deerFleeTrigger ||
      !marker1 ||
      !marker2
    )
      return;

    // Set up local state.
    let deerFleeing = false;
    let deerFleeComplete = false;
    let deerFleeingMore = false;
    let deerFleeMoreComplete = false;

    // Set up dialog.
    const dialog = new PopoverConversation({
      position: player.position.clone(),
      participants: [player],
      lines: [
        {
          participantId: player.id,
          line: "By Gaian's will, let me catch this deer."
        },
        {
          participantId: player.id,
          line: "Deer time!"
        }
      ]
    });
    level.addEntity(dialog);

    // Set up event triggers.
    deerFleeTrigger.behaviors.sensor.events.on(
      AreaSensorEvents.EntityContact,
      (entity) => {
        store.dispatch(enableUIElements([EnableElements.HotBar]));
        dialog.gracefullyExit();
        if (deerFleeing) return;
        if (entity === player) {
          deerFleeing = true;
          deer.behaviors.pathFollowing.planAndFollowPathToPosition(
            vector3To2(marker1.position)
          );
        }
      }
    );
    deer.events.on(EntityLifecycleEvents.Hit, () => {
      if (!deerFleeing) {
        deerFleeing = true;
        deer.behaviors.pathFollowing.planAndFollowPathToPosition(
          vector3To2(marker1.position)
        );
      }
      if (deerFleeComplete && !deerFleeingMore) {
        deerFleeingMore = true;
        deer.behaviors.pathFollowing.planAndFollowPathToPosition(
          vector3To2(marker2.position)
        );
      }
    });
    deer.behaviors.pathFollowing.pathEvents.on(
      PathFollowingBehaviorEvents.PathComplete,
      () => {
        if (
          vector3To2(deer.position.clone().sub(marker1.position)).length() < 0.8
        ) {
          deerFleeComplete = true;
          deer.faceImmediate(false);
        }
        if (
          vector3To2(deer.position.clone().sub(marker2.position)).length() < 0.8
        ) {
          deerFleeMoreComplete = true;
        }
      }
    );
    earthquakeTrigger.behaviors.sensor.events.on(
      AreaSensorEvents.EntityContact,
      (entity) => {
        if (entity === player) {
          for (const terrain of tempTerrain) {
            if (isDestructableTerrain(terrain)) {
              terrain.crumble();
              continue;
            }
            if (!isTerrain(terrain)) continue;
            terrain.fadeOut();
            terrain.disable();
          }
        }
      }
    );
  }
};
