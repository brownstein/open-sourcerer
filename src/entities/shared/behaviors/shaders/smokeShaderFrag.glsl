uniform vec3 uOutlineColor;
uniform float uOutlineOpacity;
uniform float uUseOutline;

varying vec3 vColor;
varying float vOpacity;
varying vec2 vLocalPos;

void main() {
  vec4 baseColor = vec4(vColor, vOpacity);
  if (baseColor.a < 0.05) discard;

  if (uUseOutline > 0.5) {
    float edge = max(abs(vLocalPos.x), abs(vLocalPos.y));
    float outlineFactor = smoothstep(0.2, 0.5, edge);
    baseColor = mix(baseColor, vec4(uOutlineColor, uOutlineOpacity), outlineFactor);
  }

  gl_FragColor = baseColor;
  if (gl_FragColor.a < 0.05) discard;
  #include <tonemapping_fragment>
}