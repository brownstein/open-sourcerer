import { Vector2 } from "three";

import { BaseEntityType } from "src/api/entity";
import { ThreeSpine } from "src/engine/spine/ThreeSpine";
import { calculateProjectileAngleToInterncept } from "src/util/projectileMath";

import { EchoHeightTrackTimeline } from "./EchoHeightTrackTimeline";
import { EchoAnimation, EchoBone } from "./dataTypes";

/** Lerp factor for cannon bone rotation smoothing (0-1, higher = snappier). */
const AIM_LERP_FACTOR = 0.1;
/** Max body raise/lower offset in world units when tracking the player. */
const BODY_HEIGHT_OFFSET = 0.5;
/** Lerp factor for body height adjustment (0-1, higher = snappier). */
const BODY_HEIGHT_LERP = 0.08;

export interface EchoCannonAimingOpts {
  threeSpine: ThreeSpine;
  getPosition: () => { x: number; y: number };
  findPlayer: () => BaseEntityType | null;
  projectileSpeed: number;
  heightTrackTimeline?: EchoHeightTrackTimeline;
  refHeightTrackTimeline?: EchoHeightTrackTimeline;
}

/**
 * Manages cannon bone aiming and body height tracking for the Echo boss.
 * Intended to be used as a helper owned by the Echo entity.
 */
export class EchoCannonAiming {
  private threeSpine: ThreeSpine;
  private getPosition: () => { x: number; y: number };
  private findPlayer: () => BaseEntityType | null;
  private projectileSpeed: number;
  private heightTrackTimeline?: EchoHeightTrackTimeline;
  private refHeightTrackTimeline?: EchoHeightTrackTimeline;

  /** True when a cannon bone should be aimed at the player. */
  public aimingAtPlayer = false;
  /** The cannon bone currently being aimed, or null. */
  public activeCannonBone: string | null = null;
  /** Current lerped body Y offset in skeleton-space units. */
  private currentBodyOffsetY = 0;
  /** Whether an attack is active (controls body height tracking). */
  public isAttacking = false;

  constructor(opts: EchoCannonAimingOpts) {
    this.threeSpine = opts.threeSpine;
    this.getPosition = opts.getPosition;
    this.findPlayer = opts.findPlayer;
    this.projectileSpeed = opts.projectileSpeed;
    this.heightTrackTimeline = opts.heightTrackTimeline;
    this.refHeightTrackTimeline = opts.refHeightTrackTimeline;
  }

  setHeightTrackTimelines(
    heightTrackTimeline: EchoHeightTrackTimeline,
    refHeightTrackTimeline: EchoHeightTrackTimeline
  ) {
    this.heightTrackTimeline = heightTrackTimeline;
    this.refHeightTrackTimeline = refHeightTrackTimeline;
  }

  startAiming(boneName: string) {
    this.activeCannonBone = boneName;
    this.aimingAtPlayer = true;
  }

  stopAiming() {
    this.aimingAtPlayer = false;
    this.activeCannonBone = null;
  }

  /**
   * Computes the body height-tracking offset and writes it to both the real
   * and reference height-track timelines so both skeletons stay in sync.
   * Called before animation update each frame.
   */
  updateBodyHeightTracking() {
    const meshScale = this.threeSpine.mesh.scale.x;
    const maxOffsetSkel = BODY_HEIGHT_OFFSET / meshScale;

    let targetOffsetY = 0;
    if (this.isAttacking) {
      const player = this.findPlayer();
      const pos = this.getPosition();
      if (player) {
        if (player.position.y > pos.y) {
          targetOffsetY = maxOffsetSkel;
        } else {
          targetOffsetY = -maxOffsetSkel;
        }
      }
    }

    this.currentBodyOffsetY +=
      (targetOffsetY - this.currentBodyOffsetY) * BODY_HEIGHT_LERP;

    if (this.heightTrackTimeline) {
      this.heightTrackTimeline.offsetY = this.currentBodyOffsetY;
    }
    if (this.refHeightTrackTimeline) {
      this.refHeightTrackTimeline.offsetY = this.currentBodyOffsetY;
    }
  }

  /**
   * Called from the preWorldTransform hook. Rotates the active cannon
   * bone so that it points toward the player, lerping for smooth motion.
   * For the big cannon, uses the same gravity-aware arc calculation as
   * the projectile so the barrel visually tracks the firing trajectory.
   */
  applyCannonAiming() {
    if (!this.aimingAtPlayer || !this.activeCannonBone) return;

    const bone = this.threeSpine.skeleton.findBone(this.activeCannonBone);
    if (!bone || !bone.parent) return;

    const player = this.findPlayer();
    if (!player) return;

    const meshScale = this.threeSpine.mesh.scale.x;
    const pos = this.getPosition();

    // Bone world position from the previous frame (close enough for aiming)
    const boneWorldX = bone.worldX * meshScale + pos.x;
    const boneWorldY = bone.worldY * meshScale + pos.y;

    const relativePos = new Vector2(
      player.position.x - boneWorldX,
      player.position.y - boneWorldY
    );

    let targetWorldRad: number;
    const isBigCannon = this.activeCannonBone === EchoBone.InnerCannon1;
    if (isBigCannon) {
      targetWorldRad = calculateProjectileAngleToInterncept(
        relativePos,
        this.projectileSpeed
      );
    } else {
      targetWorldRad = Math.atan2(relativePos.y, relativePos.x);
    }

    // Extract parent's world rotation from its transform matrix
    const parent = bone.parent;
    const parentWorldRad = Math.atan2(parent.c, parent.a);

    const targetLocalDeg = ((targetWorldRad - parentWorldRad) * 180) / Math.PI;

    // Lerp from current rotation toward target for smooth tracking
    let delta = targetLocalDeg - bone.rotation;
    // Normalize to [-180, 180] to avoid spinning the long way around
    while (delta > 180) delta -= 360;
    while (delta < -180) delta += 360;
    bone.rotation += delta * AIM_LERP_FACTOR;
  }

  /**
   * Choose between BigCannonShootUp/Front/Down based on the gravity-aware
   * firing angle to the player.
   */
  pickBigCannonAnimation(): string {
    const player = this.findPlayer();
    if (!player) return EchoAnimation.BigCannonShootFront;

    const bone = this.threeSpine.skeleton.findBone(EchoBone.InnerCannon1);
    if (!bone) return EchoAnimation.BigCannonShootFront;

    const meshScale = this.threeSpine.mesh.scale.x;
    const pos = this.getPosition();
    const boneWorldX = bone.worldX * meshScale + pos.x;
    const boneWorldY = bone.worldY * meshScale + pos.y;

    const relativePos = new Vector2(
      player.position.x - boneWorldX,
      player.position.y - boneWorldY
    );

    const angle = calculateProjectileAngleToInterncept(
      relativePos,
      this.projectileSpeed
    );

    // Use the gravity-compensated angle, falling back to direct aim
    const rad =
      angle !== null && !isNaN(angle)
        ? angle
        : Math.atan2(relativePos.y, relativePos.x);

    // Convert to elevation angle (deviation from horizontal), independent of
    // facing direction. atan2(sin, |cos|) gives elevation in [-90, 90].
    const elevationDeg =
      (Math.atan2(Math.sin(rad), Math.abs(Math.cos(rad))) * 180) / Math.PI;

    // Thresholds: >25 elevation = up, <-25 = down, otherwise front
    if (elevationDeg > 25) return EchoAnimation.BigCannonShootUp;
    if (elevationDeg < -25) return EchoAnimation.BigCannonShootDown;
    return EchoAnimation.BigCannonShootFront;
  }
}
