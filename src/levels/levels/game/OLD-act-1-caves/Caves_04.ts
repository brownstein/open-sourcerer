import { Color } from "three";

import { setAssetDependencies } from "src/engine/entity/decorators";
import { LevelDefinitionAPI } from "src/engine/level/LevelLoaderAPI";
import { BeanBot } from "src/entities/npcs/bean-bot/BeanBot";

import { act1PrereqsA } from "../../prereqs/allPrereqs";
import Caves_04Screenshot from "./Caves_04.png";

export const OLD_Caves_04: LevelDefinitionAPI = {
  id: "OLD_Caves_04",
  screenshotImage: Caves_04Screenshot,
  mapJson: async () =>
    (await import("src/levels/tiled/maps/OLD-act-1-caves/caves-04-0425.tmj"))
      .default,
  backgroundColor: new Color(0.05, 0.08, 0.1),
  ambientMusic: "caveMusic",
  demoItems: act1PrereqsA,
  demoAllies: [BeanBot]
};

setAssetDependencies(() => ["caveMusic"])(OLD_Caves_04);
