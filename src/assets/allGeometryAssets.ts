import { Loader } from "src/api/loader";
import { ProtoSpriteGeometryLoader } from "src/engine/loader/Loaders";
import wolfFemalePrsg from "src/entities/player/sprites/wolf-female.prsg";
import wolfMalePrsg from "src/entities/player/sprites/wolf-male.prsg";

const allGeometryAssets = {
  wolfMaleGeometry: new ProtoSpriteGeometryLoader(
    "wolfMaleGeometry",
    wolfMalePrsg
  ),
  wolfFemaleGeometry: new ProtoSpriteGeometryLoader(
    "wolfFemaleGeometry",
    wolfFemalePrsg
  ),
} satisfies Record<string, Loader>;

export type GeometryAssets = typeof allGeometryAssets;

export default allGeometryAssets;
