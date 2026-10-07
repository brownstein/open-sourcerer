import { Animation, SkeletonData } from "@esotericsoftware/spine-core";

/**
 * Build a copy of the named animation containing only timelines that affect
 * the given bone or any of its descendants (and their corresponding slots).
 * This lets us play the animation additively without disturbing unrelated bones.
 */
export function buildFilteredAnimation(
  skeletonData: SkeletonData,
  animName: string,
  rootBoneName: string
): Animation | undefined {
  const srcAnim = skeletonData.findAnimation(animName);
  if (!srcAnim) return undefined;

  // Collect bone indices for the root bone and all descendants.
  const boneIndices = new Set<number>();
  const bones = skeletonData.bones;
  for (let i = 0; i < bones.length; i++) {
    let bd = bones[i];
    while (bd) {
      if (bd.name === rootBoneName) {
        boneIndices.add(i);
        break;
      }
      bd = bd.parent!;
    }
  }

  // Collect slot indices whose bone is in the subtree.
  const slotIndices = new Set<number>();
  const slots = skeletonData.slots;
  for (let i = 0; i < slots.length; i++) {
    if (boneIndices.has(slots[i].boneData.index)) {
      slotIndices.add(i);
    }
  }

  // Filter timelines to those targeting the subtree.
  const filtered = srcAnim.timelines.filter((tl) => {
    if ("boneIndex" in tl && typeof (tl as any).boneIndex === "number") {
      return boneIndices.has((tl as any).boneIndex);
    }
    if ("slotIndex" in tl && typeof (tl as any).slotIndex === "number") {
      return slotIndices.has((tl as any).slotIndex);
    }
    // Exclude global timelines (DrawOrder, Event, etc.) — they'd fire
    // duplicates since the base animation on track 0 already handles them.
    return false;
  });

  return new Animation(animName + "_filtered", filtered, srcAnim.duration);
}
