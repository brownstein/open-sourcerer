varying vec3 vColor;
varying float vOpacity;

void main() {
  gl_FragColor = vec4(vColor, vOpacity);
  if (gl_FragColor.a < 0.05) discard;
  #include <tonemapping_fragment>
}