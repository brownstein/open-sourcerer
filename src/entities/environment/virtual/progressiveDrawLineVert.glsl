uniform float thickness;

attribute vec2 vtxDistance;
attribute vec3 vtxNormalMiter;

varying vec2 vUv;

void main() {
  vUv = vtxDistance;
  vec2 lineNormal = vtxNormalMiter.xy;
  float lineMiter = vtxNormalMiter.z;
  vec3 pointPos = position.xyz + vec3(lineNormal * thickness / 2.0 * lineMiter, 0.0);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pointPos, 1.0);
}