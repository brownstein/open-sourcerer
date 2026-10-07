attribute float vtxOpacity;
attribute vec3 vtxColor;

varying float vOpacity;
varying vec3 vColor;

void main() {
  vOpacity = vtxOpacity;
  vColor = vtxColor;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position.xyz, 1.0);
}
