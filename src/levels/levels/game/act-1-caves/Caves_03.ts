import { setAssetDependencies } from "src/engine/entity/decorators";
import { LevelDefinitionAPI } from "src/engine/level/LevelLoaderAPI";
import { BeanBot } from "src/entities/npcs/bean-bot/BeanBot";

import { act1PrereqsA } from "../../prereqs/allPrereqs";

export const Caves_03: LevelDefinitionAPI = {
  id: "Caves_03",
  mapJson: async () =>
    (await import("src/levels/tiled/maps/act-1-caves/caves-03.tmj")).default,
  ambientMusic: "caveMusic",
  demoItems: act1PrereqsA,
  demoAllies: [BeanBot]
};

setAssetDependencies(() => ["caveMusic"])(Caves_03);
