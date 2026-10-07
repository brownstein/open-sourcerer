uniform vec2 invSheetSize;
uniform vec2 scenePixelSize;
uniform float outlineThickness;
uniform vec4 outline;
uniform vec4 glow;
uniform float glowRadius;
uniform float pathMode;

attribute float vtxIndex;

varying vec2 vUv;

void main() {
  vUv = uv;

  vec3 pos = position;

  // expand the quad to make room for whichever effect reaches furthest: the
  // outline ring or the glow falloff
  float expand = 0.0;
  if (outlineThickness > 0.0 && outline.w > 0.0) {
    expand = outlineThickness;
  }
  if (glowRadius > 0.0 && glow.w > 0.0) {
    expand = max(expand, glowRadius);
  }

  if (pathMode < 0.5 && expand > 0.0) {
    vec2 delta;
    switch (int(floor(vtxIndex))) {
      case 0:
        delta.x = -1.0;
        delta.y = 1.0;
        break;
      case 1:
        delta.x = 1.0;
        delta.y = 1.0;
        break;
      case 2:
        delta.x = -1.0;
        delta.y = -1.0;
        break;
      case 3:
        delta.x = 1.0;
        delta.y = -1.0;
        break;
    }
    pos.xy += delta * scenePixelSize * expand;
    vUv.x += delta.x * invSheetSize.x * expand;
    vUv.y += delta.y * invSheetSize.y * expand;
  }

  // Apply matricies to find final triangle position.
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
