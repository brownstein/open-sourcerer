import { LayerClipping } from "three-aseprite";

import { kInvPixelScale } from "../constants/scaling";
import { CenteredBBox } from "../navigation/CenteredBBox";

/**
 * Helper to get a centered bounding box from LayerClipping, applying scaling.
 * @param bounds
 * @returns
 */
export function layerBoundsToCenteredBBox(bounds: LayerClipping) {
  return new CenteredBBox(
    (bounds.xMax + bounds.xMin) * 0.5 * kInvPixelScale,
    (bounds.yMax + bounds.yMin) * -0.5 * kInvPixelScale,
    (bounds.xMax - bounds.xMin) * kInvPixelScale,
    (bounds.yMax - bounds.yMin) * kInvPixelScale
  );
}
