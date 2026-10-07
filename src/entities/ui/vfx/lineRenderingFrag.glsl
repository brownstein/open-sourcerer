uniform vec3 color;
uniform float opacity;
uniform float minDist;
uniform float maxDist;
uniform float offset;
uniform float thickness;

varying vec2 vUv;

void main() {
  vec2 dist = vUv;
  float chevronedDist = dist.x + abs(dist.y) * thickness * 0.5;
  if (chevronedDist < minDist || chevronedDist > maxDist) discard;
  chevronedDist -= minDist;
  float lineDMod = mod(chevronedDist * 4.0 - offset, 1.0);
  float dash = abs(lineDMod) > 0.5 ? 1.0 : 0.0;
  gl_FragColor = vec4(color, opacity * dash);
}