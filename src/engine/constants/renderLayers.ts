export enum RenderLayers {
  // Default render layer. This is segmented by depth into the primary and foreground canvas.
  default = 0,
  // Displacement effects (water).
  displacement = 1,
  // Text gets its own render layer that renders at the full available resolution.
  // Perhaps we will switch to DOM-only text at some point.
  text = 2
}

export const allRenderLayers = [
  RenderLayers.default,
  RenderLayers.displacement,
  RenderLayers.text
];
