uniform vec3 color;
uniform float opacity;
uniform sampler2D map;

varying vec2 vUv;

void main() {
  vec4 color = vec4(color, opacity) * texture2D(map, vUv);
  if (color.a <= 0.1) discard;

  gl_FragColor = color;
}