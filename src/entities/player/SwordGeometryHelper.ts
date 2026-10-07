import { ProtoSpriteGeometry } from "protosprite-geom";
import { ProtoSpriteSheetThree, ProtoSpriteThree } from "protosprite-three";

import { kInvPixelScale } from "src/engine/constants/scaling";

import { PlayerAnimation, PlayerLayer } from "./PlayerInternals";

const EMPTY_HULLS: Float32Array[] = [];

/**
 * Utility class that extracts convex hull points from protosprite geometry
 * data for the smears layer, converting pixel-space coords into
 * entity-relative world-space coordinates.
 *
 * Caches results per (absoluteFrame, facingRight) so that repeated calls
 * with the same parameters return the same array reference — this lets
 * AnimatedHitRegion skip collider rebuilds when nothing changed.
 */
export class SwordGeometryHelper {
  private layerIndex: number;
  private geom: ProtoSpriteGeometry;
  /** The center() offset from ProtoSpriteThree, in pixel coords. */
  private centerOffX: number;
  private centerOffY: number;

  /** Cache: key = `${frame}:${facingRight ? 1 : 0}` */
  private cache = new Map<string, Float32Array[]>();

  constructor(
    geom: ProtoSpriteGeometry,
    sprite: ProtoSpriteThree<PlayerLayer, PlayerAnimation>
  ) {
    this.geom = geom;

    // Get the sprite to look up layer names and compute center offset.
    const protoSprite = sprite.protoSpriteInstance.sprite;
    const maps = protoSprite.maps;

    // Look up the smears layer index — the smears layer traces the sword's
    // sweep arc and makes a much better hitbox than the blade itself.
    const smearsLayer = maps.layerNameMap.get("smears");
    if (!smearsLayer) {
      throw new Error(
        "SwordGeometryHelper: 'smears' layer not found in sprite"
      );
    }
    this.layerIndex = smearsLayer.index;

    // Use the same center offset that ProtoSpriteThree.center() computes.
    // center() finds the bounding box of visible layers at the current frame
    // and sets offset = -(center of bbox). The geometry vertices are in sprite
    // canvas coords, so we add this offset to align them the same way the
    // renderer does.
    sprite.center();
    const centerOff = sprite.centerOffset;
    this.centerOffX = centerOff.x;
    this.centerOffY = centerOff.y;

    // Dispose the temporary sprite we created for lookups.
    sprite.dispose();
  }

  /**
   * Get convex hull points for the tracked layer at the given absolute frame
   * index, transformed into entity-relative world-space coordinates.
   *
   * Returns a cached array reference when called with the same parameters,
   * so callers can use reference equality to detect changes.
   */
  getHullPoints(
    absoluteFrameIndex: number,
    facingRight: boolean
  ): Float32Array[] {
    const key = `${absoluteFrameIndex}:${facingRight ? 1 : 0}`;
    const cached = this.cache.get(key);
    if (cached !== undefined) return cached;

    const result = this.computeHullPoints(absoluteFrameIndex, facingRight);
    this.cache.set(key, result);
    return result;
  }

  private computeHullPoints(
    absoluteFrameIndex: number,
    facingRight: boolean
  ): Float32Array[] {
    const entry = this.geom.data.entries[0];
    if (!entry) return EMPTY_HULLS;

    // Use getFrameGeometry() to resolve the indexed shape/vertex pools
    // into full polygon data.
    const resolved = this.geom.getFrameGeometry(
      entry.spriteName,
      absoluteFrameIndex
    );
    if (!resolved) return EMPTY_HULLS;

    const layer = resolved.layers.find((l) => l.layerIndex === this.layerIndex);
    if (!layer) return EMPTY_HULLS;

    const results: Float32Array[] = [];

    for (const decomposition of layer.convexDecompositions) {
      for (const component of decomposition.components) {
        const verts = component.vertices;
        if (verts.length < 3) continue;

        // Check for degenerate triangles.
        const firstVert = verts[0];
        const lastVert = verts[verts.length - 1];
        if (
          verts.length < 4 &&
          Math.sqrt(
            (lastVert.x - firstVert.x) ** 2 + (lastVert.y - firstVert.y) ** 2
          ) < 0.001
        )
          continue;

        const points = new Float32Array(verts.length * 2);
        for (let i = 0; i < verts.length; i++) {
          // Pixel coords from geometry (in sprite canvas space, i.e.
          // already offset by spritePosition during tracing).
          // Apply the same center offset that ProtoSpriteThree uses.
          const px = verts[i].x + this.centerOffX;
          const py = verts[i].y + this.centerOffY;

          // Convert to world space using the same transform as the mesh:
          //   mesh.scale = (kInvPixelScale, -kInvPixelScale, kInvPixelScale)
          // When facing left, scale.x is negated.
          const wx = (facingRight ? px : -px) * kInvPixelScale;
          const wy = py * -kInvPixelScale;

          points[i * 2] = wx;
          points[i * 2 + 1] = wy;
        }

        results.push(points);
      }
    }

    return results.length > 0 ? results : EMPTY_HULLS;
  }

  /**
   * Get the absolute frame index for a given animation name and relative
   * frame number.
   */
  getAbsoluteFrameIndex(
    sheet: ProtoSpriteSheetThree,
    animationName: string,
    relativeFrame: number
  ): number | null {
    const sprite = sheet.getSprite<PlayerLayer, PlayerAnimation>();
    const maps = sprite.protoSpriteInstance.sprite.maps;
    const anim = maps.animationMap.get(animationName);
    sprite.dispose();
    if (!anim) return null;
    return anim.indexStart + relativeFrame;
  }
}
