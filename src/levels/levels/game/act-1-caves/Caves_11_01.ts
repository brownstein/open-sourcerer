import { setAssetDependencies } from "src/engine/entity/decorators";
import { LevelDefinitionAPI } from "src/engine/level/LevelLoaderAPI";
import { BeanBot } from "src/entities/npcs/bean-bot/BeanBot";

export const Caves_11_01: LevelDefinitionAPI = {
  id: "Caves_11_01",
  mapJson: async () =>
    (await import("src/levels/tiled/maps/act-1-caves/caves-11_01.tmj")).default,
  ambientMusic: "caveMusic",
  demoAllies: [BeanBot]
};

setAssetDependencies(() => ["caveMusic"])(Caves_11_01);
