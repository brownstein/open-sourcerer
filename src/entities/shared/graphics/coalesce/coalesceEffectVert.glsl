attribute float vtxOpacity;

varying float vOpacity;
varying vec2 vUv;

void main() {
  vOpacity = vtxOpacity;
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position.xyz, 1.0);
}
