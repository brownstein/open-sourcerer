import { ThreeSpineRegionOverrider } from "src/engine/spine/ThreeSpine";

export const gaianRegionOverrides: ThreeSpineRegionOverrider = (
  aName,
  aPos,
  aSize
) => {
  switch (aName) {
    case "Right Arm/right_hand_1":
      aPos.x -= 10;
      aSize.x *= 0.75;
      aSize.y *= 0.8;
      return;
    case "Left arm/left_hand_1":
    case "Left arm/left_hand_2":
      aPos.x -= 16;
      aSize.x *= 0.7;
      aSize.y *= 0.8;
      return;
    default:
      return;
  }
};
