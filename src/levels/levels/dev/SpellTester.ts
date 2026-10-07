import { setConsumerDependencies } from "src/engine/entity/decorators";
import { LevelDefinitionAPI } from "src/engine/level/LevelLoaderAPI";
import { Player } from "src/entities/player/Player";
import { isTerrain } from "src/entities/terrain/BaseTerrain";

import SpellTesterScreenshot from "./SpellTester.png";

export const SpellTesterLevel: LevelDefinitionAPI = {
  id: "SpellTester",
  screenshotImage: SpellTesterScreenshot,
  mapJson: async () =>
    (await import("../../tiled/maps/dev/SpellTester.tmj")).default,
  backgroundColor: undefined,
  setup: (level) => {
    level.scene.background = null;
    for (const entity of level.getEntities().values()) {
      if (entity.type === "PhysicsDebugger") {
        level.removeEntity(entity.id);
      }
      if (isTerrain(entity) && entity.layerName === "Invisible Walls") {
        entity.object3D.visible = false;
      }
    }
  }
};

setConsumerDependencies(() => [Player])(SpellTesterLevel);
