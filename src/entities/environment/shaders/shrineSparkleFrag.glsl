uniform float phase;

varying vec2 vUv;

float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void main() {
  float t = phase * 0.001; // time in seconds

  // Particle lifetime in seconds
  float lifetime = 2.0;

  // Grid of potential particle cells
  vec2 gridSize = vec2(60.0, 40.0);
  vec2 cellUv = vUv * gridSize;
  vec2 cellId = floor(cellUv);
  vec2 cellFrac = fract(cellUv);

  // Determine if this cell has a particle
  float cellHash = hash(cellId);
  if (cellHash > 0.95) {
    // Stagger birth times per particle using hash
    float birthOffset = hash(cellId + vec2(17.3, 31.7)) * lifetime;

    // Particle age cycles every `lifetime` seconds
    float age = mod(t + birthOffset, lifetime);
    float ageFrac = age / lifetime;

    // Fade in for first 20%, full brightness 20-70%, fade out last 30%
    float alpha = smoothstep(0.0, 0.2, ageFrac) * smoothstep(1.0, 0.7, ageFrac);

    // Random x offset within cell for variety
    float xOff = hash(cellId + vec2(5.1, 9.3)) * 0.6 - 0.3;

    // Drift downward over lifetime: start near top of cell, end near bottom
    float yStart = 0.7 + hash(cellId + vec2(3.7, 11.2)) * 0.2;
    float yPos = yStart - ageFrac * 0.5;

    // Distance from particle center
    vec2 particleCenter = vec2(0.5 + xOff, yPos);
    float dist = length(cellFrac - particleCenter);

    // Small sparkle dot
    float sparkle = smoothstep(0.08, 0.02, dist);

    // Subtle twinkle
    float twinkle = 0.7 + 0.3 * sin(t * 3.0 + cellHash * 6.28);

    float finalAlpha = sparkle * alpha * twinkle * 0.8;

    if (finalAlpha > 0.001) {
      gl_FragColor = vec4(1.0, 1.0, 1.0, finalAlpha);
      return;
    }
  }

  // Transparent where no particle
  gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
}
