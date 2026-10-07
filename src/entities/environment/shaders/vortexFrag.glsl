uniform float phase;

varying vec2 vUv;

float starDist(vec2 centeredUv) {
  return 1.0 - (
    pow(abs(centeredUv.x + centeredUv.y * 0.45), 0.5)
    + pow(abs(centeredUv.x - centeredUv.y * 0.45), 0.5)
    + pow(abs(centeredUv.y), 0.5)
  );
}

vec3 starDist2(vec2 centeredUv) {
  return vec3(
    1.0 - pow(abs(centeredUv.x + centeredUv.y * 0.25), 0.5),
    1.0 - pow(abs(centeredUv.x - centeredUv.y * 0.25), 0.5),
    1.0 - pow(abs(centeredUv.y), 0.5)
  );
}

void main() {
  vec4 color = vec4(0.1f, 0.1f, 0.1f, 1.0f);
  vec2 centeredUv = vec2(vUv.x - 0.5, vUv.y - 0.5) * 2.0;
  float centerDist = sqrt(pow(centeredUv.x, 2.0) + pow(centeredUv.y, 2.0));

  vec2 sampleUv = vec2(
    0.0
    + centeredUv.x * cos(centerDist * 12.0 - phase * 0.0002) * 0.5
    - centeredUv.y * sin(centerDist * 12.0 - phase * 0.0002) * 0.5
    + cos(-phase * 0.005 + centerDist * 128.0) * 0.02
    ,
    0.0
    + centeredUv.x * sin(centerDist * 12.0 - phase * 0.0002) * 0.5
    + centeredUv.y * cos(centerDist * 12.0 - phase * 0.0002) * 0.5
    + sin(-phase * 0.005 + centerDist * 128.0) * 0.02
  );

  float brightness = 1.0;

  brightness = 1.0 + 2.75 * starDist(sampleUv);

  float remainder = brightness - 1.0;

  if (brightness < 0.0) brightness = 0.0;
  if (brightness > 1.0) brightness = 1.0;

  brightness *= 0.5;

  vec3 brightness2 = starDist2(sampleUv);

  if (remainder < 0.0) remainder = 0.0;
  if (remainder > 1.0) remainder = 1.0;

  color.r = brightness * 0.1 + brightness2.r * 0.1;
  color.g = brightness * 0.5 + 0.025 + brightness2.g * 0.1;
  color.b = brightness * 0.9 + 0.1 + brightness2.b * 0.1;

  if (color.r > 1.0) color.r = 1.0;
  if (color.g > 1.0) color.g = 1.0;
  if (color.b > 1.0) color.b = 1.0;

  color.r = color.r * (1.0 - remainder) + remainder;
  color.g = color.g * (1.0 - remainder) + remainder;
  color.b = color.b * (1.0 - remainder) + remainder;
  color.a = 1.0;

  gl_FragColor = color;
}
