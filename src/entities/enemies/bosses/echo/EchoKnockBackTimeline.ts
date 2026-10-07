import { Bone, Event, MixBlend, MixDirection, RegionAttachment, Skeleton, Timeline, Vector2 as SpineVec2 } from "@esotericsoftware/spine-core";

import { EchoBone } from "./dataTypes";

/**
 * Custom Spine Timeline that reads clean bone world positions from a reference
 * skeleton (which mirrors the real animation state but has no knockback offsets)
 * and applies physics-driven offsets to the real skeleton's bones.
 *
 * The reference skeleton is updated by Echo each frame BEFORE threeSpine.update()
 * runs this timeline, so its world transforms are always current and clean.
 *
 * Place on a track above track 0 (e.g. track 2) so it runs after the base
 * animation has been applied.
 */
export class EchoKnockBackTimeline extends Timeline {
  /** Skeleton-world offsets to apply. Set by Echo each frame. */
  public headWorldOffsetX = 0;
  public headWorldOffsetY = 0;
  public bodyWorldOffsetX = 0;
  public bodyWorldOffsetY = 0;

  /** Rotation offsets in radians. Set by Echo each frame. */
  public bodyRotationOffset = 0;
  public headRotationOffset = 0;

  /** Ideal skeleton-world positions (animated centroid from ref skeleton). Read by Echo. */
  public headIdealWorldX = 0;
  public headIdealWorldY = 0;
  public bodyIdealWorldX = 0;
  public bodyIdealWorldY = 0;

  /** Ideal world rotation deltas in radians (change from init pose). Read by Echo. */
  public bodyIdealRotation = 0;
  public headIdealRotation = 0;

  /** Enable verbose logging for debugging. */
  public debugLogging = false;

  /** Base bone rotations at hull extraction time — rotation deltas are relative to these. */
  private bodyBaseRotation = 0;
  private headBaseRotation = 0;

  private headBone?: Bone;
  private bodyBone?: Bone;
  /** Reference (clean) skeleton bones. */
  private refHeadBone?: Bone;
  private refBodyBone?: Bone;
  private refSkeleton?: Skeleton;

  /** Slot names whose vertices define the body/head hulls — used to compute centroid each frame. */
  private bodyHullSlotNames: string[] = [];
  private headHullSlotNames: string[] = [];

  private _frameCount = 0;

  constructor(frameCount: number) {
    super(frameCount, []);
  }

  setup(
    skeleton: Skeleton,
    refSkeleton: Skeleton,
    bodyHullSlotNames: string[] = [],
    headHullSlotNames: string[] = []
  ) {
    this.headBone = skeleton.findBone(EchoBone.Head) ?? undefined;
    this.bodyBone = skeleton.findBone(EchoBone.Body2) ?? undefined;
    this.refHeadBone = refSkeleton.findBone(EchoBone.Head) ?? undefined;
    this.refBodyBone = refSkeleton.findBone(EchoBone.Body2) ?? undefined;
    this.refSkeleton = refSkeleton;
    this.bodyHullSlotNames = bodyHullSlotNames;
    this.headHullSlotNames = headHullSlotNames;

    // Capture current bone rotations as base — rotation deltas are relative to these
    if (this.refBodyBone) {
      this.bodyBaseRotation = Math.atan2(this.refBodyBone.c, this.refBodyBone.a);
    }
    if (this.refHeadBone) {
      this.headBaseRotation = Math.atan2(this.refHeadBone.c, this.refHeadBone.a);
    }

    return this;
  }

  /** Recapture base rotations from the current ref skeleton pose (after hull recalculation). */
  recaptureBaseRotations() {
    if (this.refBodyBone) {
      this.bodyBaseRotation = Math.atan2(this.refBodyBone.c, this.refBodyBone.a);
    }
    if (this.refHeadBone) {
      this.headBaseRotation = Math.atan2(this.refHeadBone.c, this.refHeadBone.a);
    }
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
    this._frameCount++;
    const shouldLog = this.debugLogging && this._frameCount % 10 === 0
      && (Math.abs(this.bodyWorldOffsetX) > 0.1 || Math.abs(this.headWorldOffsetX) > 0.1);
    const _v = new SpineVec2();

    // --- 1. Compute body ideal position and rotation from reference skeleton ---
    if (this.refBodyBone && this.bodyBone && this.refSkeleton) {
      const centroid = this._computeSlotCentroid(this.bodyHullSlotNames);
      if (centroid) {
        this.bodyIdealWorldX = centroid.x;
        this.bodyIdealWorldY = centroid.y;
      }
      this.bodyIdealRotation = Math.atan2(this.refBodyBone.c, this.refBodyBone.a) - this.bodyBaseRotation;
    }

    // --- 2. Compute head ideal position and rotation from reference skeleton ---
    if (this.refHeadBone && this.headBone && this.refSkeleton) {
      const centroid = this._computeSlotCentroid(this.headHullSlotNames);
      if (centroid) {
        this.headIdealWorldX = centroid.x;
        this.headIdealWorldY = centroid.y;
      }
      this.headIdealRotation = Math.atan2(this.refHeadBone.c, this.refHeadBone.a) - this.headBaseRotation;
    }

    // --- 3. Apply world offsets as bone-local displacements ---
    // Convert desired skeleton-world position to parent-local via worldToParent.
    if (this.bodyBone && this.refBodyBone) {
      _v.set(
        this.refBodyBone.worldX + this.bodyWorldOffsetX,
        this.refBodyBone.worldY + this.bodyWorldOffsetY
      );
      this.refBodyBone.worldToParent(_v);
      this.bodyBone.x = _v.x;
      this.bodyBone.y = _v.y;

      if (shouldLog) {
        console.log(`[KB] body ideal=(${this.bodyIdealWorldX.toFixed(1)},${this.bodyIdealWorldY.toFixed(1)}) real=(${this.bodyBone.x.toFixed(1)},${this.bodyBone.y.toFixed(1)}) wOff=(${this.bodyWorldOffsetX.toFixed(2)},${this.bodyWorldOffsetY.toFixed(2)}) rot=${(this.bodyIdealRotation * 180 / Math.PI).toFixed(1)}°`);
      }
    }
    if (this.headBone && this.refHeadBone) {
      _v.set(
        this.refHeadBone.worldX + this.headWorldOffsetX,
        this.refHeadBone.worldY + this.headWorldOffsetY
      );
      this.refHeadBone.worldToParent(_v);
      this.headBone.x = _v.x;
      this.headBone.y = _v.y;

      if (shouldLog) {
        console.log(`[KB] head ideal=(${this.headIdealWorldX.toFixed(1)},${this.headIdealWorldY.toFixed(1)}) real=(${this.headBone.x.toFixed(1)},${this.headBone.y.toFixed(1)}) wOff=(${this.headWorldOffsetX.toFixed(2)},${this.headWorldOffsetY.toFixed(2)}) rot=${(this.headIdealRotation * 180 / Math.PI).toFixed(1)}°`);
      }
    }
  }

  /**
   * Compute the centroid of slot vertices from the reference skeleton.
   * Returns position in spine-world space (no meshScale).
   */
  private _computeSlotCentroid(slotNames: string[]): { x: number; y: number } | null {
    if (!this.refSkeleton) return null;
    let sumX = 0;
    let sumY = 0;
    let count = 0;

    for (const slotName of slotNames) {
      const slot = this.refSkeleton.findSlot(slotName);
      if (!slot) continue;
      const attachment = slot.getAttachment();
      if (!attachment || !(attachment instanceof RegionAttachment)) continue;

      const verts = new Float32Array(8);
      attachment.computeWorldVertices(slot, verts, 0, 2);

      for (let i = 0; i < 8; i += 2) {
        sumX += verts[i];
        sumY += verts[i + 1];
        count++;
      }
    }

    if (count === 0) return null;
    return { x: sumX / count, y: sumY / count };
  }
}
