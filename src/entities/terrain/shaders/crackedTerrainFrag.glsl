uniform sampler2D map;
uniform sampler2D cracks;

varying vec2 vUv;
varying vec2 vUv2;

void main() {
  vec4 color = texture2D(map, vUv);
  vec4 mult = texture2D(cracks, vUv2);
  if ((color.a > 0.01) && (mult.a > 0.01)) {
    if (mult.r < 0.5) {
      color.rgb *= vec3(0.25, 0.25, 0.25) + mult.rgb * 0.75;
    } else {
      color.rgb *= vec3(1, 1, 1) + mult.rgb * 0.5;
    }
  }
  if (color.a < 0.01) discard;
  gl_FragColor = color;
}