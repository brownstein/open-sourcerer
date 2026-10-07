import { setAssetDependencies } from "src/engine/entity/decorators";
import { LevelDefinitionAPI } from "src/engine/level/LevelLoaderAPI";
import { BeanBot } from "src/entities/npcs/bean-bot/BeanBot";

export const Caves_09_02: LevelDefinitionAPI = {
  id: "Caves_09_02",
  mapJson: async () =>
    (await import("src/levels/tiled/maps/act-1-caves/caves-09_02.tmj")).default,
  ambientMusic: "caveMusic",
  demoAllies: [BeanBot]
};

setAssetDependencies(() => ["caveMusic"])(Caves_09_02);
