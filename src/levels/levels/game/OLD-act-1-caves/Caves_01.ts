import { Color } from "three";

import { setAssetDependencies } from "src/engine/entity/decorators";
import { LevelDefinitionAPI } from "src/engine/level/LevelLoaderAPI";
import { BeanBot } from "src/entities/npcs/bean-bot/BeanBot";

import { act1PrereqsA } from "../../prereqs/allPrereqs";
import Caves_01Screenshot from "./Caves_01.png";

export const OLD_Caves_01: LevelDefinitionAPI = {
  id: "OLD_Caves_01",
  screenshotImage: Caves_01Screenshot,
  mapJson: async () =>
    (await import("src/levels/tiled/maps/OLD-act-1-caves/caves-01-0413.tmj"))
      .default,
  ambientMusic: "caveMusic",
  backgroundColor: new Color(0.05, 0.08, 0.1),
  demoItems: act1PrereqsA,
  demoAllies: [BeanBot],
  setup: (level) => {}
};

setAssetDependencies(() => ["caveMusic"])(OLD_Caves_01);
