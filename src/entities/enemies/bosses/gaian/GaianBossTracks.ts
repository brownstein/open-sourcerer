import { Bone, Event, MixBlend, MixDirection, Skeleton, Vector2 as SpineVector2, Timeline } from "@esotericsoftware/spine-core";
import { Vector2 } from "three";

export type BonePose2D = {
  rotation: number;
  position: Vector2;
};

export class GaianKnockBackTimeline extends Timeline {
  public forwardTilt = 0;
  public headTilt = 0;
  public leftShoulderConstrained = true;

  private headBone?: Bone;
  private neckBone?: Bone;
  private chestBone?: Bone;
  private leftShoulderBone?: Bone;
  private leftShoulderBoneInitialPose?: BonePose2D;

  constructor(frameCount: number) {
    super(frameCount, []);
  }

  setup(skeleton: Skeleton) {
    this.headBone = skeleton.findBone("head") ?? undefined;
    this.neckBone = skeleton.findBone("neck") ?? undefined;
    this.chestBone = skeleton.findBone("chest") ?? undefined;
    this.leftShoulderBone = skeleton.findBone("left_shoulder") ?? undefined;
    if (this.leftShoulderBone) {
      this.leftShoulderBoneInitialPose = this.getBonePose(
        this.leftShoulderBone
      );
    }
    return this;
  }

  private getBonePose(bone: Bone): BonePose2D {
    const currentPosition = bone.localToWorld(new SpineVector2());
    const currentRotation = bone.localToWorldRotation(0);
    return {
      position: new Vector2(currentPosition.x, currentPosition.y),
      rotation: currentRotation
    };
  }

  apply(
    skeleton: Skeleton,
    lastTime: number,
    time: number,
    events: Array<Event> | null,
    alpha: number,
    blend: MixBlend,
    direction: MixDirection
  ) {
    const {
      headBone,
      neckBone,
      chestBone,
      leftShoulderConstrained,
      leftShoulderBone,
      leftShoulderBoneInitialPose
    } = this;
    if (
      !headBone ||
      !neckBone ||
      !chestBone ||
      !leftShoulderBone ||
      !leftShoulderBoneInitialPose
    )
      return;
    headBone.rotation += (this.headTilt * 0.5 * 180) / Math.PI;
    neckBone.rotation += (this.headTilt * 0.5 * 180) / Math.PI;
    const chestBoneRotation = (this.forwardTilt * 0.5 * 180) / Math.PI;
    chestBone.rotation += chestBoneRotation;
    chestBone.updateWorldTransform();
    if (leftShoulderConstrained) {
      const leftShoulderOffsetRaw = leftShoulderBone.parent?.worldToLocal(
        leftShoulderBoneInitialPose.position.clone()
      );
      if (leftShoulderOffsetRaw) {
        leftShoulderBone.x = leftShoulderOffsetRaw.x;
        leftShoulderBone.y = leftShoulderOffsetRaw.y;
      }
      leftShoulderBone.rotation -= chestBoneRotation;
    }
  }
}
