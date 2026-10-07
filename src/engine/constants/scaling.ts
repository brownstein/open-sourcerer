export const kPixelScale = 32;
export const kInvPixelScale = 1 / kPixelScale;
export const kPhysicsScale = 0.6;
export const kInvPhysicsScale = 1 / kPhysicsScale;

export function roundFractionalPixels(value: number) {
  return kInvPixelScale * Math.round(value * kPixelScale);
}
