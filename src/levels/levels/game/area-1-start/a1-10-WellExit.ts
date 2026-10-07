import { LevelDefinitionAPI } from "src/engine/level/LevelLoaderAPI";
import wellexitbg from "src/levels/tiled/maps/area1-intro/wellexitbgflat.png";

export const Area1_10_Wellexit: LevelDefinitionAPI = {
  id: "Area1_10_Wellexit",
  mapJson: async () => (await import("../../../tiled/maps/area1-intro/a10-Wellexit.tmj")).default,
  images: {
    wellexitbgflat: wellexitbg
  }
};
