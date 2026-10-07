uniform float thickness;
attribute vec3 normalMiter;
attribute float distance;

varying float lineD;

void main() {
  lineD = distance;
  vec2 lineNormal = normalMiter.xy;
  float lineMiter = normalMiter.z;
  vec3 pointPos = position.xyz + vec3(lineNormal * thickness / 2.0 * lineMiter, 0.0);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pointPos, 1.0);
}
