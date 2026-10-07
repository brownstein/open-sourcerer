export type DebugRay = {
  origin: { x: number; y: number };
  direction: { x: number; y: number };
  length: number;
  color?: number;
};

const debugRays: DebugRay[] = [];

export function addDebugRay(ray: DebugRay) {
  debugRays.push(ray);
}

export function consumeDebugRays(): DebugRay[] {
  const rays = debugRays.slice();
  debugRays.length = 0;
  return rays;
}
