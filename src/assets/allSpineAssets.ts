import { Loader } from "src/api/loader";
import { SpineLoader } from "src/engine/spine/SpineLoader";
import echoAtlas from "src/entities/enemies/bosses/echo/spine/skeleton.atlas";
import echoPng from "src/entities/enemies/bosses/echo/spine/skeleton.png";
import echoSkel from "src/entities/enemies/bosses/echo/spine/skeleton.skel";
import gaianAtlas from "src/entities/enemies/bosses/gaian/spine2/Gaian_v_02_3.atlas";
import gaianPng from "src/entities/enemies/bosses/gaian/spine2/Gaian_v_02_3.png";
import gaianJson from "src/entities/enemies/bosses/gaian/spine2/skeleton.json";

const allSpineAssets = {
  gaianBossSpine: new SpineLoader({
    resourceName: "gaianBossSpine",
    sourceAtlasPath: gaianAtlas,
    sourcePngPath: gaianPng,
    sourcePngName: "Gaian_v_02_3.png",
    sourceJson: gaianJson
  }),
  echoSpine: new SpineLoader({
    resourceName: "echoSpine",
    sourceAtlasPath: echoAtlas,
    sourcePngPath: echoPng,
    sourcePngName: "skeleton.png",
    sourceSkelPath: echoSkel
  })
} satisfies Record<string, Loader>;

export type SpineAssets = typeof allSpineAssets;

export default allSpineAssets;
