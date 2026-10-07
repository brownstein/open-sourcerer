import { Color } from "three";

import { setAssetDependencies } from "src/engine/entity/decorators";
import { LevelDefinitionAPI } from "src/engine/level/LevelLoaderAPI";
import { BeanBot } from "src/entities/npcs/bean-bot/BeanBot";

import { act1PrereqsA } from "../../prereqs/allPrereqs";
import Caves_05Screenshot from "./Caves_05.png";

export const OLD_Caves_05: LevelDefinitionAPI = {
  id: "OLD_Caves_05",
  screenshotImage: Caves_05Screenshot,
  mapJson: async () =>
    (await import("src/levels/tiled/maps/OLD-act-1-caves/caves-05-0425.tmj"))
      .default,
  backgroundColor: new Color(0.05, 0.08, 0.1),
  ambientMusic: "caveMusic",
  demoItems: act1PrereqsA,
  demoAllies: [BeanBot]
};

setAssetDependencies(() => ["caveMusic"])(OLD_Caves_05);
