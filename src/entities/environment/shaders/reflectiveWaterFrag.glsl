uniform float phase;
uniform sampler2D map;

varying vec2 vUvOrig;
varying vec2 vUvMap;

void main() {
  vec2 vUvMapped = vUvMap;
  vUvMapped.y += ((1.25 - vUvOrig.y) * 2.0) * cos(phase * 0.005f + sin(vUvOrig.x * 64.0f) + cos(vUvOrig.y * 64.0 + phase * 0.001f)) * 0.05f;
  vec4 color = texture2D(map, vUvMapped);
  color.a *= 0.8f;
  float fadedReflectivity = vUvOrig.y * 0.6f;
  if (fadedReflectivity < 0.0f) fadedReflectivity = 0.0f;
  if (fadedReflectivity > 1.0f) fadedReflectivity = 1.0f;
  color.rgb *= 0.9f * fadedReflectivity;
  gl_FragColor = color;
}