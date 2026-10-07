import { LevelDefinitionAPI } from "src/engine/level/LevelLoaderAPI";
import { SpiritDoor } from "src/entities/environment/shrines/SpiritDoor";
import { isTerrain } from "src/entities/terrain/BaseTerrain";
import { selectChallengeComplete } from "src/redux/progression/selectors";
import { store } from "src/redux/store";
import { cHelloWorld } from "src/challenges/composed/HelloWorld";
import { cVariables } from "src/challenges/composed/Variables";

import Shrines00HallScreenshot from "./Shrines00Hall.png";
import { Shrines00HallName } from "./ShrinesTypes";
import { AdanaProgressMeter } from "src/entities/environment/shrines/AdanaProgressMeter";
import { getPlayer } from "src/engine/util/levelUtil";
import { EntityLevelEvents } from "src/api/entity";
import { cConditionalsAndLoops } from "src/challenges/composed/ConditionalsAndLoops";
import { TextPixelated } from "src/entities/environment/TextPixelated";

const challenges = [
  cHelloWorld.id,
  cVariables.id,
  cConditionalsAndLoops.id
];

export const ShrineHall01: LevelDefinitionAPI = {
  id: Shrines00HallName,
  screenshotImage: Shrines00HallScreenshot,
  localizedName: "challenges.hall1",
  mapJson: async () =>
    (await import("src/levels/tiled/maps/shrines/act-1/Shrines01Hub.tmj"))
      .default,
  setup: (level) => {
    for (const entity of level.getEntities().values()) {
      if (isTerrain(entity) && entity.layerName === "Invisible Walls") {
        entity.object3D.visible = false;
      }
      if (entity.type === SpiritDoor.type) {
        (entity as SpiritDoor).behaviors.interaction.promptYOffset = 1.5;
      }
    }

    // Show the way back out of the spirit world if all challenges are completed.
    const state = store.getState();
    const totalShrines = challenges.length;
    let completedShrineCount = 0;
    if (selectChallengeComplete(state, cHelloWorld.id)) {
      completedShrineCount++;
    }
    if (selectChallengeComplete(state, cVariables.id)) {
      completedShrineCount++;
    }
    if (selectChallengeComplete(state, cConditionalsAndLoops.id)) {
      completedShrineCount++;
    }

    const completedAllChallenges = completedShrineCount === totalShrines;
    if (completedAllChallenges) {
      level.getEntityForName<SpiritDoor>("Door 4")?.show();
    }

    const adanaMeter = level.getEntitiesForType(AdanaProgressMeter).at(0);
    const adanaText = level.getEntitiesForType(TextPixelated).at(0);

    if (adanaMeter) adanaMeter.setProgress(completedShrineCount / totalShrines);
    if (adanaText) adanaText.update({
      text: `${completedShrineCount} / ${totalShrines} completed.`,
      font: "directMessage",
      fontSize: 4,
    });
  }
};
