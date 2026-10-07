uniform sampler2D lightMask;
// Focal point in UV space — where rays radiate FROM.
// (0.5, 0.5) = center of the light mask texture.
// Flip Y relative to GameMaker coords: WebGL UV Y=0 is bottom.
uniform vec2 point;
uniform float time;

varying vec2 vUv;

void main() {
  vec4 res = vec4(0.0);
  float a = 1.0;
  // time is in ms; multiply by 0.0003 for a ~21s gentle pulse period.
  float pulse = 1.0 + sin(time * 0.0003) * 0.15;
  for (int i = 0; i < 15; i++) {
    // Each iteration samples closer to the focal point, accumulating brightness.
    a += 0.02 * pulse;
    res += texture2D(lightMask, point + (vUv - point) / a) * 0.04;
  }
  // Alpha=1 so AdditiveBlending adds the full RGB to the scene.
  gl_FragColor = vec4(res.rgb, 1.0);
}
