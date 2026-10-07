import { setAssetDependencies } from "src/engine/entity/decorators";
import { LevelDefinitionAPI } from "src/engine/level/LevelLoaderAPI";
import { BeanBot } from "src/entities/npcs/bean-bot/BeanBot";

export const Caves_12b: LevelDefinitionAPI = {
  id: "Caves_12b",
  mapJson: async () =>
    (await import("src/levels/tiled/maps/act-1-caves/caves-12b.tmj")).default,
  ambientMusic: "caveMusic",
  demoAllies: [BeanBot]
};

setAssetDependencies(() => ["caveMusic"])(Caves_12b);
