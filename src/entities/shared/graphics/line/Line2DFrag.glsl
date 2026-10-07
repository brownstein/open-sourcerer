varying float lineD;

uniform vec3 color;
uniform float opacity;

void main() {
  float lineDMod = mod(lineD * 5.0, 1.0);
  float dash = abs(lineDMod) > 0.5 ? 1.0 : 0.0;
  gl_FragColor = vec4(color, opacity * dash);
}