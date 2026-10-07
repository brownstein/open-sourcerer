import { setConsumerDependencies } from "src/engine/entity/decorators";
import { LevelDefinitionAPI } from "src/engine/level/LevelLoaderAPI";
import { Player } from "src/entities/player/Player";
import { isAnyTerrain } from "src/entities/terrain/allTerrain";

import CustomizerScreenshot from "./Customizer.png";

export const Customizer: LevelDefinitionAPI = {
  id: "Customizer",
  screenshotImage: CustomizerScreenshot,
  mapJson: async () =>
    (await import("../../tiled/maps/dev/Customizer.tmj")).default,
  backgroundColor: undefined,
  setup: (level) => {
    level.scene.background = null;
    for (const entity of level.getEntities().values()) {
      if (isAnyTerrain(entity)) {
        const object3D = entity.object3D;
        if (object3D) object3D.visible = false;
      }
      if (entity.type === "PhysicsDebugger") {
        level.removeEntity(entity.id);
      }
    }
  }
};

setConsumerDependencies(() => [Player])(Customizer);
