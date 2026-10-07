uniform float opacity;
uniform sampler2D map;
uniform vec4 fade;

varying float vOpacity;
varying vec2 vUv;

void main() {
  vec4 color = texture2D(map, vUv);
  if (fade.w > 0.0f) {
    color.rgb *= (1.0f - fade.w);
    color.rgb += fade.rgb * fade.w;
  }
  color.a *= opacity * vOpacity;
  if (color.a < 0.01) discard;
  gl_FragColor = color;
}