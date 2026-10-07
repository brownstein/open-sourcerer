import { Bone, Event, MixBlend, MixDirection, Skeleton, Timeline } from "@esotericsoftware/spine-core";

export type BoneState = {
  rotation: number;
};

export class UtilTimeline extends Timeline {
  public boneStates = new Map<string, BoneState>();

  constructor(frameCount: number) {
    super(frameCount, []);
  }
  apply(
    skeleton: Skeleton,
    lastTime: number,
    time: number,
    events: Array<Event> | null,
    alpha: number,
    blend: MixBlend,
    direction: MixDirection
  ): void {
    if (alpha === 0) return;
    const root = skeleton.getRootBone();
    if (root) this.recursivelyApply(root, alpha);
  }
  private recursivelyApply(bone: Bone, alpha: number) {
    const boneState = this.boneStates.get(bone.data.name);
    if (boneState) {
      let rotDelta = boneState.rotation - bone.rotation;
      rotDelta = ((rotDelta + 180) % 360) - 180;
      bone.rotation += rotDelta * alpha;
    }
    for (const child of bone.children) {
      this.recursivelyApply(child, alpha);
    }
  }
  copyState(skeleton: Skeleton, boneNameSet = new Set<string>()) {
    const root = skeleton.getRootBone();
    if (root) this.copyStateRecursively(root, boneNameSet);
  }
  private copyStateRecursively(bone: Bone, boneNameSet: Set<string>) {
    if (boneNameSet.has(bone.data.name)) {
      const extant = this.boneStates.get(bone.data.name);
      const current = extant ?? {
        rotation: bone.rotation
      };
      current.rotation = bone.rotation;
      if (!extant) this.boneStates.set(bone.data.name, current);
    }
    for (const child of bone.children) {
      this.copyStateRecursively(child, boneNameSet);
    }
  }
}
