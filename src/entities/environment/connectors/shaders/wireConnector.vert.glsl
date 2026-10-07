uniform float thickness;

attribute vec3 vtxNormalMiter;
attribute float vtxDistance;

varying vec2 vUv;
varying float vDistance;

void main() {
  vUv = uv;
  vDistance = vtxDistance;
  vec2 lineNormal = vtxNormalMiter.xy;
  float lineMiter = vtxNormalMiter.z;
  vec3 pointPos = position.xyz + vec3(lineNormal * thickness * lineMiter / 2.0, 0.0);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pointPos, 1.0);
}