uniform float uPhase;
uniform float uStrength;

varying vec2 vUv;

void main() {
  float dist = length(vUv) * 2.0;
  float falloff = smoothstep(1.0, 0.0, dist);
  falloff *= falloff * falloff;
  float shimmer = 0.85 + 0.15 * sin(uPhase * 3.2) * sin(uPhase * 1.3 + 1.0);
  float alpha = uStrength * shimmer * falloff;
  if (alpha < 0.004) discard;
  gl_FragColor = vec4(1.0, 1.0, 1.0, alpha);
  #include <tonemapping_fragment>
}
