uniform sampler2D cracks;

varying vec3 vColor;
varying float vAlpha;
varying vec2 vCrackUv;
varying float vCrackAmount;

// Overlays the crack texture multiplicatively on the cell's base (vertex)
// color. Crack strength scales with vCrackAmount (cell damage / destroy
// threshold), so cracks fade in as a cell takes damage. Mirrors the
// destructable-terrain crack shader but modulated by per-cell damage.
void main() {
  vec3 color = vColor;
  if (vCrackAmount > 0.01) {
    vec4 cr = texture2D(cracks, vCrackUv);
    if (cr.a > 0.01) {
      float k = clamp(vCrackAmount, 0.0, 1.0);
      vec3 crackMul = mix(vec3(1.0), vec3(0.25) + cr.rgb * 0.75, k);
      color *= crackMul;
    }
  }
  gl_FragColor = vec4(color, vAlpha);
}
