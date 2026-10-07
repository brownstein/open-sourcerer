import { Bone, Event, MixBlend, MixDirection, Skeleton, Timeline } from "@esotericsoftware/spine-core";

import { EchoBone } from "./dataTypes";

/**
 * Custom Spine Timeline that applies a Y offset to the body2 bone for
 * player-height tracking during attacks.
 *
 * Placed on track 1 on BOTH the real and reference AnimationStates so the
 * offset is reflected in both skeletons. This keeps the knockback timeline's
 * ideal centroid computation in sync with where the body actually is.
 */
export class EchoHeightTrackTimeline extends Timeline {
  /** Current lerped offset in skeleton-space units. Set by Echo each frame. */
  public offsetY = 0;

  private body2Bone?: Bone;

  constructor(frameCount: number) {
    super(frameCount, []);
  }

  setup(skeleton: Skeleton) {
    this.body2Bone = skeleton.findBone(EchoBone.Body2) ?? undefined;
    return this;
  }

  apply(
    _skeleton: Skeleton,
    _lastTime: number,
    _time: number,
    _events: Array<Event> | null,
    _alpha: number,
    _blend: MixBlend,
    _direction: MixDirection
  ) {
    if (this.body2Bone) {
      this.body2Bone.y += this.offsetY;
    }
  }
}
