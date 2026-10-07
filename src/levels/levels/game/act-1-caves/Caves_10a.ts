import { setAssetDependencies } from "src/engine/entity/decorators";
import { LevelDefinitionAPI } from "src/engine/level/LevelLoaderAPI";
import { BeanBot } from "src/entities/npcs/bean-bot/BeanBot";

export const Caves_10a: LevelDefinitionAPI = {
  id: "Caves_10a",
  mapJson: async () =>
    (await import("src/levels/tiled/maps/act-1-caves/caves-10a.tmj")).default,
  ambientMusic: "caveMusic",
  demoAllies: [BeanBot]
};

setAssetDependencies(() => ["caveMusic"])(Caves_10a);
