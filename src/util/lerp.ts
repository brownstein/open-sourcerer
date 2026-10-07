export function lerpAngle(a1: number, a2: number, amount: number) {
  let diff = a2 - a1;
  if (diff > Math.PI) {
    diff -= Math.PI * 2;
  }
  if (diff < -Math.PI) {
    diff += Math.PI * 2;
  }
  return (Math.PI * 2 + a1 + diff * amount) % (Math.PI * 2);
}

export function diffAngle(a1: number, a2: number) {
  let diff = a2 - a1;
  while (diff > Math.PI) {
    diff -= Math.PI * 2;
  }
  while (diff < -Math.PI) {
    diff += Math.PI * 2;
  }
  return diff;
}

export function angleFrom0(angle: number) {
  return ((angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
}
