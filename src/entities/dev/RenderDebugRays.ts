import {
  BufferAttribute,
  BufferGeometry,
  Line,
  LineBasicMaterial,
  Object3D
} from "three";

import { isDevMode } from "../../../src/util/devUtil";

const debugRayMaterial = new LineBasicMaterial({
  vertexColors: true,
  linewidth: 2
});

export function renderDebugRays({
  debugRays,
  parentObject3D,
  prevLineRef
}: {
  debugRays: Array<{
    origin: { x: number; y: number };
    direction: { x: number; y: number };
    length: number;
    color?: number;
  }>;
  parentObject3D: Object3D | null | undefined;
  prevLineRef: { current?: Line };
}) {
  if (!isDevMode() || !parentObject3D) return;

  // Remove previous debug line
  if (prevLineRef.current) {
    if (prevLineRef.current.parent) {
      prevLineRef.current.parent.remove(prevLineRef.current);
    }
    prevLineRef.current.geometry.dispose();
    prevLineRef.current = undefined;
  }
  if (!debugRays.length) return;

  const z = parentObject3D.position.z ?? 0;
  const positions: number[] = [];
  const colors: number[] = [];
  for (const ray of debugRays) {
    positions.push(ray.origin.x, ray.origin.y, z);
    positions.push(
      ray.origin.x + ray.direction.x * ray.length,
      ray.origin.y + ray.direction.y * ray.length,
      z
    );
    const color = ray.color ?? 0xff2222;
    const r = ((color >> 16) & 0xff) / 255;
    const g = ((color >> 8) & 0xff) / 255;
    const b = (color & 0xff) / 255;
    colors.push(r, g, b, r, g, b);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    "position",
    new BufferAttribute(new Float32Array(positions), 3)
  );
  geometry.setAttribute(
    "color",
    new BufferAttribute(new Float32Array(colors), 3)
  );
  const line = new Line(geometry, debugRayMaterial);

  let scene = parentObject3D.parent;
  while (scene && scene.parent) {
    scene = scene.parent;
  }
  if (scene) {
    scene.add(line);
  }
  prevLineRef.current = line;
}
