uniform vec3 multiplyColor;
uniform float opacity;
uniform sampler2D map;
uniform vec2 invSheetSize;
uniform float outlineThickness;
uniform vec4 outline;
uniform vec4 glow;
uniform float glowRadius;

varying vec2 vUv;

void main() {
  float minAlpha = 0.01;
  vec4 color = texture2D(map, vUv);
  vec2 down = vec2(0.0, invSheetSize.y);
  vec2 right = vec2(invSheetSize.x, 0.0);

  // glyph fill
  if (color.w >= minAlpha) {
    color.rgb *= multiplyColor;
    color.w *= opacity;
    if (color.w < minAlpha)
      discard;
    gl_FragColor = color;
    return;
  }

  if (outline.w > 0.0 && outlineThickness > 0.0) {
    bool isOutline = false;
    for (float dx = -outlineThickness; dx <= outlineThickness; dx += 1.0) {
      for (float dy = -outlineThickness; dy <= outlineThickness; dy += 1.0) {
        if (texture2D(map, vUv + down * dy + right * dx).w > minAlpha) {
          isOutline = true;
          break;
        }
      }
      if (isOutline)
        break;
    }
    if (isOutline) {
      gl_FragColor = vec4(outline.rgb, outline.w * opacity);
      return;
    }
  }

  if (glow.w > 0.0 && glowRadius > 0.0) {
    const int GLOW_STEPS = 8;
    float glowStep = glowRadius / float(GLOW_STEPS);
    float sigma = glowRadius * 0.5;
    float twoSigmaSq = 2.0 * sigma * sigma;
    float radiusSq = glowRadius * glowRadius;
    float accum = 0.0;
    float norm = 0.0;
    for (int ix = -GLOW_STEPS; ix <= GLOW_STEPS; ix += 1) {
      for (int iy = -GLOW_STEPS; iy <= GLOW_STEPS; iy += 1) {
        vec2 offset = vec2(float(ix), float(iy)) * glowStep;
        float distSq = dot(offset, offset);
        if (distSq > radiusSq)
          continue;
        float weight = exp(-distSq / twoSigmaSq);
        norm += weight;
        accum +=
          texture2D(map, vUv + right * offset.x + down * offset.y).w * weight;
      }
    }
    float coverage = accum / max(norm, 0.0001);
    float glowAlpha = clamp(coverage * glow.w, 0.0, 1.0) * opacity;
    if (glowAlpha >= minAlpha) {
      gl_FragColor = vec4(glow.rgb, glowAlpha);
      return;
    }
  }

  discard;
}
